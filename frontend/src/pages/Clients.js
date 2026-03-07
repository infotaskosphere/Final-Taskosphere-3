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
  Briefcase, BarChart3, Archive, MessageCircle, Trash,
  CheckCircle2, AlertCircle, Building2, ChevronDown, ChevronUp,
  LayoutGrid, List, Phone, MapPin, User, FileCheck,
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, FixedSizeList } from 'react-window';

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

const TYPE_CONFIG = {
  pvt_ltd:     { label: 'Pvt Ltd',     bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#2563EB', accent: 'from-blue-600 to-blue-800',     strip: '#2563EB' },
  llp:         { label: 'LLP',         bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED', accent: 'from-violet-600 to-violet-800',  strip: '#7C3AED' },
  partnership: { label: 'Partnership', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: '#D97706', accent: 'from-amber-500 to-amber-700',    strip: '#D97706' },
  huf:         { label: 'HUF',         bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4', dot: '#0D9488', accent: 'from-teal-600 to-teal-800',      strip: '#0D9488' },
  trust:       { label: 'Trust',       bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', dot: '#E11D48', accent: 'from-rose-600 to-rose-800',      strip: '#E11D48' },
  proprietor:  { label: 'Proprietor',  bg: '#F8FAFC', text: '#475569', border: '#CBD5E1', dot: '#64748B', accent: 'from-slate-500 to-slate-700',    strip: '#64748B' },
};

const TYPE_BADGE = {
  pvt_ltd:     'bg-blue-50 text-blue-700 border-blue-200',
  llp:         'bg-violet-50 text-violet-700 border-violet-200',
  partnership: 'bg-amber-50 text-amber-700 border-amber-200',
  huf:         'bg-teal-50 text-teal-700 border-teal-200',
  trust:       'bg-rose-50 text-rose-700 border-rose-200',
  proprietor:  'bg-slate-50 text-slate-600 border-slate-200',
};

const AVATAR_GRADIENTS = [
  ['#0D3B66', '#1F6FB2'], ['#065f46', '#059669'], ['#7c2d12', '#ea580c'],
  ['#4c1d95', '#7c3aed'], ['#1e3a5f', '#2563eb'], ['#831843', '#db2777'],
  ['#134e4a', '#0d9488'], ['#1e1b4b', '#4f46e5'],
];
const getAvatarGradient = (name = '') => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADIENTS[idx][0]}, ${AVATAR_GRADIENTS[idx][1]})`;
};

const SectionHeading = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
      style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
      {icon}
    </div>
    <div>
      <h3 className="text-base font-semibold text-slate-800 leading-tight">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const TypePill = ({ type }) => {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.proprietor;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border tracking-wide"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  );
};

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
  const [previewData, setPreviewData] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mdsPreviewOpen, setMdsPreviewOpen] = useState(false);
  const [mdsPreviewLoading, setMdsPreviewLoading] = useState(false);
  const [mdsData, setMdsData] = useState(null);
  const [mdsForm, setMdsForm] = useState(null);
  const [mdsRawInfoOpen, setMdsRawInfoOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  const [viewMode, setViewMode] = useState('board');
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
    email: '',
    phone: '',
    birthday: '',
    address: '',
    city: '',
    state: '',
    services: [],
    dsc_details: [],
    assigned_to: 'unassigned',
    notes: '',
    status: 'active',
  });
  const [formErrors, setFormErrors] = useState({});
  const [contactErrors, setContactErrors] = useState([]);

  const safeDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return null;
    const date = new Date(dateStr.trim());
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  };

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

  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone?.replace(/\D/g, '') || '';
    const message = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

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

  const getClientNumber = (index) => String(index + 1).padStart(3, '0');

  const validateForm = () => {
    const errors = {};
    const cErrors = [];
    if (!formData.company_name?.trim() || formData.company_name.trim().length < 2) {
      errors.company_name = 'Company name must be at least 2 characters';
    }
    const trimmedEmail = formData.email?.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (!cleanPhone) {
      errors.phone = 'Phone number is required';
    } else if (cleanPhone.length !== 10) {
      errors.phone = 'Phone number must be exactly 10 digits';
    }
    if (formData.services.length === 0) {
      errors.services = 'At least one service must be selected';
    }
    let hasValidContact = false;
    formData.contact_persons.forEach((cp, idx) => {
      const contactErr = {};
      const trimmedName = cp.name?.trim();
      if (!trimmedName) {
        if (cp.email?.trim() || cp.phone?.trim() || cp.designation?.trim() || cp.birthday || cp.din?.trim()) {
          contactErr.name = 'Contact name is required';
        }
      } else {
        hasValidContact = true;
      }
      if (cp.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cp.email.trim())) {
        contactErr.email = 'Invalid email format';
      }
      const cCleanPhone = cp.phone ? cp.phone.replace(/\D/g, '') : '';
      if (cCleanPhone && cCleanPhone.length !== 10) {
        contactErr.phone = 'Phone must be 10 digits';
      }
      if (Object.keys(contactErr).length > 0) {
        cErrors[idx] = contactErr;
      }
    });
    if (!hasValidContact) {
      errors.contacts = 'At least one contact person with a valid name is required';
    }
    const allEmails = new Set();
    if (trimmedEmail) allEmails.add(trimmedEmail.toLowerCase());
    formData.contact_persons.forEach(cp => {
      if (cp.email?.trim()) allEmails.add(cp.email.trim().toLowerCase());
    });
    if (allEmails.size !== (trimmedEmail ? 1 : 0) + formData.contact_persons.filter(cp => cp.email?.trim()).length) {
      errors.email = (errors.email || '') + ' (duplicate email detected)';
    }
    setFormErrors(errors);
    setContactErrors(cErrors);
    return Object.keys(errors).length === 0 && cErrors.length === 0;
  };

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

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportLoading(true);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    try {
      const response = await api.post('/clients/import', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(response.data.message || `${response.data.clients_created || 0} clients imported!`);
      fetchClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Import failed');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = '';

    setMdsPreviewLoading(true);
    setMdsPreviewOpen(true);
    setMdsData(null);
    setMdsForm(null);

    const formPayload = new FormData();
    formPayload.append('file', file);

    try {
      const response = await api.post('/clients/parse-mds-excel', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;
      
      let address = (data.address || data.registered_address || '').trim();
      let city = (data.city || '').trim();
      let state = (data.state || '').trim();
      
      if (address && (!city || !state)) {
        const addressParts = address.split(',').map(p => p.trim()).filter(p => p);
        if (addressParts.length > 0) {
          if (!state && addressParts.length >= 2) {
            state = addressParts[addressParts.length - 2] || '';
          }
          if (!city && addressParts.length >= 3) {
            city = addressParts[addressParts.length - 3] || '';
          }
        }
      }
      
      setMdsData(data);

      const contacts = (data.contact_persons || []).map(cp => ({
        name: cp.name || '',
        designation: cp.designation || '',
        email: cp.email || '',
        phone: cp.phone || '',
        birthday: cp.birthday || '',
        din: cp.din || '',
      }));
      if (contacts.length === 0) {
        contacts.push({ name: '', designation: '', email: '', phone: '', birthday: '', din: '' });
      }

      setMdsForm({
        company_name: (data.company_name || '').trim(),
        client_type: data.client_type || 'proprietor',
        email: (data.email || '').trim(),
        phone: (data.phone || '').trim(),
        birthday: data.birthday || '',
        address: address,
        city: city,
        state: state,
        services: data.services || [],
        notes: (data.notes || '').trim(),
        status: data.status_value || 'active',
        contact_persons: contacts,
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse Excel file');
      setMdsPreviewOpen(false);
    } finally {
      setMdsPreviewLoading(false);
    }
  };

  const handleMdsConfirm = async (saveDirectly = false) => {
    if (!mdsForm) return;

    if (saveDirectly) {
      setImportLoading(true);
      try {
        const contacts = mdsForm.contact_persons
          .filter(cp => cp.name?.trim())
          .map(cp => ({
            name: cp.name.trim(),
            designation: cp.designation?.trim() || null,
            email: cp.email?.trim() || null,
            phone: cp.phone?.replace(/\D/g, '') || null,
            birthday: cp.birthday ? cp.birthday : null,
            din: cp.din?.trim() || null,
          }));

        const payload = {
          company_name: mdsForm.company_name?.trim() || '',
          client_type: mdsForm.client_type || 'proprietor',
          email: mdsForm.email?.trim() || '',
          phone: mdsForm.phone?.replace(/\D/g, '') || '',
          birthday: mdsForm.birthday || null,
          address: mdsForm.address?.trim() || null,
          city: mdsForm.city?.trim() || null,
          state: mdsForm.state?.trim() || null,
          services: mdsForm.services || [],
          notes: mdsForm.notes?.trim() || null,
          status: mdsForm.status || 'active',
          contact_persons: contacts,
          dsc_details: [],
          assigned_to: null,
        };

        const response = await api.post('/clients', payload);
        toast.success(`Client "${mdsForm.company_name}" saved successfully!`);
        fetchClients();
        setMdsPreviewOpen(false);
        setMdsData(null);
        setMdsForm(null);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to save client');
      } finally {
        setImportLoading(false);
      }
    } else {
      setFormData({
        company_name: mdsForm.company_name || '',
        client_type: mdsForm.client_type || 'proprietor',
        email: mdsForm.email || '',
        phone: mdsForm.phone || '',
        birthday: mdsForm.birthday || '',
        address: mdsForm.address || '',
        city: mdsForm.city || '',
        state: mdsForm.state || '',
        services: mdsForm.services || [],
        notes: mdsForm.notes || '',
        status: mdsForm.status || 'active',
        contact_persons: mdsForm.contact_persons.length > 0
          ? mdsForm.contact_persons
          : [{ name: '', designation: '', email: '', phone: '', birthday: '', din: '' }],
        dsc_details: [],
        assigned_to: 'unassigned',
      });
      setEditingClient(null);
      setFormErrors({});
      setContactErrors([]);
      setMdsPreviewOpen(false);
      setDialogOpen(true);
      toast.info('Form pre-filled from Excel — review and save when ready.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = validateForm();
    if (!isValid) { toast.error('Please fix the highlighted errors before saving'); return; }
    setLoading(true);
    try {
      let finalServices = [...formData.services];
      finalServices = finalServices.filter(s => !s.startsWith("Other:"));
      if (otherService.trim() && formData.services.includes("Other")) {
        finalServices.push(`Other: ${otherService.trim()}`);
      }
      const cleanPhone = formData.phone.replace(/\D/g, "");
      const cleanedContacts = formData.contact_persons.map(cp => ({
        name: cp.name || "", designation: cp.designation?.trim() || null,
        email: cp.email?.trim() ? cp.email.trim() : null,
        phone: cp.phone ? cp.phone.replace(/\D/g, "") : null,
        birthday: safeDate(cp.birthday), din: cp.din?.trim() || null
      }));
      const cleanedDSC = formData.dsc_details.map(dsc => ({
        certificate_number: dsc.certificate_number?.trim() || "",
        holder_name: dsc.holder_name?.trim() || "",
        issue_date: safeDate(dsc.issue_date), expiry_date: safeDate(dsc.expiry_date),
        notes: dsc.notes?.trim() || null
      }));
      const payload = {
        company_name: formData.company_name.trim(), client_type: formData.client_type,
        email: formData.email?.trim(), phone: cleanPhone,
        birthday: safeDate(formData.birthday),
        address: formData.address?.trim() || null,
        city: formData.city?.trim() || null,
        state: formData.state?.trim() || null,
        services: finalServices,
        notes: formData.notes?.trim() || null,
        assigned_to: formData.assigned_to === "unassigned" ? null : formData.assigned_to,
        status: formData.status, contact_persons: cleanedContacts, dsc_details: cleanedDSC
      };
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
      } else {
        await api.post("/clients", payload);
      }
      setDialogOpen(false); resetForm(); fetchClients();
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
        ...cp, birthday: cp?.birthday ? format(new Date(cp.birthday), 'yyyy-MM-dd') : '', din: cp?.din || ''
      })) || [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      birthday: client?.birthday ? format(new Date(client.birthday), 'yyyy-MM-dd') : '',
      dsc_details: client?.dsc_details?.map(d => ({
        ...d,
        issue_date: d?.issue_date ? format(new Date(d.issue_date), 'yyyy-MM-dd') : '',
        expiry_date: d?.expiry_date ? format(new Date(d.expiry_date), 'yyyy-MM-dd') : '',
      })) || [],
      status: client?.status || 'active', assigned_to: client?.assigned_to || 'unassigned',
    });
    const other = client?.services?.find(s => s.startsWith('Other: '));
    setOtherService(other ? other.replace('Other: ', '') : '');
    setDialogOpen(true);
    setFormErrors({}); setContactErrors([]);
  };

  const resetForm = () => {
    setFormData({
      company_name: '', client_type: 'proprietor',
      contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      email: '', phone: '', birthday: '', address: '', city: '', state: '', services: [], dsc_details: [],
      assigned_to: 'unassigned', notes: '', status: 'active'
    });
    setOtherService(''); setEditingClient(null); setFormErrors({}); setContactErrors([]);
  };

  useEffect(() => {
    if (!dialogOpen) { setFormErrors({}); setContactErrors([]); }
  }, [dialogOpen]);

  const updateContact = (idx, field, val) => {
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.map((c, i) => i === idx ? { ...c, [field]: val } : c)
    }));
    if (contactErrors[idx] && contactErrors[idx][field]) {
      const newCerr = [...contactErrors];
      if (newCerr[idx]) delete newCerr[idx][field];
      if (Object.keys(newCerr[idx] || {}).length === 0) newCerr[idx] = undefined;
      setContactErrors(newCerr);
    }
  };

  const addContact = () => setFormData(p => ({
    ...p, contact_persons: [...p.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }]
  }));
  const removeContact = (idx) => setFormData(p => ({
    ...p, contact_persons: p.contact_persons.filter((_, i) => i !== idx)
  }));
  const updateDSC = (idx, field, val) => setFormData(p => ({
    ...p, dsc_details: p.dsc_details.map((d, i) => i === idx ? { ...d, [field]: val } : d)
  }));
  const addDSC = () => setFormData(p => ({
    ...p, dsc_details: [...p.dsc_details, { certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: '' }]
  }));
  const removeDSC = (idx) => setFormData(p => ({
    ...p, dsc_details: p.dsc_details.filter((_, i) => i !== idx)
  }));

  const toggleService = (s) => {
    setFormData(p => {
      const services = p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s];
      return { ...p, services };
    });
    if (formErrors.services) setFormErrors(prev => ({ ...prev, services: undefined }));
  };

  const addOtherService = () => {
    if (otherService.trim()) {
      setFormData(prev => ({
        ...prev,
        services: [...prev.services.filter(s => !s.startsWith('Other:')), `Other: ${otherService.trim()}`]
      }));
      setOtherService('');
    }
  };

  const detectClientTypeFromName = (name = '') => {
    const lower = name.toLowerCase().trim();
    const normalized = lower.replace(/\s+/g, ' ');
    if (normalized.includes('private limited') || normalized.includes('pvt ltd') || normalized.includes('pvt. ltd') || normalized.includes('pvt limited')) return 'pvt_ltd';
    if (normalized.includes('limited liability partnership') || normalized.includes('llp')) return 'llp';
    if (normalized.endsWith(' ltd') || normalized.endsWith(' limited') || normalized.includes(' ltd ') || normalized.includes(' limited ')) return 'pvt_ltd';
    if (normalized.includes('partnership')) return 'partnership';
    if (normalized.includes('huf')) return 'huf';
    if (normalized.includes('trust')) return 'trust';
    return 'proprietor';
  };

  // ── REDESIGNED: Compact Board Card — no blank space, all info visible ──
  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (index >= filteredClients.length || !client) return null;

    const cfg = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
    const avatarGrad = getAvatarGradient(client.company_name);
    const serviceCount = client.services?.length || 0;
    const isArchived = client.status === 'inactive';
    const primaryContact = client.contact_persons?.find(cp => cp.name?.trim());
    const assignedUser = users.find(u => u.id === client.assigned_to);
    // Build a short location string
    const locationStr = [client.city, client.state].filter(Boolean).join(', ');
    // Truncated address for display (first 40 chars)
    const addressShort = client.address
      ? (client.address.length > 42 ? client.address.substring(0, 42) + '…' : client.address)
      : '';

    return (
      <div style={style} className="p-2 box-border">
        <div
          className={`h-full w-full bg-white rounded-2xl overflow-hidden flex flex-col group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${isArchived ? 'opacity-60' : ''}`}
          style={{ border: `1px solid ${cfg.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}
        >
          {/* Colored top strip */}
          <div className="h-[5px] w-full flex-shrink-0" style={{ backgroundColor: cfg.strip }} />

          {/* ── CARD BODY ── tight padding, dense layout */}
          <div className="flex flex-col p-3 gap-2 overflow-hidden flex-1">

            {/* Row 1: Avatar + Company name + Type pill */}
            <div className="flex items-start gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                style={{ background: avatarGrad }}
              >
                {client.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap mb-0.5">
                  <span className="text-[9px] font-mono text-slate-300">#{getClientNumber(index)}</span>
                  {isArchived && (
                    <span className="text-[8px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      Archived
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-[13px] leading-tight text-slate-900 line-clamp-2 break-words">
                  {client.company_name}
                </h3>
              </div>
              <TypePill type={client.client_type} />
            </div>

            {/* Divider */}
            <div className="h-px w-full" style={{ backgroundColor: cfg.border }} />

            {/* Row 2: Contact info block — phone, email, location, assignee */}
            <div className="flex flex-col gap-1">
              {/* Primary contact person name + designation */}
              {primaryContact?.name && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700 font-semibold">
                  <User className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate">
                    {primaryContact.name}
                    {primaryContact.designation && (
                      <span className="text-slate-400 font-normal"> · {primaryContact.designation}</span>
                    )}
                  </span>
                </div>
              )}

              {/* Phone */}
              {client.phone && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                  <Phone className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate font-medium">{client.phone}</span>
                </div>
              )}

              {/* Email */}
              {client.email && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Mail className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{client.email}</span>
                </div>
              )}

              {/* Address (city+state preferred, fall back to address snippet) */}
              {(locationStr || addressShort) && (
                <div className="flex items-start gap-1.5 text-[10px] text-slate-500">
                  <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{locationStr || addressShort}</span>
                </div>
              )}

              {/* Assigned staff */}
              {assignedUser && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <Briefcase className="h-3 w-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{assignedUser.full_name || assignedUser.name}</span>
                </div>
              )}
            </div>

            {/* Row 3: Services tags */}
            {serviceCount > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {client.services?.slice(0, 4).map((svc, i) => (
                  <span
                    key={i}
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
                    style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
                  >
                    {svc.replace('Other: ', '').substring(0, 14)}
                  </span>
                ))}
                {serviceCount > 4 && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                    +{serviceCount - 4}
                  </span>
                )}
              </div>
            )}

            {/* Row 4: Action buttons — tight, no mt-auto so no blank space */}
            <div
              className="flex items-center gap-1 pt-2 border-t"
              style={{ borderColor: cfg.border }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors text-[10px] font-semibold"
                title="WhatsApp"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors text-[10px] font-semibold"
                title="Edit"
              >
                <Edit className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              {canDeleteData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this client permanently?")) {
                      api.delete(`/clients/${client.id}`).then(() => fetchClients());
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors text-[10px] font-semibold"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── List Row (virtualized) ────────────────────────────────────────────────
  const ListRow = ({ index, style }) => {
    const client = filteredClients[index];
    if (!client) return null;
    const cfg = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
    const isArchived = client.status === 'inactive';
    const serviceCount = client.services?.length || 0;

    return (
      <div style={style} className="px-1">
        <div
          className={`flex items-center gap-4 px-5 py-3.5 bg-white border-b transition-colors hover:bg-slate-50/60 group cursor-pointer ${isArchived ? 'opacity-60' : ''}`}
          style={{ borderColor: '#F1F5F9' }}
          onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}
        >
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.strip }} />
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: getAvatarGradient(client.company_name) }}
          >
            {client.company_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="w-56 flex-shrink-0 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-300">#{getClientNumber(index)}</span>
              {isArchived && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Archived</span>}
            </div>
            <p className="text-sm font-semibold text-slate-900 truncate">{client.company_name}</p>
          </div>
          <div className="w-28 flex-shrink-0"><TypePill type={client.client_type} /></div>
          <div className="w-36 flex-shrink-0">
            <p className="text-xs text-slate-600 font-medium">{client.phone || '—'}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 truncate">{client.email || '—'}</p>
          </div>
          <div className="flex items-center gap-1 w-44 flex-shrink-0">
            {client.services?.slice(0, 2).map((svc, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
                style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
              >
                {svc.replace('Other: ', '').substring(0, 10)}
              </span>
            ))}
            {serviceCount > 2 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                +{serviceCount - 2}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors" title="WhatsApp">
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
              <Edit className="h-3.5 w-3.5" />
            </button>
            {canDeleteData && (
              <button onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this client permanently?")) {
                  api.delete(`/clients/${client.id}`).then(() => fetchClients());
                }
              }} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Client Detail Popup ───────────────────────────────────────────────────
  const ClientDetailPopup = () => {
    if (!selectedClient) return null;
    const cfg = TYPE_CONFIG[selectedClient.client_type] || TYPE_CONFIG.proprietor;
    const avatarGrad = getAvatarGradient(selectedClient.company_name);
    const assignedUser = users.find(u => u.id === selectedClient.assigned_to);

    return (
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
          <DialogTitle className="sr-only">Client Details</DialogTitle>
          <DialogDescription className="sr-only">View complete client information</DialogDescription>
          <div className="sticky top-0 z-10 bg-gradient-to-r pt-6 px-8 pb-6 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${cfg.bg}, white)` }}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-md" style={{ background: avatarGrad }}>
                {selectedClient.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedClient.company_name}</h2>
                  <TypePill type={selectedClient.client_type} />
                  {selectedClient.status === 'inactive' && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">Archived</span>
                  )}
                </div>
                {selectedClient.birthday && (
                  <p className="text-sm text-slate-500">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Established: {format(new Date(selectedClient.birthday), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-8 space-y-6">
              <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Contact Information
                </h3>
                <div className="space-y-3">
                  {selectedClient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <a href={`mailto:${selectedClient.email}`} className="text-blue-600 hover:underline text-sm">{selectedClient.email}</a>
                    </div>
                  )}
                  {selectedClient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <a href={`tel:${selectedClient.phone}`} className="text-slate-700 font-medium text-sm">{selectedClient.phone}</a>
                    </div>
                  )}
                  {selectedClient.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-slate-700 text-sm">
                        <p>{selectedClient.address}</p>
                        {(selectedClient.city || selectedClient.state) && (
                          <p className="text-slate-500 text-xs mt-1">{[selectedClient.city, selectedClient.state].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {selectedClient.services && selectedClient.services.length > 0 && (
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Services
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.services.map((svc, i) => (
                      <span key={i} className="text-xs font-semibold px-3 py-2 rounded-xl border"
                        style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                        {svc.replace('Other: ', '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedClient.contact_persons && selectedClient.contact_persons.length > 0 && (
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4" /> Contact Persons ({selectedClient.contact_persons.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.contact_persons.map((cp, i) => (
                      cp.name && (
                        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                          <p className="font-semibold text-slate-900 text-sm">{cp.name}</p>
                          {cp.designation && <p className="text-xs text-slate-500 mt-1">{cp.designation}</p>}
                          <div className="flex flex-col gap-1.5 mt-2 text-xs">
                            {cp.email && <a href={`mailto:${cp.email}`} className="text-blue-600 hover:underline">{cp.email}</a>}
                            {cp.phone && <a href={`tel:${cp.phone}`} className="text-slate-700">{cp.phone}</a>}
                            {cp.birthday && <p className="text-slate-500">DOB: {format(new Date(cp.birthday), 'MMM d, yyyy')}</p>}
                            {cp.din && <p className="text-slate-500">DIN: {cp.din}</p>}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {selectedClient.dsc_details && selectedClient.dsc_details.length > 0 && (
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" /> DSC Details ({selectedClient.dsc_details.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.dsc_details.map((dsc, i) => (
                      dsc.certificate_number && (
                        <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                          <p className="font-semibold text-slate-900 text-sm">{dsc.certificate_number}</p>
                          <p className="text-xs text-slate-500 mt-1">Holder: {dsc.holder_name}</p>
                          <div className="flex gap-4 mt-2 text-xs text-slate-600">
                            {dsc.issue_date && <p>Issued: {format(new Date(dsc.issue_date), 'MMM d, yyyy')}</p>}
                            {dsc.expiry_date && <p>Expires: {format(new Date(dsc.expiry_date), 'MMM d, yyyy')}</p>}
                          </div>
                          {dsc.notes && <p className="text-xs text-slate-500 mt-2 italic">{dsc.notes}</p>}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {assignedUser && (
                  <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">Assigned To</h3>
                    <p className="text-sm font-semibold text-slate-900">{assignedUser.full_name || assignedUser.name}</p>
                  </div>
                )}
                {selectedClient.notes && (
                  <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">Notes</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{selectedClient.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 flex items-center justify-between gap-2 p-6 bg-white border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setDetailDialogOpen(false)} className="h-10 px-5 text-sm rounded-xl text-slate-500">Close</Button>
            <div className="flex gap-2">
              <Button onClick={() => { setDetailDialogOpen(false); openWhatsApp(selectedClient.phone, selectedClient.company_name); }}
                className="h-10 px-4 text-sm rounded-xl text-white gap-2" style={{ background: '#25D366' }}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button onClick={() => { setDetailDialogOpen(false); handleEdit(selectedClient); }}
                className="h-10 px-4 text-sm rounded-xl text-white gap-2"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const fieldCls = (hasError) =>
    `h-11 bg-white rounded-xl text-sm transition-colors ${hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'}`;
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const mdsFieldCls = "h-10 bg-white rounded-xl text-sm border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors w-full px-3";

  return (
    <div className="min-h-screen p-5 md:p-7 space-y-5" style={{ background: '#F4F6FA' }}>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clients</h1>
            <p className="text-sm text-slate-500 mt-0.5">Central hub for all client relationships</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}
            className="h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl gap-2">
            <FileText className="h-4 w-4" /> CSV Template
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}
            className="h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl">
            {importLoading ? 'Importing…' : 'Import CSV'}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="h-9 px-5 text-sm rounded-xl text-white shadow-sm gap-2 font-medium"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Plus className="h-4 w-4" /> New Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-0">
              <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-bold text-slate-900 tracking-tight">
                    {editingClient ? 'Edit Client Profile' : 'New Client Profile'}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-400 mt-0.5">
                    Complete client information and preferences
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                  <Switch
                    checked={formData.status === 'active'}
                    onCheckedChange={c => setFormData({...formData, status: c ? 'active' : 'inactive'})}
                  />
                  <span className={`text-xs font-semibold ${formData.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {formData.status === 'active' ? 'Active' : 'Archived'}
                  </span>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-7">
                {/* Basic Details */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="Basic Details" subtitle="Company identity and primary contact" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
                      <Input className={fieldCls(formErrors.company_name)} value={formData.company_name}
                        onChange={e => { setFormData({...formData, company_name: e.target.value}); if (formErrors.company_name) setFormErrors(prev => ({...prev, company_name: undefined})); }} required />
                      {formErrors.company_name && <p className="text-red-500 text-xs mt-1">{formErrors.company_name}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Client Type <span className="text-red-400">*</span></label>
                      <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                        <SelectTrigger className="h-11 bg-white border-slate-200 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
                      <Input className={fieldCls(formErrors.email)} type="email" value={formData.email}
                        onChange={e => { setFormData({...formData, email: e.target.value}); if (formErrors.email) setFormErrors(prev => ({...prev, email: undefined})); }} required />
                      {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Phone Number <span className="text-red-400">*</span></label>
                      <Input className={fieldCls(formErrors.phone)} value={formData.phone}
                        onChange={e => { setFormData({...formData, phone: e.target.value}); if (formErrors.phone) setFormErrors(prev => ({...prev, phone: undefined})); }} required />
                      {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Incorporation / Birthday</label>
                      <Input className="h-11 bg-white border-slate-200 focus:border-blue-400 rounded-xl text-sm" type="date"
                        value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Address</label>
                      <Input className="h-11 bg-white border-slate-200 focus:border-blue-400 rounded-xl text-sm"
                        placeholder="Street address (optional)"
                        value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                    <div>
                      <label className={labelCls}>City</label>
                      <Input className="h-11 bg-white border-slate-200 focus:border-blue-400 rounded-xl text-sm"
                        placeholder="City (optional)"
                        value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                    </div>
                    <div>
                      <label className={labelCls}>State</label>
                      <Input className="h-11 bg-white border-slate-200 focus:border-blue-400 rounded-xl text-sm"
                        placeholder="State (optional)"
                        value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                    </div>
                  </div>
                </div>

                {/* Contact Persons */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <SectionHeading icon={<Users className="h-4 w-4" />} title="Contact Persons" subtitle="Key people you work with" />
                    <Button type="button" size="sm" onClick={addContact} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                      <Plus className="h-3 w-3 mr-1" /> Add Person
                    </Button>
                  </div>
                  {formErrors.contacts && (
                    <p className="text-red-500 text-xs mb-4 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.contacts}
                    </p>
                  )}
                  <div className="space-y-4">
                    {formData.contact_persons.map((cp, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 relative">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                            <span className="text-sm font-semibold text-slate-700">Contact Person</span>
                          </div>
                          {formData.contact_persons.length > 1 && (
                            <button type="button" onClick={() => removeContact(idx)}
                              className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls}>Full Name</label>
                            <Input value={cp.name} onChange={e => updateContact(idx, 'name', e.target.value)} className={fieldCls(contactErrors[idx]?.name)} />
                            {contactErrors[idx]?.name && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].name}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Designation</label>
                            <Input value={cp.designation} onChange={e => updateContact(idx, 'designation', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>Email</label>
                            <Input type="email" value={cp.email} onChange={e => updateContact(idx, 'email', e.target.value)} className={fieldCls(contactErrors[idx]?.email)} />
                            {contactErrors[idx]?.email && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].email}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Phone</label>
                            <Input value={cp.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className={fieldCls(contactErrors[idx]?.phone)} />
                            {contactErrors[idx]?.phone && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].phone}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Birthday</label>
                            <Input type="date" value={cp.birthday || ''} onChange={e => updateContact(idx, 'birthday', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>DIN (Director ID)</label>
                            <Input value={cp.din || ''} onChange={e => updateContact(idx, 'din', e.target.value)} className={fieldCls(false)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DSC Details */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <SectionHeading icon={<FileText className="h-4 w-4" />} title="DSC Details" subtitle="Digital Signature Certificates" />
                    <Button type="button" size="sm" onClick={addDSC} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                      <Plus className="h-3 w-3 mr-1" /> Add DSC
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {formData.dsc_details.map((dsc, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 relative">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                            <span className="text-sm font-semibold text-slate-700">DSC Certificate</span>
                          </div>
                          {formData.dsc_details.length > 1 && (
                            <button type="button" onClick={() => removeDSC(idx)}
                              className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls}>Certificate Number</label>
                            <Input value={dsc.certificate_number} onChange={e => updateDSC(idx, 'certificate_number', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>Holder Name</label>
                            <Input value={dsc.holder_name} onChange={e => updateDSC(idx, 'holder_name', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>Issue Date</label>
                            <Input type="date" value={dsc.issue_date || ''} onChange={e => updateDSC(idx, 'issue_date', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>Expiry Date</label>
                            <Input type="date" value={dsc.expiry_date || ''} onChange={e => updateDSC(idx, 'expiry_date', e.target.value)} className={fieldCls(false)} />
                          </div>
                          <div className="md:col-span-2">
                            <label className={labelCls}>Notes</label>
                            <Textarea value={dsc.notes || ''} onChange={e => updateDSC(idx, 'notes', e.target.value)}
                              className="min-h-[80px] bg-white border-slate-200 rounded-xl text-sm resize-y" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Services */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <SectionHeading icon={<BarChart3 className="h-4 w-4" />} title="Services" subtitle="Select all applicable services" />
                  {formErrors.services && (
                    <p className="text-red-500 text-xs mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.services}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {SERVICES.map(s => {
                      const isSelected = formData.services.includes(s) || (s === 'Other' && formData.services.some(x => x.startsWith('Other:')));
                      return (
                        <button key={s} type="button" onClick={() => toggleService(s)}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all ${isSelected ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                          style={isSelected ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)', borderColor: 'transparent' } : {}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {formData.services.includes('Other') && (
                    <div className="flex gap-3 items-end max-w-sm mt-4">
                      <div className="flex-1">
                        <label className={labelCls}>Specify Other Service</label>
                        <Input placeholder="e.g. IEC Registration" value={otherService}
                          onChange={e => setOtherService(e.target.value)} className="h-10 rounded-xl text-sm border-slate-200" />
                      </div>
                      <Button type="button" size="sm" onClick={addOtherService}
                        className="h-10 px-5 rounded-xl text-sm" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                        Add
                      </Button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className={labelCls}>Internal Notes</label>
                  <Textarea className="min-h-[110px] bg-white border-slate-200 rounded-xl text-sm resize-y focus:border-blue-400"
                    placeholder="Internal remarks, preferences, or special instructions…"
                    value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                </div>

                {/* Assign To */}
                {canAssignClients && (
                  <div>
                    <label className={labelCls}>Assign To Staff</label>
                    <Select value={formData.assigned_to} onValueChange={v => setFormData({...formData, assigned_to: v})}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 text-sm bg-white"><SelectValue placeholder="Select team member" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.name || u.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-slate-100">
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="h-9 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
                    <Button type="button" variant="outline" onClick={downloadTemplate} className="h-9 px-4 text-sm rounded-xl border-slate-200 text-slate-600">CSV Template</Button>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                      onClick={() => fileInputRef.current?.click()}>Import CSV</Button>
                    <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                      disabled={importLoading} onClick={() => excelInputRef.current?.click()}>Import Master Data</Button>
                    <Button type="submit" disabled={loading}
                      className="h-9 px-6 text-sm rounded-xl text-white font-semibold shadow-sm"
                      style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                      {loading ? 'Saving…' : editingClient ? 'Update Client' : 'Create Client'}
                    </Button>
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Today's Celebrations */}
      {canViewAllClients && todayReminders.length > 0 && (
        <div className="flex items-center gap-5 bg-white border border-pink-100 rounded-2xl p-5 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #fff0f6, #fff5f0)' }}>
          <div className="w-11 h-11 bg-white rounded-xl shadow-sm text-pink-500 flex items-center justify-center flex-shrink-0">
            <Cake className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-pink-900 mb-2">🎉 Today's Celebrations</p>
            <div className="flex flex-wrap gap-2">
              {todayReminders.map(c => (
                <span key={c.id} className="text-xs font-medium px-3 py-1 bg-white text-pink-700 border border-pink-200 rounded-full shadow-sm">
                  {c.company_name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {canViewAllClients && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: stats.totalClients, icon: <Users className="h-5 w-5" />, iconBg: 'rgba(13,59,102,0.1)', iconColor: '#0D3B66', accent: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' },
            { label: 'Active', value: stats.activeClients, icon: <Briefcase className="h-5 w-5" />, iconBg: 'rgba(31,175,90,0.1)', iconColor: '#1FAF5A', accent: 'linear-gradient(135deg, #065f46, #059669)' },
            { label: 'Archived', value: stats.totalClients - stats.activeClients, icon: <Archive className="h-5 w-5" />, iconBg: 'rgba(245,158,11,0.1)', iconColor: '#D97706', accent: 'linear-gradient(135deg, #92400e, #D97706)' },
            { label: 'Top Service', value: Object.entries(stats.serviceCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'N/A', icon: <BarChart3 className="h-5 w-5" />, iconBg: 'rgba(124,58,237,0.1)', iconColor: '#7c3aed', accent: 'linear-gradient(135deg, #4c1d95, #7c3aed)', isText: true },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-shadow"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div>
                <div className="w-1 h-8 rounded-full opacity-30" style={{ background: s.accent }} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
              <p className={`font-bold text-slate-900 ${s.isText ? 'text-base truncate' : 'text-3xl tracking-tight'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by company, email or phone…"
            className="pl-11 h-10 bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[120px] bg-slate-50 border-none rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-10 w-[150px] bg-slate-50 border-none rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="h-10 px-4 flex items-center bg-slate-50 rounded-xl text-xs font-semibold text-slate-500 border border-slate-100 whitespace-nowrap">
            {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center bg-slate-50 border border-slate-100 rounded-xl p-1 gap-0.5">
            <button onClick={() => setViewMode('board')}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'board' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              title="Board view"><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('list')}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
              title="List view"><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Client Grid / List ── */}
      <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm" style={{ height: '70vh', minHeight: '480px', background: 'white' }}>
        {filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-4">
              <Users className="h-7 w-7 opacity-30" />
            </div>
            <p className="text-base font-semibold text-slate-500">No clients match your filters</p>
            <p className="mt-1 text-sm text-slate-400">Try changing your search term or filters</p>
          </div>
        ) : viewMode === 'board' ? (
          /* ── Board view — rowHeight 285 (was 420) eliminates blank space ── */
          <AutoSizer>
            {({ height, width }) => {
              const CARD_MIN = 260;
              const columnCount = Math.max(1, Math.floor(width / CARD_MIN));
              const columnWidth = Math.floor(width / columnCount);
              const rowCount = Math.ceil(filteredClients.length / columnCount);
              return (
                <Grid
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  height={height}
                  rowCount={rowCount}
                  rowHeight={285}   // ← KEY FIX: was 420, reduced to 285
                  width={width}
                  overscanColumnCount={2}
                  overscanRowCount={4}
                >
                  {({ columnIndex, rowIndex, style }) => (
                    <ClientCard columnIndex={columnIndex} rowIndex={rowIndex} style={style} columnCount={columnCount} />
                  )}
                </Grid>
              );
            }}
          </AutoSizer>
        ) : (
          /* ── List view ── */
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
              <div className="w-1 flex-shrink-0" />
              <div className="w-8 flex-shrink-0" />
              <div className="w-56 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Company</div>
              <div className="w-28 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</div>
              <div className="w-36 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</div>
              <div className="flex-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Email</div>
              <div className="w-44 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Services</div>
              <div className="w-24 flex-shrink-0" />
            </div>
            <div className="flex-1">
              <AutoSizer>
                {({ height, width }) => (
                  <FixedSizeList height={height} width={width} itemCount={filteredClients.length} itemSize={56}>
                    {({ index, style }) => <ListRow index={index} style={style} />}
                  </FixedSizeList>
                )}
              </AutoSizer>
            </div>
          </div>
        )}
      </div>

      {/* Client Detail Popup */}
      <ClientDetailPopup />

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
      <input type="file" ref={excelInputRef} accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />

      {/* Generic Excel Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900">Review Excel Import</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">Preview and confirm data before bulk import</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 rounded-xl border border-slate-100">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-100">
                <tr>
                  {previewHeaders.map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                    {previewHeaders.map(header => (
                      <td key={header} className="p-2">
                        <Input value={row[header] || ''} onChange={e => {
                          const updated = [...previewData]; updated[rowIndex][header] = e.target.value; setPreviewData(updated);
                        }} className="h-8 text-xs rounded-lg border-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">{previewData.length} rows ready to import</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)} className="h-9 px-4 text-sm rounded-xl border-slate-200">Cancel</Button>
              <Button className="h-9 px-5 text-sm rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                onClick={async () => {
                  setImportLoading(true);
                  let success = 0;
                  for (let row of previewData) {
                    const exists = clients.find(c => c.company_name?.toLowerCase().trim() === row.company_name?.toLowerCase().trim());
                    if (exists) { console.log("Skipping duplicate:", row.company_name); continue; }
                    try {
                      await api.post('/clients', {
                        company_name: row.company_name?.trim(),
                        client_type: ['proprietor','pvt_ltd','llp','partnership','huf','trust','other'].includes(row.client_type) ? row.client_type : 'proprietor',
                        email: row.email?.trim(), phone: row.phone?.replace(/\D/g, ""), birthday: row.birthday || null,
                        services: row.services ? row.services.split(',').map(s => s.trim()) : [],
                        notes: row.notes?.trim() || null, assigned_to: null, contact_persons: [], dsc_details: []
                      });
                      success++;
                    } catch (err) { console.error(err); }
                  }
                  toast.success(`${success} clients imported successfully`);
                  fetchClients(); setPreviewOpen(false); setImportLoading(false);
                }}>
                Confirm & Import All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MDS Excel Smart Preview Dialog */}
      <Dialog open={mdsPreviewOpen} onOpenChange={(open) => { if (!open) { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-7 py-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">MCA / MDS Data Preview</DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Review and edit the parsed data before saving
                  {mdsData?.sheets_parsed && (
                    <span className="ml-2 text-blue-500 font-medium">
                      · {mdsData.sheets_parsed.length} sheet{mdsData.sheets_parsed.length !== 1 ? 's' : ''} parsed
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>

          {mdsPreviewLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Parsing Excel sheets…</p>
              <p className="text-xs text-slate-400">Reading company info, directors, and charges</p>
            </div>
          )}

          {!mdsPreviewLoading && mdsForm && (
            <div className="p-7 space-y-6">
              <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs"
                    style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800">Company Details</h4>
                  <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    style={mdsForm.status === 'active'
                      ? { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }
                      : { background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}>
                    {mdsForm.status === 'active' ? '● Active' : '● Archived'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Company Name</label>
                    <input className={mdsFieldCls} value={mdsForm.company_name}
                      onChange={e => setMdsForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Client Type</label>
                    <select className={`${mdsFieldCls} appearance-none`} value={mdsForm.client_type}
                      onChange={e => setMdsForm(f => ({ ...f, client_type: e.target.value }))}>
                      {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Incorporation Date</label>
                    <input type="date" className={mdsFieldCls} value={mdsForm.birthday}
                      onChange={e => setMdsForm(f => ({ ...f, birthday: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={mdsFieldCls} value={mdsForm.email}
                      onChange={e => setMdsForm(f => ({ ...f, email: e.target.value }))} placeholder="Enter email address" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input className={mdsFieldCls} value={mdsForm.phone}
                      onChange={e => setMdsForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit phone number" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Address</label>
                    <input className={mdsFieldCls} value={mdsForm.address || ''}
                      onChange={e => setMdsForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address (optional)" />
                  </div>
                  <div>
                    <label className={labelCls}>City</label>
                    <input className={mdsFieldCls} value={mdsForm.city || ''}
                      onChange={e => setMdsForm(f => ({ ...f, city: e.target.value }))} placeholder="City (optional)" />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <input className={mdsFieldCls} value={mdsForm.state || ''}
                      onChange={e => setMdsForm(f => ({ ...f, state: e.target.value }))} placeholder="State (optional)" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={labelCls}>Services (select applicable)</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SERVICES.map(s => {
                      const sel = mdsForm.services?.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => setMdsForm(f => ({
                            ...f,
                            services: sel ? f.services.filter(x => x !== s) : [...(f.services || []), s]
                          }))}
                          className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${sel ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                          style={sel ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' } : {}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs"
                      style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Directors / Contact Persons
                      <span className="ml-2 text-[10px] font-normal text-slate-400">
                        ({mdsForm.contact_persons.filter(c => c.name?.trim()).length} parsed)
                      </span>
                    </h4>
                  </div>
                  <button type="button"
                    onClick={() => setMdsForm(f => ({
                      ...f,
                      contact_persons: [...f.contact_persons, { name: '', designation: '', email: '', phone: '', birthday: '', din: '' }]
                    }))}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="space-y-3">
                  {mdsForm.contact_persons.map((cp, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                          <span className="text-xs font-semibold text-slate-600">{cp.name || `Contact ${idx + 1}`}</span>
                        </div>
                        <button type="button"
                          onClick={() => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.filter((_, i) => i !== idx) }))}
                          className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Name</label>
                          <input className={mdsFieldCls} value={cp.name}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, name: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Designation</label>
                          <input className={mdsFieldCls} value={cp.designation}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, designation: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>DIN / PAN</label>
                          <input className={mdsFieldCls} value={cp.din || ''}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, din: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Email</label>
                          <input type="email" className={mdsFieldCls} value={cp.email || ''} placeholder="Optional"
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, email: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Phone</label>
                          <input className={mdsFieldCls} value={cp.phone || ''} placeholder="Optional"
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, phone: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Birthday</label>
                          <input type="date" className={mdsFieldCls} value={cp.birthday || ''}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, birthday: e.target.value } : c) }))} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes (pre-filled from Excel)</label>
                <textarea
                  className="w-full min-h-[90px] bg-white border border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 rounded-xl text-sm p-3 resize-y outline-none transition-colors"
                  value={mdsForm.notes}
                  onChange={e => setMdsForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {mdsData?.raw_company_info && Object.keys(mdsData.raw_company_info).length > 0 && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button type="button"
                    onClick={() => setMdsRawInfoOpen(o => !o)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">Raw Excel Data</span>
                      <span className="text-[10px] text-slate-400">({Object.keys(mdsData.raw_company_info).length} fields extracted)</span>
                    </div>
                    {mdsRawInfoOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>
                  {mdsRawInfoOpen && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto bg-white">
                      {Object.entries(mdsData.raw_company_info).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50">
                          <span className="text-slate-400 font-medium min-w-[120px] flex-shrink-0">{key}</span>
                          <span className="text-slate-700 font-medium break-all">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <Button type="button" variant="ghost"
                  onClick={() => { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); }}
                  className="h-10 px-4 text-sm rounded-xl text-slate-500">
                  Cancel
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline"
                    onClick={() => handleMdsConfirm(false)}
                    className="h-10 px-5 text-sm rounded-xl border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 gap-2">
                    <Edit className="h-4 w-4" />
                    Open in Full Form
                  </Button>
                  <Button type="button" disabled={importLoading}
                    onClick={() => handleMdsConfirm(true)}
                    className="h-10 px-6 text-sm rounded-xl text-white font-semibold gap-2"
                    style={{ background: importLoading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    <CheckCircle2 className="h-4 w-4" />
                    {importLoading ? 'Saving…' : 'Save Client'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
