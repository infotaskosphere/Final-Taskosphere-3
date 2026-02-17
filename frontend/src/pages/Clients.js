import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Mail, Cake, X, UserPlus, FileText, Calendar } from 'lucide-react';
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

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
    email: '',
    phone: '',
    birthday: '', // now used for Date of Incorporation
    services: [],
    dsc_details: [],
    assigned_to: 'unassigned',
    notes: '',
  });

  useEffect(() => {
    fetchClients();
    if (user?.role !== 'staff') fetchUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [clients.length]);

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

  // ──────────────────────────────────────────────
  // CSV IMPORT (unchanged)
  // ──────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = [
      'company_name', 'client_type', 'email', 'phone', 'birthday',
      'contact_name_1', 'contact_designation_1', 'contact_email_1', 'contact_phone_1',
      'contact_name_2', 'contact_designation_2', 'contact_email_2', 'contact_phone_2',
      'services', 'notes'
    ];

    const csvContent = headers.join(',') + '\n' +
      '"ABC Enterprises","proprietor","company@example.com","+919876543210","2025-04-15",' +
      '"Rahul Sharma","Director","rahul@abc.com","+919812345678",' +
      '"Priya Patel","Manager","priya@abc.com","+918923456789",' +
      '"GST,Income Tax,Other: Consulting","Prefers WhatsApp"';

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
        const rows = results.data;
        let successCount = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];

          try {
            if (!row.company_name?.trim()) throw new Error('Missing company_name');
            if (!row.email?.trim()) throw new Error('Missing email');
            if (!row.phone?.trim()) throw new Error('Missing phone');

            const contact_persons = [];
            if (row.contact_name_1?.trim()) {
              contact_persons.push({
                name: row.contact_name_1.trim(),
                designation: row.contact_designation_1?.trim() || '',
                email: row.contact_email_1?.trim() || '',
                phone: row.contact_phone_1?.trim() || '',
                birthday: '' // CSV doesn't provide contact birthdays yet
              });
            }
            if (row.contact_name_2?.trim()) {
              contact_persons.push({
                name: row.contact_name_2.trim(),
                designation: row.contact_designation_2?.trim() || '',
                email: row.contact_email_2?.trim() || '',
                phone: row.contact_phone_2?.trim() || '',
                birthday: ''
              });
            }

            const services = row.services
              ? row.services.split(',').map(s => s.trim()).filter(Boolean)
              : [];

            const clientData = {
              company_name: row.company_name.trim(),
              client_type: CLIENT_TYPES.some(t => t.value === (row.client_type || '').trim())
                ? (row.client_type || '').trim()
                : 'proprietor',
              email: row.email.trim(),
              phone: row.phone.trim(),
              birthday: row.birthday?.trim() || '',
              contact_persons: contact_persons.length > 0 ? contact_persons : [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
              services,
              notes: row.notes?.trim() || '',
              assigned_to: 'unassigned',
              dsc_details: []
            };

            await api.post('/clients', clientData);
            successCount++;
          } catch (err) {
            errors.push(`Row ${i + 2}: ${err.response?.data?.detail || err.message}`);
          }
        }

        setImportLoading(false);

        if (successCount > 0) {
          toast.success(`${successCount} client(s) imported successfully!`);
          fetchClients();
        }
        if (errors.length > 0) {
          toast.error(`Import completed with ${errors.length} error(s)`);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: () => {
        setImportLoading(false);
        toast.error('Failed to read CSV file');
      }
    });
  };

  // ──────────────────────────────────────────────
  // FORM HANDLERS (mostly unchanged)
  // ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const clientData = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
      };

      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, clientData);
        toast.success('Client updated successfully!');
      } else {
        await api.post('/clients', clientData);
        toast.success('Client created successfully!');
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
      client_type: client.client_type,
      contact_persons: client.contact_persons?.length > 0
        ? client.contact_persons.map(cp => ({
            ...cp,
            birthday: cp.birthday ? format(new Date(cp.birthday), 'yyyy-MM-dd') : ''
          }))
        : [{ name: '', email: '', phone: '', designation: '', birthday: '' }],
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

  const resetForm = () => {
    setFormData({
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
    });
    setEditingClient(null);
    setOtherService('');
  };

  const toggleService = (service) => {
    if (service === 'Other' && !formData.services.includes('Other')) {
      setFormData(prev => ({ ...prev, services: [...prev.services, 'Other'] }));
    } else if (service === 'Other') {
      setFormData(prev => ({
        ...prev,
        services: prev.services.filter(s => s !== 'Other' && !s.startsWith('Other:'))
      }));
      setOtherService('');
    } else {
      setFormData(prev => ({
        ...prev,
        services: prev.services.includes(service)
          ? prev.services.filter(s => s !== service)
          : [...prev.services, service]
      }));
    }
  };

  const addOtherService = () => {
    if (otherService.trim()) {
      setFormData(prev => ({
        ...prev,
        services: [...prev.services.filter(s => s !== 'Other'), `Other: ${otherService.trim()}`]
      }));
      setOtherService('');
    }
  };

  const addContactPerson = () => {
    setFormData(prev => ({
      ...prev,
      contact_persons: [...prev.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '' }]
    }));
  };

  const removeContactPerson = (index) => {
    if (formData.contact_persons.length > 1) {
      setFormData(prev => ({
        ...prev,
        contact_persons: prev.contact_persons.filter((_, i) => i !== index)
      }));
    }
  };

  const updateContactPerson = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      contact_persons: prev.contact_persons.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    }));
  };

  // ──────────────────────────────────────────────
  // PAGINATION + AUTO NUMBERING
  // ──────────────────────────────────────────────
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentClients = clients.slice(indexOfFirstItem, indexOfLastItem);

  const totalPages = Math.ceil(clients.length / ITEMS_PER_PAGE);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const getClientNumber = (index) => {
    const globalIndex = indexOfFirstItem + index;
    return `#${String(globalIndex + 1).padStart(3, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Client Management</h1>
          <p className="text-slate-600 mt-1">Manage your clients and track their details</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={downloadTemplate}>
            <FileText className="mr-2 h-4 w-4" />
            CSV Format
          </Button>

          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
            {importLoading ? 'Importing...' : 'Add CSV'}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="mr-2 h-4 w-4" /> Add Client
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader className="pb-6 border-b">
                <DialogTitle className="text-2xl font-bold">Add New Client</DialogTitle>
                <DialogDescription>
                  Create and manage client details, contacts and services.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-8 pt-6">
                {/* Basic Information */}
                <div className="space-y-6 border rounded-lg p-6 bg-slate-50/40">
                  <div>
                    <h3 className="text-lg font-semibold">Basic Information</h3>
                    <p className="text-sm text-muted-foreground">Core company details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="required">Company Name</Label>
                      <Input
                        value={formData.company_name}
                        onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                        placeholder="ABC Enterprises"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="required">Client Type</Label>
                      <Select
                        value={formData.client_type}
                        onValueChange={v => setFormData({ ...formData, client_type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="required">Company Email</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="company@example.com"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="required">Company Phone</Label>
                      <Input
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1234567890"
                        required
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label>Date of Incorporation</Label>
                      <Input
                        type="date"
                        value={formData.birthday}
                        onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Contact Persons */}
                <div className="space-y-6 border rounded-lg p-6 bg-slate-50/40">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold">Contact Persons</h3>
                      <p className="text-sm text-muted-foreground">Manage associated contacts</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addContactPerson}>
                      + Add Contact
                    </Button>
                  </div>

                  {formData.contact_persons.map((contact, idx) => (
                    <div key={idx} className="border rounded-md p-5 bg-white relative">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium">Contact Person #{idx + 1}</h4>
                        {formData.contact_persons.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => removeContactPerson(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label>Full Name</Label>
                          <Input
                            value={contact.name}
                            onChange={e => updateContactPerson(idx, 'name', e.target.value)}
                            placeholder="Full Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Designation</Label>
                          <Input
                            value={contact.designation}
                            onChange={e => updateContactPerson(idx, 'designation', e.target.value)}
                            placeholder="Designation"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={contact.email}
                            onChange={e => updateContactPerson(idx, 'email', e.target.value)}
                            placeholder="Email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input
                            value={contact.phone}
                            onChange={e => updateContactPerson(idx, 'phone', e.target.value)}
                            placeholder="Phone"
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label>Birthday mm/dd/yyyy</Label>
                          <Input
                            type="date"
                            value={contact.birthday}
                            onChange={e => updateContactPerson(idx, 'birthday', e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground italic mt-1">
                            This will link to dashboard notification bell for upcoming birthdays.
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Services */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Services *</Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICES.map(s => (
                      <Badge
                        key={s}
                        variant={formData.services.includes(s) || formData.services.some(x => x.startsWith('Other:')) ? "default" : "outline"}
                        className="cursor-pointer px-4 py-1.5 text-sm"
                        onClick={() => toggleService(s)}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>

                  {formData.services.some(s => s.startsWith('Other:')) && (
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Specify other service"
                        value={otherService}
                        onChange={e => setOtherService(e.target.value)}
                      />
                      <Button type="button" size="sm" onClick={addOtherService}>Add</Button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.services.filter(s => s.startsWith('Other:')).map((s, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1">
                        {s.replace('Other: ', '')}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => setFormData(p => ({
                            ...p,
                            services: p.services.filter(x => x !== s)
                          }))}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Assign To + Notes */}
                {user?.role !== 'staff' && (
                  <div className="space-y-2">
                    <Label>Assign To</Label>
                    <Select
                      value={formData.assigned_to}
                      onValueChange={v => setFormData({ ...formData, assigned_to: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
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
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about the client"
                    rows={4}
                  />
                </div>

                <DialogFooter className="pt-6 border-t">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Hidden file input for CSV */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleImportCSV}
        style={{ display: 'none' }}
      />

      {/* Clients Grid with Pagination & Auto-numbering */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {currentClients.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              No clients found. Add your first client!
            </CardContent>
          </Card>
        ) : (
          currentClients.map((client, idx) => (
            <Card key={client.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {getClientNumber(idx)} {client.company_name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {CLIENT_TYPES.find(t => t.value === client.client_type)?.label || client.client_type}
                    </p>
                  </div>
                  {client.birthday && <Calendar className="h-5 w-5 text-blue-500" />}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-sm">
                {/* contact info, services, assigned_to, actions – same as your original */}
                {/* ... keep your existing card content logic here ... */}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {clients.length > ITEMS_PER_PAGE && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => paginate(currentPage - 1)}
          >
            Previous
          </Button>

          <span className="text-sm text-muted-foreground px-4">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => paginate(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
