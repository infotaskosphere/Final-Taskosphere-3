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

// ── Avatar gradient palette by first letter
const AVATAR_GRADIENTS = [
  ['#0D3B66', '#1F6FB2'], ['#065f46', '#059669'], ['#7c2d12', '#ea580c'],
  ['#4c1d95', '#7c3aed'], ['#1e3a5f', '#2563eb'], ['#831843', '#db2777'],
  ['#134e4a', '#0d9488'], ['#1e1b4b', '#4f46e5'],
];
const getAvatarGradient = (name = '') => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADIENTS[idx][0]}, ${AVATAR_GRADIENTS[idx][1]})`;
};

// ── Client type badge colors
const TYPE_BADGE = {
  pvt_ltd:     'bg-blue-50 text-blue-700 border-blue-200',
  llp:         'bg-violet-50 text-violet-700 border-violet-200',
  partnership: 'bg-amber-50 text-amber-700 border-amber-200',
  huf:         'bg-teal-50 text-teal-700 border-teal-200',
  trust:       'bg-rose-50 text-rose-700 border-rose-200',
  proprietor:  'bg-slate-50 text-slate-600 border-slate-200',
};

// ── Section heading used in dialog
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

  const handleImportExcel = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportLoading(true);
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
        const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (rawRows.length < 2) return;
        const headers = rawRows[0].map(normalizeHeader);
        for (let i = 1; i < rawRows.length; i++) {
          const rowArray = rawRows[i];
          if (rowArray.every(cell => cell === '')) continue;
          let row = {};
          headers.forEach((h, idx) => { row[h] = rowArray[idx]; });
          const companyName = row.company_name || row.companyname || row['company name'] || '';
          if (!companyName) continue;
          const detectedType = detectClientTypeFromName(companyName);
          combinedRows.push({
            sheet: sheetName, company_name: companyName,
            client_type: row.client_type || detectedType,
            email: row.email || '', phone: row.phone || '',
            birthday: row.birthday || '', services: row.services || '', notes: row.notes || ''
          });
        }
      });
      setPreviewHeaders(['sheet','company_name','client_type','email','phone','birthday','services','notes']);
      setPreviewData(combinedRows);
      setPreviewOpen(true);
      setImportLoading(false);
    };
    reader.readAsBinaryString(file);
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
        birthday: safeDate(formData.birthday), services: finalServices,
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
      email: '', phone: '', birthday: '', services: [], dsc_details: [],
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

  // ── Virtualized Client Card ─────────────────────────────────────────────
  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (index >= filteredClients.length || !client) return null;

    const typeBadgeCls = TYPE_BADGE[client.client_type] || TYPE_BADGE.proprietor;
    const avatarGrad = getAvatarGradient(client.company_name);
    const serviceCount = client.services?.length || 0;
    const contactCount = client.contact_persons?.length || 0;

    return (
      <div style={style} className="p-3 box-border">
        <div className="h-full w-full bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-xl hover:border-slate-200 hover:-translate-y-1 transition-all duration-300 group relative flex flex-col"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* Top accent bar — unique per type */}
          <div className="h-1 w-full flex-shrink-0">
            <div className="h-full w-full" style={{ background: avatarGrad }} />
          </div>

          {/* Archived badge */}
          {client.status === 'inactive' && (
            <div className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded-full z-10">
              Archived
            </div>
          )}

          <div className="p-5 flex flex-col flex-1">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-sm"
                style={{ background: avatarGrad }}>
                {client.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono text-[10px] text-slate-300 font-medium">
                    #{getClientNumber(index)}
                  </span>
                </div>
                <h3 className="font-semibold text-sm leading-snug text-slate-900 truncate pr-8">
                  {client.company_name}
                </h3>
                <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${typeBadgeCls}`}>
                  {CLIENT_TYPES.find(t => t.value === client.client_type)?.label || client.client_type}
                </span>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-2 text-xs text-slate-500 flex-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-3 w-3 text-slate-400" />
                </div>
                <span className="truncate font-medium text-slate-700">{client.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail className="h-3 w-3 text-slate-400" />
                </div>
                <span className="truncate">{client.email || '—'}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3.5 border-t border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {client.services?.slice(0, 2).map((svc, i) => (
                  <span key={i} className="text-[10px] font-medium px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-100 rounded-md">
                    {svc.replace('Other: ', '').substring(0, 12)}
                  </span>
                ))}
                {serviceCount > 2 && (
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-500 border border-blue-100 rounded-md">
                    +{serviceCount - 2}
                  </span>
                )}
              </div>

              {/* Action Buttons — shown on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={(e) => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                  title="WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
                {canDeleteData && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this client permanently?")) {
                        api.delete(`/clients/${client.id}`).then(() => fetchClients());
                      }
                    }}
                    className="w-7 h-7 flex items-center justify-center hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── INPUT / FIELD HELPERS ────────────────────────────────────────────────
  const fieldCls = (hasError) =>
    `h-11 bg-white rounded-xl text-sm transition-colors ${hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'}`;

  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-5 md:p-7 space-y-6" style={{ background: '#F4F6FA' }}>

      {/* ── Page Header ─────────────────────────────────────────────────── */}
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
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl gap-2"
          >
            <FileText className="h-4 w-4" /> CSV Template
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="h-9 px-4 text-sm border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
          >
            {importLoading ? 'Importing…' : 'Import CSV'}
          </Button>

          {/* ── New Client Dialog ─── */}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button
                className="h-9 px-5 text-sm rounded-xl text-white shadow-sm gap-2 font-medium"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
              >
                <Plus className="h-4 w-4" /> New Client
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-0">
              {/* Dialog Header Bar */}
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

                {/* ── Basic Details ── */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="Basic Details" subtitle="Company identity and primary contact" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
                      <Input
                        className={fieldCls(formErrors.company_name)}
                        value={formData.company_name}
                        onChange={e => {
                          setFormData({...formData, company_name: e.target.value});
                          if (formErrors.company_name) setFormErrors(prev => ({...prev, company_name: undefined}));
                        }}
                        required
                      />
                      {formErrors.company_name && <p className="text-red-500 text-xs mt-1">{formErrors.company_name}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Client Type <span className="text-red-400">*</span></label>
                      <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                        <SelectTrigger className="h-11 bg-white border-slate-200 rounded-xl text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
                      <Input
                        className={fieldCls(formErrors.email)}
                        type="email"
                        value={formData.email}
                        onChange={e => {
                          setFormData({...formData, email: e.target.value});
                          if (formErrors.email) setFormErrors(prev => ({...prev, email: undefined}));
                        }}
                        required
                      />
                      {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Phone Number <span className="text-red-400">*</span></label>
                      <Input
                        className={fieldCls(formErrors.phone)}
                        value={formData.phone}
                        onChange={e => {
                          setFormData({...formData, phone: e.target.value});
                          if (formErrors.phone) setFormErrors(prev => ({...prev, phone: undefined}));
                        }}
                        required
                      />
                      {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Incorporation / Birthday</label>
                      <Input
                        className="h-11 bg-white border-slate-200 focus:border-blue-400 rounded-xl text-sm"
                        type="date"
                        value={formData.birthday}
                        onChange={e => setFormData({...formData, birthday: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Contact Persons ── */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <SectionHeading icon={<Users className="h-4 w-4" />} title="Contact Persons" subtitle="Key people you work with" />
                    <Button type="button" size="sm" onClick={addContact} variant="outline"
                      className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
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
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </div>
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
                            <Input value={cp.name} onChange={e => updateContact(idx, 'name', e.target.value)}
                              className={fieldCls(contactErrors[idx]?.name)} />
                            {contactErrors[idx]?.name && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].name}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Designation</label>
                            <Input value={cp.designation} onChange={e => updateContact(idx, 'designation', e.target.value)}
                              className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>Email</label>
                            <Input type="email" value={cp.email} onChange={e => updateContact(idx, 'email', e.target.value)}
                              className={fieldCls(contactErrors[idx]?.email)} />
                            {contactErrors[idx]?.email && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].email}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Phone</label>
                            <Input value={cp.phone} onChange={e => updateContact(idx, 'phone', e.target.value)}
                              className={fieldCls(contactErrors[idx]?.phone)} />
                            {contactErrors[idx]?.phone && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].phone}</p>}
                          </div>
                          <div>
                            <label className={labelCls}>Birthday</label>
                            <Input type="date" value={cp.birthday || ''} onChange={e => updateContact(idx, 'birthday', e.target.value)}
                              className={fieldCls(false)} />
                          </div>
                          <div>
                            <label className={labelCls}>DIN (Director ID)</label>
                            <Input value={cp.din || ''} onChange={e => updateContact(idx, 'din', e.target.value)}
                              className={fieldCls(false)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── DSC Details ── */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <SectionHeading icon={<FileText className="h-4 w-4" />} title="DSC Details" subtitle="Digital Signature Certificates" />
                    <Button type="button" size="sm" onClick={addDSC} variant="outline"
                      className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                      <Plus className="h-3 w-3 mr-1" /> Add DSC
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {formData.dsc_details.map((dsc, idx) => (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 relative">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </div>
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

                {/* ── Services ── */}
                <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-6">
                  <SectionHeading icon={<BarChart3 className="h-4 w-4" />} title="Services" subtitle="Select all applicable services" />
                  {formErrors.services && (
                    <p className="text-red-500 text-xs mb-3 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.services}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {SERVICES.map(s => {
                      const isSelected = formData.services.includes(s) ||
                        (s === 'Other' && formData.services.some(x => x.startsWith('Other:')));
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleService(s)}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                            isSelected
                              ? 'text-white border-transparent shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          style={isSelected ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)', borderColor: 'transparent' } : {}}
                        >
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

                {/* ── Notes ── */}
                <div>
                  <label className={labelCls}>Internal Notes</label>
                  <Textarea
                    className="min-h-[110px] bg-white border-slate-200 rounded-xl text-sm resize-y focus:border-blue-400"
                    placeholder="Internal remarks, preferences, or special instructions…"
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                  />
                </div>

                {/* ── Assign To ── */}
                {canAssignClients && (
                  <div>
                    <label className={labelCls}>Assign To Staff</label>
                    <Select value={formData.assigned_to} onValueChange={v => setFormData({...formData, assigned_to: v})}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200 text-sm bg-white">
                        <SelectValue placeholder="Select team member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* ── Footer ── */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-slate-100">
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}
                      className="h-9 px-4 text-sm rounded-xl text-slate-500">
                      Cancel
                    </Button>
                    <Button type="button" variant="outline" onClick={downloadTemplate}
                      className="h-9 px-4 text-sm rounded-xl border-slate-200 text-slate-600">
                      CSV Template
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                      onClick={() => fileInputRef.current?.click()}>
                      Import CSV
                    </Button>
                    <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                      disabled={importLoading} onClick={() => excelInputRef.current?.click()}>
                      Import Excel
                    </Button>
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

      {/* ── Today's Celebrations ─────────────────────────────────────────── */}
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

      {/* ── Stats Cards ──────────────────────────────────────────────────── */}
      {canViewAllClients && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Clients', value: stats.totalClients,
              icon: <Users className="h-5 w-5" />, iconBg: 'rgba(13,59,102,0.1)', iconColor: '#0D3B66',
              accent: 'linear-gradient(135deg, #0D3B66, #1F6FB2)',
            },
            {
              label: 'Active', value: stats.activeClients,
              icon: <Briefcase className="h-5 w-5" />, iconBg: 'rgba(31,175,90,0.1)', iconColor: '#1FAF5A',
              accent: 'linear-gradient(135deg, #065f46, #059669)',
            },
            {
              label: 'Archived', value: stats.totalClients - stats.activeClients,
              icon: <Archive className="h-5 w-5" />, iconBg: 'rgba(245,158,11,0.1)', iconColor: '#D97706',
              accent: 'linear-gradient(135deg, #92400e, #D97706)',
            },
            {
              label: 'Top Service', value: Object.entries(stats.serviceCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'N/A',
              icon: <BarChart3 className="h-5 w-5" />, iconBg: 'rgba(124,58,237,0.1)', iconColor: '#7c3aed',
              accent: 'linear-gradient(135deg, #4c1d95, #7c3aed)', isText: true,
            },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-shadow"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: s.iconBg, color: s.iconColor }}>
                  {s.icon}
                </div>
                <div className="w-1 h-8 rounded-full opacity-30" style={{ background: s.accent }} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
              <p className={`font-bold text-slate-900 ${s.isText ? 'text-base truncate' : 'text-3xl tracking-tight'}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by company, email or phone…"
            className="pl-11 h-10 bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-[120px] bg-slate-50 border-none rounded-xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-10 w-[150px] bg-slate-50 border-none rounded-xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Results count pill */}
          <div className="h-10 px-4 flex items-center bg-slate-50 rounded-xl text-xs font-semibold text-slate-500 border border-slate-100 whitespace-nowrap">
            {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ── Virtualized Client Grid ───────────────────────────────────────── */}
      <div className="h-[70vh] min-h-[480px] w-full border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
        {filteredClients.length > 0 ? (
          <AutoSizer>
            {({ height, width }) => {
              const CARD_MIN = 280;
              const columnCount = Math.max(1, Math.floor(width / CARD_MIN));
              const columnWidth = Math.floor(width / columnCount);
              const rowHeight = 240;
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
                  overscanRowCount={4}
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
            <div className="w-14 h-14 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-4">
              <Users className="h-7 w-7 opacity-30" />
            </div>
            <p className="text-base font-semibold text-slate-500">No clients match your filters</p>
            <p className="mt-1 text-sm text-slate-400">Try changing your search term or filters</p>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
      <input type="file" ref={excelInputRef} accept=".xlsx" onChange={handleImportExcel} className="hidden" />

      {/* ── Excel Preview Dialog ──────────────────────────────────────────── */}
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
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                    {previewHeaders.map(header => (
                      <td key={header} className="p-2">
                        <Input
                          value={row[header] || ''}
                          onChange={e => {
                            const updated = [...previewData];
                            updated[rowIndex][header] = e.target.value;
                            setPreviewData(updated);
                          }}
                          className="h-8 text-xs rounded-lg border-slate-200"
                        />
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
              <Button variant="outline" onClick={() => setPreviewOpen(false)} className="h-9 px-4 text-sm rounded-xl border-slate-200">
                Cancel
              </Button>
              <Button
                className="h-9 px-5 text-sm rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                onClick={async () => {
                  setImportLoading(true);
                  let success = 0;
                  for (let row of previewData) {
                    const exists = clients.find(c =>
                      c.company_name?.toLowerCase().trim() === row.company_name?.toLowerCase().trim()
                    );
                    if (exists) { console.log("Skipping duplicate:", row.company_name); continue; }
                    try {
                      await api.post('/clients', {
                        company_name: row.company_name?.trim(),
                        client_type: ['proprietor','pvt_ltd','llp','partnership','huf','trust','other'].includes(row.client_type)
                          ? row.client_type : 'proprietor',
                        email: row.email?.trim(),
                        phone: row.phone?.replace(/\D/g, ""),
                        birthday: row.birthday || null,
                        services: row.services ? row.services.split(',').map(s => s.trim()) : [],
                        notes: row.notes?.trim() || null,
                        assigned_to: null, contact_persons: [], dsc_details: []
                      });
                      success++;
                    } catch (err) { console.error(err); }
                  }
                  toast.success(`${success} clients imported successfully`);
                  fetchClients(); setPreviewOpen(false); setImportLoading(false);
                }}
              >
                Confirm & Import All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
