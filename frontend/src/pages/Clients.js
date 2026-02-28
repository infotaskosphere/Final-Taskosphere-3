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
  // ADVANCED VALIDATION STATES (added for refined form validation)
  const [formErrors, setFormErrors] = useState({});
  const [contactErrors, setContactErrors] = useState([]);
  // Safe date formatter to prevent Invalid Date errors (fixes contact person upload issue)
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
  // ==================== ADVANCED FORM VALIDATION ====================
  const validateForm = () => {
    const errors = {};
    const cErrors = [];
    // Company Name
    if (!formData.company_name?.trim() || formData.company_name.trim().length < 2) {
      errors.company_name = 'Company name must be at least 2 characters';
    }
    // Email
    const trimmedEmail = formData.email?.trim();
    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }
    // Phone (exactly 10 digits)
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (!cleanPhone) {
      errors.phone = 'Phone number is required';
    } else if (cleanPhone.length !== 10) {
      errors.phone = 'Phone number must be exactly 10 digits';
    }
    // Services
    if (formData.services.length === 0) {
      errors.services = 'At least one service must be selected';
    }
    // Contact Persons
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
    // Duplicate email check
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
                'proprietor','pvt_ltd','llp','partnership','huf','trust','other'
              ].includes(row.client_type) ? row.client_type : 'proprietor',
              email: row.email?.trim(),
              phone: row.phone?.replace(/\D/g, ""),
              birthday: row.birthday || null,
              services: row.services ? row.services.split(',').map(s => s.trim()) : [],
              notes: null,
              assigned_to: null,
              contact_persons: [{
                name: row.contact_name_1 || "",
                designation: row.contact_designation_1 || null,
                email: row.contact_email_1?.trim() || null,
                phone: row.contact_phone_1 ? row.contact_phone_1.replace(/\D/g, "") : null,
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
      if (workbook.SheetNames.includes('MasterData')) {
        // Special handling for MDS data format (single company)
        setImportLoading(true);
        const masterSheet = workbook.Sheets['MasterData'];
        const masterRows = XLSX.utils.sheet_to_json(masterSheet, { header: 1 });
        const masterData = {};
        masterRows.slice(1).forEach(row => {
          if (row.length >= 2) {
            const key = row[0].trim();
            const value = row[1].trim();
            masterData[key] = value;
          }
        });
        // Fix email
        if (masterData['Email Id']) {
          masterData['Email Id'] = masterData['Email Id'].replace(/\[dot\]/g, '.').replace(/\[at\]/g, '@');
        }
        // Birthday (Date of Incorporation)
        let birthday = null;
        if (masterData['Date of Incorporation']) {
          const parts = masterData['Date of Incorporation'].split('/');
          if (parts.length === 3) {
            birthday = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        // Directors (contact persons)
        const directorSheet = workbook.Sheets['Director Details'];
        let contact_persons = [];
        if (directorSheet) {
          const directorData = XLSX.utils.sheet_to_json(directorSheet, {
            header: ['srno', 'din', 'name', 'designation', 'category', 'appointment', 'cessation', 'signatory'],
            range: 2 // Start from data rows (skipping title and headers)
          });
          contact_persons = directorData.map(d => ({
            name: d.name?.trim() || '',
            designation: d.designation?.trim() || '',
            email: '',
            phone: '',
            birthday: null,
            din: d.din?.trim() || ''
          }));
        }
        // Client type detection
        const client_type = detectClientTypeFromName(masterData['Company Name']);
        // Services (default to ROC since it's from MDS)
        const services = ['ROC'];
        // Notes (compile relevant info)
        const notes = `
CIN: ${masterData['CIN'] || ''}
Registered Address: ${masterData['Registered Address'] || ''}
ROC Name: ${masterData['ROC Name'] || ''}
Registration Number: ${masterData['Registration Number'] || ''}
Authorised Capital (Rs): ${masterData['Authorised Capital (Rs)'] || ''}
Paid up Capital (Rs): ${masterData['Paid up Capital (Rs)'] || ''}
Date of last AGM: ${masterData['Date of last AGM'] || ''}
Date of Balance Sheet: ${masterData['Date of Balance Sheet'] || ''}
Company Status: ${masterData['Company Status'] || ''}
        `.trim();
        // Payload
        const payload = {
          company_name: masterData['Company Name']?.trim() || '',
          client_type,
          email: masterData['Email Id'] || '',
          phone: '',
          birthday,
          services,
          notes,
          assigned_to: null,
          contact_persons,
          dsc_details: [],
          status: 'active'
        };
        // Directly import
        api.post('/clients', payload)
          .then(() => {
            toast.success('Client imported successfully from Master Data!');
            fetchClients();
            setImportLoading(false);
          })
          .catch(err => {
            toast.error('Failed to import client: ' + (err.response?.data?.detail || err.message));
            setImportLoading(false);
          });
      } else {
        // Existing general Excel import logic
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
      }
    };
    reader.readAsBinaryString(file);
  };
  // UPDATED handleSubmit with Advanced Validation
  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = validateForm();
    if (!isValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
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
      // Clean contact persons (robust date handling)
      const cleanedContacts = formData.contact_persons.map(cp => ({
        name: cp.name || "",
        designation: cp.designation?.trim() || null,
        email: cp.email?.trim() ? cp.email.trim() : null,
        phone: cp.phone ? cp.phone.replace(/\D/g, "") : null,
        birthday: safeDate(cp.birthday),
        din: cp.din?.trim() || null
      }));
      // Construct backend-safe payload
      const payload = {
        company_name: formData.company_name.trim(),
        client_type: formData.client_type,
        email: formData.email?.trim(),
        phone: cleanPhone,
        birthday: safeDate(formData.birthday),
        services: finalServices,
        notes: formData.notes?.trim() || null,
        assigned_to: formData.assigned_to === "unassigned" ? null : formData.assigned_to,
        status: formData.status, // ← FIXED: was missing
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
    // Clear validation on edit
    setFormErrors({});
    setContactErrors([]);
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
    setFormErrors({});
    setContactErrors([]);
  };
  // Clear errors when dialog closes
  useEffect(() => {
    if (!dialogOpen) {
      setFormErrors({});
      setContactErrors([]);
    }
  }, [dialogOpen]);
  // ==================== DYNAMIC FIELDS ====================
  const updateContact = (idx, field, val) => {
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.map((c, i) =>
        i === idx ? { ...c, [field]: val } : c
      )
    }));
    // Live error clearing
    if (contactErrors[idx] && contactErrors[idx][field]) {
      const newCerr = [...contactErrors];
      if (newCerr[idx]) delete newCerr[idx][field];
      if (Object.keys(newCerr[idx] || {}).length === 0) newCerr[idx] = undefined;
      setContactErrors(newCerr);
    }
  };
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
  const toggleService = (s) => {
    setFormData(p => {
      const services = p.services.includes(s)
        ? p.services.filter(x => x !== s)
        : [...p.services, s];
      return { ...p, services };
    });
    // Live clear services error
    if (formErrors.services) {
      setFormErrors(prev => ({ ...prev, services: undefined }));
    }
  };
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
  // REFINED Virtualized Client Card Renderer – Premium SaaS look
  // ────────────────────────────────────────────────
  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (index >= filteredClients.length || !client) return null;
    return (
      <div style={style} className="p-4 box-border">
        <Card className="h-full w-full rounded-3xl border border-slate-100 bg-white overflow-hidden hover:shadow-2xl hover:border-indigo-200 hover:-translate-y-1 transition-all duration-300 group relative">
          {/* Status Indicator */}
          {client.status === 'inactive' && (
            <div className="absolute top-4 right-4 px-3 py-1 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full z-10 shadow-sm">
              Archived
            </div>
          )}
          <div className="p-6 flex flex-col h-full">
            {/* Header with Avatar */}
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-500 text-white rounded-2xl flex items-center justify-center text-2xl font-bold shadow-inner ring-1 ring-white/30">
                {client.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400 font-medium tracking-tight">
                    {getClientNumber(index)}
                  </span>
                  <h3 className="font-semibold text-lg leading-tight text-slate-950 truncate pr-6">
                    {client.company_name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-[0.5px]">
                  {CLIENT_TYPES.find(t => t.value === client.client_type)?.label || client.client_type}
                </p>
              </div>
            </div>
            {/* Contact Info */}
            <div className="space-y-3 text-sm text-slate-600 flex-1">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="truncate font-medium">{client.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span className="truncate">{client.email || '—'}</span>
              </div>
            </div>
            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                {client.services?.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-medium px-3 py-1 bg-slate-100 text-slate-700">
                    {client.services[0].replace('Other: ', '').length > 18
                      ? client.services[0].replace('Other: ', '').substring(0, 15) + '...'
                      : client.services[0].replace('Other: ', '')}
                  </Badge>
                )}
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openWhatsApp(client.phone, client.company_name);
                  }}
                  className="p-2.5 hover:bg-emerald-50 text-emerald-600 rounded-2xl transition-colors"
                  title="Message on WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(client);
                  }}
                  className="p-2.5 hover:bg-indigo-50 text-indigo-600 rounded-2xl transition-colors"
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
                    className="p-2.5 hover:bg-red-50 text-red-500 rounded-2xl transition-colors"
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
    <div className="min-h-screen bg-slate-50 p-6 md:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-[-0.03em] text-slate-950 font-outfit">Clients</h1>
              <p className="text-slate-600 mt-1 text-lg">Central hub for all client relationships</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={downloadTemplate} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-2xl">
            <FileText className="mr-2 h-4 w-4" />Download CSV Template
          </Button>
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className="rounded-2xl"
          >
            {importLoading ? 'Importing...' : 'Import CSV'}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl px-7 shadow-lg transition-all font-medium">
                <Plus className="mr-2 h-5 w-5" /> New Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[94vh] overflow-y-auto bg-white rounded-3xl border-none shadow-2xl p-0">
              <div className="p-10 space-y-10">
                <DialogHeader className="flex flex-row justify-between items-start">
                  <div>
                    <DialogTitle className="text-3xl font-bold font-outfit tracking-tight">Client Profile</DialogTitle>
                    <DialogDescription className="text-base mt-2">Complete client information and preferences</DialogDescription>
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50 px-5 py-2.5 rounded-2xl border">
                    <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Status</Label>
                    <Switch
                      checked={formData.status === 'active'}
                      onCheckedChange={c => setFormData({...formData, status: c ? 'active' : 'inactive'})}
                    />
                    <span className="text-sm font-medium text-slate-700">{formData.status === 'active' ? 'Active' : 'Archived'}</span>
                  </div>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-10">
                  {/* Basic Information */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-8">
                    <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-3">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full" />Basic Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Company Name *</Label>
                        <Input
                          className={`h-12 bg-white rounded-2xl text-base ${formErrors.company_name ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'}`}
                          value={formData.company_name}
                          onChange={e => {
                            setFormData({...formData, company_name: e.target.value});
                            if (formErrors.company_name) setFormErrors(prev => ({...prev, company_name: undefined}));
                          }}
                          required
                        />
                        {formErrors.company_name && <p className="text-red-500 text-xs mt-1">{formErrors.company_name}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Client Type *</Label>
                        <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v})}>
                          <SelectTrigger className="h-12 bg-white border-slate-200 rounded-2xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Email Address *</Label>
                        <Input
                          className={`h-12 bg-white rounded-2xl ${formErrors.email ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'}`}
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
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Phone Number *</Label>
                        <Input
                          className={`h-12 bg-white rounded-2xl ${formErrors.phone ? 'border-red-500 focus:border-red-500' : 'border-slate-200 focus:border-indigo-500'}`}
                          value={formData.phone}
                          onChange={e => {
                            setFormData({...formData, phone: e.target.value});
                            if (formErrors.phone) setFormErrors(prev => ({...prev, phone: undefined}));
                          }}
                          required
                        />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Incorporation / Birthday</Label>
                        <Input
                          className="h-12 bg-white border-slate-200 focus:border-indigo-500 rounded-2xl"
                          type="date"
                          value={formData.birthday}
                          onChange={e => setFormData({...formData, birthday: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Contact Persons */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-8">
                    <div className="flex justify-between items-end mb-6">
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900">Contact Persons</h3>
                        <p className="text-sm text-slate-500 mt-1">Key people you work with</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addContact}
                        variant="outline"
                        className="rounded-2xl h-10"
                      >
                        <Plus className="h-4 w-4 mr-2" /> Add Person
                      </Button>
                    </div>
                    {formErrors.contacts && <p className="text-red-500 text-sm mb-4">{formErrors.contacts}</p>}
                    <div className="space-y-6">
                      {formData.contact_persons.map((cp, idx) => (
                        <div
                          key={idx}
                          className="p-7 border border-slate-200 rounded-3xl bg-white relative shadow-sm"
                        >
                          <div className="flex justify-between items-center mb-6">
                            <span className="font-semibold text-slate-800">Contact #{idx + 1}</span>
                            {formData.contact_persons.length > 1 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeContact(idx)}
                                className="text-slate-400 hover:text-red-600 h-8 w-8"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">Full Name</Label>
                              <Input
                                value={cp.name}
                                onChange={e => updateContact(idx, 'name', e.target.value)}
                                className={`h-11 rounded-2xl ${contactErrors[idx]?.name ? 'border-red-500' : ''}`}
                              />
                              {contactErrors[idx]?.name && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].name}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">Designation</Label>
                              <Input
                                value={cp.designation}
                                onChange={e => updateContact(idx, 'designation', e.target.value)}
                                className="h-11 rounded-2xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">Email</Label>
                              <Input
                                type="email"
                                value={cp.email}
                                onChange={e => updateContact(idx, 'email', e.target.value)}
                                className={`h-11 rounded-2xl ${contactErrors[idx]?.email ? 'border-red-500' : ''}`}
                              />
                              {contactErrors[idx]?.email && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].email}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">Phone</Label>
                              <Input
                                value={cp.phone}
                                onChange={e => updateContact(idx, 'phone', e.target.value)}
                                className={`h-11 rounded-2xl ${contactErrors[idx]?.phone ? 'border-red-500' : ''}`}
                              />
                              {contactErrors[idx]?.phone && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].phone}</p>}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">Birthday</Label>
                              <Input
                                type="date"
                                value={cp.birthday || ''}
                                onChange={e => updateContact(idx, 'birthday', e.target.value)}
                                className="h-11 rounded-2xl"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs uppercase tracking-widest text-slate-500">DIN (Director ID)</Label>
                              <Input
                                value={cp.din || ''}
                                onChange={e => updateContact(idx, 'din', e.target.value)}
                                className="h-11 rounded-2xl"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Services */}
                  <div className="space-y-4">
                    <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Services Offered</Label>
                    {formErrors.services && <p className="text-red-500 text-sm -mt-1">{formErrors.services}</p>}
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
                          className="cursor-pointer px-5 py-2 rounded-2xl text-sm hover:bg-indigo-50 transition-colors"
                          onClick={() => toggleService(s)}
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                    {formData.services.includes('Other') && (
                      <div className="flex gap-3 items-end max-w-md">
                        <div className="flex-1 space-y-2">
                          <Label className="text-xs text-slate-500">Specify other service</Label>
                          <Input
                            placeholder="IEC Registration, FEMA..."
                            value={otherService}
                            onChange={e => setOtherService(e.target.value)}
                            className="rounded-2xl"
                          />
                        </div>
                        <Button type="button" size="sm" onClick={addOtherService} className="rounded-2xl h-11 px-6">Add</Button>
                      </div>
                    )}
                  </div>
                  {/* Notes */}
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Internal Notes</Label>
                    <Textarea
                      className="min-h-[140px] bg-white border-slate-200 rounded-3xl resize-y"
                      placeholder="Any internal remarks, preferences, or special instructions..."
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>
                  {canAssignClients && (
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Assign To Staff</Label>
                      <Select
                        value={formData.assigned_to}
                        onValueChange={v => setFormData({...formData, assigned_to: v})}
                      >
                        <SelectTrigger className="h-12 rounded-2xl">
                          <SelectValue placeholder="Select team member" />
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
                  <DialogFooter className="pt-8 border-t flex flex-col sm:flex-row gap-4">
                    <div className="flex gap-3 flex-1">
                      <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="rounded-2xl">
                        Cancel
                      </Button>
                      <Button type="button" variant="outline" onClick={downloadTemplate} className="rounded-2xl">
                        CSV Template
                      </Button>
                    </div>
                    <div className="flex gap-3 flex-1 sm:justify-end">
                      <Button
                        type="button"
                        className="bg-indigo-600 text-white rounded-2xl"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Import CSV
                      </Button>
                      <Button
                        type="button"
                        className="bg-indigo-600 text-white rounded-2xl"
                        disabled={importLoading}
                        onClick={() => excelInputRef.current?.click()}
                      >
                        Import Master Data
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-slate-900 hover:bg-black text-white px-10 rounded-2xl font-medium"
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
      {/* Today's Celebrations */}
      {canViewAllClients && todayReminders.length > 0 && (
        <Card className="bg-gradient-to-r from-pink-50 to-rose-50 border-pink-100 shadow-sm">
          <CardContent className="p-6 flex items-center gap-6">
            <div className="p-4 bg-white rounded-2xl shadow text-pink-600">
              <Cake className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-pink-950 text-lg">Today's Celebrations</h4>
              <div className="flex flex-wrap gap-2 mt-3">
                {todayReminders.map(c => (
                  <Badge key={c.id} className="bg-white text-pink-700 border-pink-200 px-4 py-1 shadow-sm">
                    {c.company_name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Stats Dashboard */}
      {canViewAllClients && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="p-6 border-slate-100 shadow-sm hover:shadow transition-all">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-medium text-slate-500">Total Clients</p>
                <p className="text-4xl font-semibold text-slate-900 tracking-tighter mt-1">{stats.totalClients}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-slate-100 shadow-sm hover:shadow transition-all">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl">
                <Briefcase className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-medium text-slate-500">Active</p>
                <p className="text-4xl font-semibold text-slate-900 tracking-tighter mt-1">{stats.activeClients}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-slate-100 shadow-sm hover:shadow transition-all">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-amber-100 text-amber-600 rounded-2xl">
                <Archive className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest font-medium text-slate-500">Archived</p>
                <p className="text-4xl font-semibold text-slate-900 tracking-tighter mt-1">{stats.totalClients - stats.activeClients}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-slate-100 shadow-sm hover:shadow transition-all overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-purple-100 text-purple-600 rounded-2xl">
                <BarChart3 className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest font-medium text-slate-500">Top Service</p>
                <p className="text-xl font-semibold text-slate-900 tracking-tight truncate mt-1">
                  {Object.entries(stats.serviceCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by company, email or phone..."
            className="pl-12 h-12 bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded-3xl text-base"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-12 w-[130px] bg-slate-50 border-none rounded-3xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-12 w-[170px] bg-slate-50 border-none rounded-3xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* Virtualized Client Grid */}
      <div className="h-[72vh] min-h-[520px] w-full border border-slate-100 rounded-3xl overflow-hidden bg-white shadow-sm">
        {filteredClients.length > 0 ? (
          <AutoSizer>
            {({ height, width }) => {
              const CARD_SIZE = 305;
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
            <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-6">
              <Users className="h-9 w-9 opacity-40" />
            </div>
            <p className="text-xl font-medium">No clients match your filters</p>
            <p className="mt-2 text-sm">Try changing search term or filters</p>
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
      {/* Excel Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Excel Import</DialogTitle>
            <DialogDescription>Preview and confirm data before bulk import</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-2xl mt-4">
            <table className="min-w-full text-xs divide-y divide-slate-100">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {previewHeaders.map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium uppercase tracking-wider text-slate-500 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {previewHeaders.map(header => (
                      <td key={header} className="p-2">
                        <Input
                          value={row[header] || ''}
                          onChange={e => {
                            const updated = [...previewData];
                            updated[rowIndex][header] = e.target.value;
                            setPreviewData(updated);
                          }}
                          className="h-9 text-xs rounded-xl"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="rounded-2xl">
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white rounded-2xl"
              onClick={async () => {
                setImportLoading(true);
                let success = 0;
                for (let row of previewData) {
                  try {
                    await api.post('/clients', {
                      company_name: row.company_name?.trim(),
                      client_type: [
                        'proprietor','pvt_ltd','llp','partnership','huf','trust','other'
                      ].includes(row.client_type) ? row.client_type : 'proprietor',
                      email: row.email?.trim(),
                      phone: row.phone?.replace(/\D/g, ""),
                      birthday: row.birthday || null,
                      services: row.services ? row.services.split(',').map(s => s.trim()) : [],
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
                toast.success(`${success} clients imported successfully`);
                fetchClients();
                setPreviewOpen(false);
                setImportLoading(false);
              }}
            >
              Confirm & Import All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
