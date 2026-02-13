import React, { useState, useEffect } from 'react';
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
import { Plus, Edit, Trash2, Mail, Cake, X, UserPlus, FileText } from 'lucide-react';
import { format } from 'date-fns';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const clientData = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        services: formData.services,
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Client Management</h1>
          <p className="text-slate-600 mt-1">Manage your clients and track their details</p>
        </div>

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
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name *</Label>
                    <Input
                      id="company_name"
                      placeholder="ABC Enterprises"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      required
                      data-testid="client-company-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="client_type">Client Type *</Label>
                    <Select
                      value={formData.client_type}
                      onValueChange={(value) => setFormData({ ...formData, client_type: value })}
                    >
                      <SelectTrigger data-testid="client-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Company Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="company@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      data-testid="client-email-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Company Phone *</Label>
                    <Input
                      id="phone"
                      placeholder="+1234567890"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      data-testid="client-phone-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthday">Company Birthday/Anniversary</Label>
                  <Input
                    id="birthday"
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    data-testid="client-birthday-input"
                  />
                </div>
              </div>

              {/* Contact Persons */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">Contact Persons</h3>
                  <Button type="button" size="sm" onClick={addContactPerson} variant="outline">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
                {formData.contact_persons.map((contact, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <p className="text-sm font-medium text-slate-700">Contact Person #{index + 1}</p>
                      {formData.contact_persons.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeContactPerson(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        placeholder="Full Name"
                        value={contact.name}
                        onChange={(e) => updateContactPerson(index, 'name', e.target.value)}
                      />
                      <Input
                        placeholder="Designation"
                        value={contact.designation}
                        onChange={(e) => updateContactPerson(index, 'designation', e.target.value)}
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={contact.email}
                        onChange={(e) => updateContactPerson(index, 'email', e.target.value)}
                      />
                      <Input
                        placeholder="Phone"
                        value={contact.phone}
                        onChange={(e) => updateContactPerson(index, 'phone', e.target.value)}
                      />
                    </div>
                  </Card>
                ))}
              </div>

              {/* DSC Details */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">DSC Details</h3>
                  <Button type="button" size="sm" onClick={addDSC} variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Add DSC
                  </Button>
                </div>
                {formData.dsc_details.map((dsc, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <p className="text-sm font-medium text-slate-700">DSC #{index + 1}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeDSC(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        placeholder="Certificate Number"
                        value={dsc.certificate_number}
                        onChange={(e) => updateDSC(index, 'certificate_number', e.target.value)}
                      />
                      <Input
                        placeholder="Holder Name"
                        value={dsc.holder_name}
                        onChange={(e) => updateDSC(index, 'holder_name', e.target.value)}
                      />
                      <Input
                        type="date"
                        placeholder="Issue Date"
                        value={dsc.issue_date}
                        onChange={(e) => updateDSC(index, 'issue_date', e.target.value)}
                      />
                      <Input
                        type="date"
                        placeholder="Expiry Date"
                        value={dsc.expiry_date}
                        onChange={(e) => updateDSC(index, 'expiry_date', e.target.value)}
                      />
                      <Input
                        placeholder="Notes"
                        className="col-span-2"
                        value={dsc.notes}
                        onChange={(e) => updateDSC(index, 'notes', e.target.value)}
                      />
                    </div>
                  </Card>
                ))}
              </div>

              {/* Services */}
              <div className="space-y-2">
                <Label>Services *</Label>
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map(service => (
                    <Badge
                      key={service}
                      variant={formData.services.includes(service) || formData.services.some(s => s.startsWith('Other:')) && service === 'Other' ? "default" : "outline"}
                      className="cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => toggleService(service)}
                    >
                      {service}
                    </Badge>
                  ))}
                </div>
                {formData.services.includes('Other') && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Enter other service"
                      value={otherService}
                      onChange={(e) => setOtherService(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOtherService())}
                    />
                    <Button type="button" onClick={addOtherService} size="sm">Add</Button>
                  </div>
                )}
                {formData.services.filter(s => s.startsWith('Other:')).map(service => (
                  <Badge key={service} className="mr-2">
                    {service.replace('Other: ', '')}
                    <X
                      className="ml-1 h-3 w-3 cursor-pointer"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        services: prev.services.filter(s => s !== service)
                      }))}
                    />
                  </Badge>
                ))}
              </div>

              {user?.role !== 'staff' && (
                <div className="space-y-2">
                  <Label htmlFor="assigned_to">Assign To</Label>
                  <Select
                    value={formData.assigned_to}
                    onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                  >
                    <SelectTrigger data-testid="client-assign-select">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes about the client"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  data-testid="client-notes-input"
                />
              </div>

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
      </div>

      {/* Clients Grid - showing continues in next file due to size */}
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
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      {client.company_name}
                    </CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      {getClientTypeLabel(client.client_type)}
                    </p>
                  </div>
                  {client.birthday && (
                    <Cake className="h-5 w-5 text-pink-500" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    {client.contact_persons && client.contact_persons.length > 0 ? (
                      <>
                        <p className="text-sm font-medium text-slate-700">{client.contact_persons[0].name}</p>
                        <p className="text-sm text-slate-600">{client.email}</p>
                        <p className="text-sm text-slate-600">{client.phone}</p>
                        {client.contact_persons.length > 1 && (
                          <p className="text-xs text-slate-500 mt-1">+{client.contact_persons.length - 1} more contact(s)</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-slate-600">{client.email}</p>
                        <p className="text-sm text-slate-600">{client.phone}</p>
                      </>
                    )}
                  </div>

                  {client.services && client.services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {client.services.slice(0, 3).map(service => (
                        <Badge key={service} variant="secondary" className="text-xs">
                          {service.startsWith('Other:') ? service.replace('Other: ', '') : service}
                        </Badge>
                      ))}
                      {client.services.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{client.services.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {client.dsc_details && client.dsc_details.length > 0 && (
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {client.dsc_details.length} DSC Certificate(s)
                    </div>
                  )}

                  {client.assigned_to && (
                    <p className="text-xs text-slate-500">
                      Assigned to: <span className="font-medium">{getUserName(client.assigned_to)}</span>
                    </p>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    {client.birthday && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sendBirthdayEmail(client.id)}
                        className="hover:bg-pink-50 hover:text-pink-600 flex-1"
                        data-testid={`send-birthday-${client.id}`}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Birthday Wish
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(client)}
                      data-testid={`edit-client-${client.id}`}
                      className="hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {user?.role !== 'staff' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(client.id)}
                        data-testid={`delete-client-${client.id}`}
                        className="hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
