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
import { Progress } from '@/components/ui/progress'; // ← shadcn progress (add if missing: npx shadcn-ui@latest add progress)
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
  const [importResult, setImportResult] = useState(null); // { success, failed, errors }

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
  //                   CSV IMPORT
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
      'GST,Income Tax,Other: Consulting','Prefers WhatsApp communication'
    ];

    const csvContent = [headers.join(','), example.map(v => `"${v}"`).join(',')].join('\n');

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
    setImportProgress(0);
    setImportResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (results) => {
        if (results.errors.length > 0 && results.errors.some(e => e.type !== 'FieldMismatch')) {
          toast.error('Invalid CSV structure. Please use the template.');
          setImportLoading(false);
          return;
        }

        const rows = results.data;
        const total = rows.length;
        let processed = 0;
        const errors = [];
        const created = [];

        for (let i = 0; i < rows.length; i++) {
          processed++;
          setImportProgress(Math.round((processed / total) * 100));

          const row = rows[i];
          const rowNum = i + 2;
          const rowErrors = [];

          // Basic validation
          if (!row.company_name?.trim()) rowErrors.push('Company name required');
          if (!row.email?.trim()) rowErrors.push('Email required');
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) rowErrors.push('Invalid email');
          if (!row.phone?.trim()) rowErrors.push('Phone required');

          if (rowErrors.length > 0) {
            errors.push(`Row ${rowNum}: ${rowErrors.join(', ')} (${row.company_name || '—'})`);
            continue;
          }

          try {
            const contact_persons = [];
            if (row.contact_name_1?.trim()) {
              contact_persons.push({
                name: row.contact_name_1.trim(),
                designation: row.contact_designation_1?.trim() || '',
                email: row.contact_email_1?.trim() || '',
                phone: row.contact_phone_1?.trim() || '',
              });
            }
            if (row.contact_name_2?.trim()) {
              contact_persons.push({
                name: row.contact_name_2.trim(),
                designation: row.contact_designation_2?.trim() || '',
                email: row.contact_email_2?.trim() || '',
                phone: row.contact_phone_2?.trim() || '',
              });
            }

            const services = row.services
              ? row.services.split(',').map(s => s.trim()).filter(Boolean)
              : [];

            const clientData = {
              company_name: row.company_name.trim(),
              client_type: CLIENT_TYPES.some(t => t.value === (row.client_type || '').trim().toLowerCase())
                ? (row.client_type || '').trim().toLowerCase()
                : 'proprietor',
              email: row.email.trim(),
              phone: row.phone.trim(),
              birthday: row.birthday?.trim() || '',
              contact_persons: contact_persons.length > 0 ? contact_persons : [{ name: '', email: '', phone: '', designation: '' }],
              services,
              notes: row.notes?.trim() || '',
              assigned_to: 'unassigned',
              dsc_details: [],
            };

            await api.post('/clients', clientData);
            created.push(clientData.company_name);
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
          toast.success(`${created.length} client${created.length === 1 ? '' : 's'} imported successfully`);
          fetchClients();
        }

        if (errors.length > 0) {
          toast.warning(`${errors.length} row${errors.length === 1 ? '' : 's'} failed`);
        }
      },
      error: (err) => {
        setImportLoading(false);
        toast.error('Failed to read CSV file');
        console.error(err);
      },
    });
  };

  // ────────────────────────────────────────────────
  //               ORIGINAL FUNCTIONS (unchanged)
  // ────────────────────────────────────────────────

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
      contact_persons: client.contact_persons?.length > 0 ? client.contact_persons : [{ name: '', email: '', phone: '', designation: '' }],
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

  const handleDelete = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client?')) return;

    try {
      await api.delete(`/clients/${clientId}`);
      toast.success('Client deleted successfully!');
      fetchClients();
    } catch (error) {
      toast.error('Failed to delete client');
    }
  };

  const sendBirthdayEmail = async (clientId) => {
    try {
      await api.post(`/clients/${clientId}/send-birthday-email`);
      toast.success('Birthday email sent successfully!');
    } catch (error) {
      toast.error('Failed to send birthday email');
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
        services: [...prev.services.filter(s => s !== 'Other'), `Other: ${otherService}`]
      }));
      setOtherService('');
    }
  };

  const addContactPerson = () => {
    setFormData(prev => ({
      ...prev,
      contact_persons: [...prev.contact_persons, { name: '', email: '', phone: '', designation: '' }]
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
      contact_persons: prev.contact_persons.map((contact, i) => 
        i === index ? { ...contact, [field]: value } : contact
      )
    }));
  };

  const addDSC = () => {
    setFormData(prev => ({
      ...prev,
      dsc_details: [...prev.dsc_details, {
        certificate_number: '',
        holder_name: '',
        issue_date: '',
        expiry_date: '',
        notes: ''
      }]
    }));
  };

  const removeDSC = (index) => {
    setFormData(prev => ({
      ...prev,
      dsc_details: prev.dsc_details.filter((_, i) => i !== index)
    }));
  };

  const updateDSC = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      dsc_details: prev.dsc_details.map((dsc, i) => 
        i === index ? { ...dsc, [field]: value } : dsc
      )
    }));
  };

  const getUserName = (userId) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser?.full_name || 'Unassigned';
  };

  const getClientTypeLabel = (type) => {
    return CLIENT_TYPES.find(ct => ct.value === type)?.label || type;
  };

  return (
    <div className="space-y-6" data-testid="clients-page">
      {/* Header – original layout preserved */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Client Management</h1>
          <p className="text-slate-600 mt-1">Manage your clients and track their details</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* CSV buttons – same position as in your screenshot */}
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="border-indigo-600 text-indigo-600 hover:bg-indigo-50"
          >
            <FileText className="mr-2 h-4 w-4" />
            Download CSV Template
          </Button>

          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
          >
            {importLoading ? 'Importing...' : 'Import from CSV'}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
                data-testid="add-client-btn"
              >
                <Plus className="mr-2 h-5 w-5" />
                Add Client
              </Button>
            </DialogTrigger>

            {/* Dialog content remains EXACTLY as in your original file */}
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-outfit text-2xl">
                  {editingClient ? 'Edit Client' : 'Add New Client'}
                </DialogTitle>
                <DialogDescription>
                  {editingClient ? 'Update client details below.' : 'Fill in the details to add a new client.'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* ────────────────────────────────────────────────
                    YOUR ORIGINAL FORM CONTENT GOES HERE – DO NOT CHANGE
                    (Basic Information, Contact Persons, DSC Details, Services, Assign To, Notes)
                ──────────────────────────────────────────────── */}
                {/* ... paste your full existing form fields here ... */}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                    data-testid="client-cancel-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid="client-submit-btn"
                  >
                    {loading ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Hidden CSV file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
          />
        </div>
      </div>

      {/* Progress bar – appears below header during import */}
      {importLoading && (
        <div className="mt-4 space-y-2 max-w-md">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Processing CSV import...</span>
            <span>{importProgress}%</span>
          </div>
          <Progress value={importProgress} className="h-2" />
        </div>
      )}

      {/* Import result summary – appears after import finishes */}
      {importResult && (
        <div className="mt-6 p-4 border rounded-lg bg-slate-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium">Import Summary</h3>
            <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <p className="font-medium text-green-700">Imported successfully</p>
              <p className="text-lg font-semibold">{importResult.success}</p>
            </div>
            <div>
              <p className="font-medium text-red-700">Failed rows</p>
              <p className="text-lg font-semibold">{importResult.failed}</p>
            </div>
          </div>

          {importResult.errors?.length > 0 && (
            <div className="text-sm max-h-60 overflow-auto bg-white p-3 rounded border border-red-200">
              <ul className="list-disc pl-5 space-y-1 text-red-800">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────
          YOUR ORIGINAL CLIENTS GRID / CARDS RENDERING
          (keep exactly as in your file)
      ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.length === 0 ? (
          <Card className="col-span-full border border-slate-200">
            <CardContent className="p-12 text-center text-slate-500">
              <p>No clients found. Add your first client!</p>
            </CardContent>
          </Card>
        ) : (
          clients.map((client) => (
            <Card
              key={client.id}
              className="border border-slate-200 hover:shadow-lg transition-all duration-200 hover:-translate-y-1"
              data-testid={`client-card-${client.id}`}
            >
              {/* YOUR ORIGINAL CARD CONTENT HERE */}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
