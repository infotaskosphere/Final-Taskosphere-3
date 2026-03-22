import React, { useState, useEffect, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Plus, Edit, Trash2, Download, Search, Building2, FileText,
  ChevronRight, ChevronLeft, Check, X, Loader2, Receipt,
  Phone, Mail, Globe, CreditCard, User, Tag, Info,
  IndianRupee, Percent, Hash, Calendar, Link, ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A' };

const STATUS_STYLES = {
  draft:    'bg-slate-100 text-slate-600 border-slate-200',
  sent:     'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
};

const STEPS = ['Client & Lead', 'Company', 'Services', 'Terms & Preview'];

const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: .25 } } };
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: .04 } } };

const UNIT_OPTIONS = ['service', 'month', 'hour', 'year', 'session', 'document', 'return', 'filing', 'visit', 'item'];

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

/**
 * FIX: Extract a human-readable error message from an axios blob response.
 * When responseType is 'blob', axios can't read the error body as text automatically.
 * We convert the blob back to text to get the actual server error message.
 */
const extractBlobError = async (error) => {
  try {
    if (error?.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        const json = JSON.parse(text);
        return json?.detail || json?.message || text || 'PDF generation failed';
      } catch {
        return text || 'PDF generation failed';
      }
    }
    return (
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      'PDF generation failed'
    );
  } catch {
    return 'PDF generation failed';
  }
};

/* ─── CompanyManager ─────────────────────────────────────────────────────── */
function CompanyManager({ onClose, onSaved, editingCompany }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', website: '', gstin: '', pan: '',
    bank_account_name: '', bank_name: '', bank_account_no: '', bank_ifsc: '',
    logo_base64: null, signature_base64: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (editingCompany) setForm(editingCompany); }, [editingCompany]);

  const handleFileBase64 = (key, e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setForm(p => ({ ...p, [key]: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      if (editingCompany?.id) { await api.put(`/companies/${editingCompany.id}`, form); toast.success('Company updated'); }
      else                    { await api.post('/companies', form); toast.success('Company created'); }
      onSaved();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save company'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, name, type = 'text', half = false, placeholder = '' }) => (
    <div className={cn('space-y-1.5', half && 'col-span-1')}>
      <Label className="text-xs font-semibold text-slate-600">{label}</Label>
      <Input type={type} value={form[name] || ''} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))} placeholder={placeholder} className="h-9 rounded-xl text-sm" />
    </div>
  );

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold" style={{ color: COLORS.deepBlue }}>{editingCompany ? 'Edit Company' : 'Add Company Profile'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold">Company Name *</Label>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Your Firm Name" className="h-9 rounded-xl" />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold">Address</Label>
          <Textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} className="resize-none rounded-xl text-sm" placeholder="Full address…" />
        </div>
        <Field label="Phone" name="phone" placeholder="+91 98765 43210" />
        <Field label="Email" name="email" type="email" placeholder="info@firm.com" />
        <Field label="Website" name="website" placeholder="https://yourfirm.com" />
        <Field label="GSTIN" name="gstin" placeholder="22AAAAA0000A1Z5" />
        <Field label="PAN" name="pan" placeholder="AAAAA1234A" />

        <div className="md:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2 mb-1">Bank Details</p></div>
        <Field label="Account Holder Name" name="bank_account_name" placeholder="Firm Name" />
        <Field label="Bank Name" name="bank_name" placeholder="HDFC Bank" />
        <Field label="Account Number" name="bank_account_no" placeholder="0000000000000" />
        <Field label="IFSC Code" name="bank_ifsc" placeholder="HDFC0001234" />

        <div className="md:col-span-2"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-2 mb-1">Logo & Signature</p></div>
        {['logo_base64', 'signature_base64'].map(key => (
          <div key={key} className="space-y-1.5">
            <Label className="text-xs font-semibold">{key === 'logo_base64' ? 'Company Logo' : 'Signature Image'}</Label>
            {form[key] && <img src={form[key]} alt={key} className="h-12 object-contain rounded-lg border border-slate-200 bg-slate-50 px-2" />}
            <Input type="file" accept="image/*" onChange={e => handleFileBase64(key, e)} className="h-9 rounded-xl text-sm" />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="rounded-xl" style={{ background: COLORS.emeraldGreen }}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Company'}
        </Button>
      </div>
    </div>
  );
}

/* ─── QuotationDetailModal ───────────────────────────────────────────────── */
function QuotationDetailModal({ quotation, company, open, onClose, onStatusChange, onDownloadPdf, onDownloadChecklist, downloading }) {
  const isDark = useDark();

  if (!quotation) return null;
  const stage = quotation.status || 'draft';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Receipt className="h-5 w-5" />Quotation — {quotation.quotation_no}
          </DialogTitle>
          <DialogDescription>
            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-xl text-xs font-bold border capitalize', STATUS_STYLES[stage])}>{stage}</span>
            <span className="ml-3 text-xs text-slate-500">Issued: {quotation.date}</span>
            {quotation.lead_id && <span className="ml-3 inline-flex items-center gap-1 text-xs text-purple-600 font-semibold"><Link className="h-3 w-3" />Linked to Lead</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Client */}
          <div className={`p-4 rounded-2xl border grid grid-cols-2 gap-2 text-sm ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
            <div className={`col-span-2 font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{quotation.client_name}</div>
            {quotation.client_phone && <p className="text-slate-500 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{quotation.client_phone}</p>}
            {quotation.client_email && <p className="text-slate-500 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{quotation.client_email}</p>}
            {quotation.client_address && <p className="text-slate-400 col-span-2 text-xs">{quotation.client_address}</p>}
          </div>

          {/* Items */}
          {(quotation.items || []).length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Line Items</p>
              <div className="rounded-2xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                      <th className="text-left px-3 py-2 font-semibold">Description</th>
                      <th className="text-center px-3 py-2 font-semibold">Qty</th>
                      <th className="text-center px-3 py-2 font-semibold">Unit</th>
                      <th className="text-right px-3 py-2 font-semibold">Unit Price</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.items.map((item, i) => (
                      <tr key={i} className={cn('border-t border-slate-100', i % 2 === 0 ? (isDark ? 'bg-slate-800' : 'bg-white') : (isDark ? 'bg-slate-700/50' : 'bg-slate-50/50'))}>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-center">{item.quantity}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{item.unit}</td>
                        <td className="px-3 py-2 text-right">₹{(item.unit_price || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-semibold">₹{(item.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 space-y-1 text-sm text-right pr-1">
                <p className={`${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sub Total: <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>₹{(quotation.subtotal || 0).toLocaleString()}</span></p>
                {quotation.gst_rate > 0 && <p className={`${isDark ? 'text-slate-400' : 'text-slate-500'}`}>GST @ {quotation.gst_rate}%: <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>₹{(quotation.gst_amount || 0).toLocaleString()}</span></p>}
                <p className="text-base font-bold" style={{ color: COLORS.deepBlue }}>Total: ₹{(quotation.total || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Status change */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {['draft', 'sent', 'accepted', 'rejected'].map(s => (
              <button key={s} onClick={() => onStatusChange(quotation.id, s)} disabled={stage === s}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95', stage === s ? cn(STATUS_STYLES[s], 'shadow-sm') : cn('bg-white text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-700'))}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* PDF buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onDownloadPdf(quotation.id, quotation.quotation_no)} disabled={!!downloading} variant="outline" className="rounded-xl gap-2 h-9">
              {downloading === quotation.id + '-pdf' ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Download className="h-4 w-4" />Download Quotation PDF</>}
            </Button>
            <Button onClick={() => onDownloadChecklist(quotation.id, quotation.quotation_no)} disabled={!!downloading} variant="outline" className="rounded-xl gap-2 h-9">
              {downloading === quotation.id + '-checklist' ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><FileText className="h-4 w-4" />Download Checklist PDF</>}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="rounded-xl">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function Quotations() {
  const isDark = useDark();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const perms = user?.permissions || {};
  const canAccess = isAdmin || !!perms.can_create_quotations;

  const [companies,    setCompanies]    = useState([]);
  const [quotations,   setQuotations]   = useState([]);
  const [leads,        setLeads]        = useState([]);
  const [services,     setServices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [downloading,  setDownloading]  = useState(null);
  const [detailQtn,    setDetailQtn]    = useState(null);
  const [companyManagerOpen, setCompanyManagerOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [editingQtn,   setEditingQtn]   = useState(null);
  const [currentStep,  setCurrentStep]  = useState(0);
  const [submitting,   setSubmitting]   = useState(false);

  /* ── form state ── */
  const emptyForm = {
    company_id: '', lead_id: '', client_name: '', client_address: '', client_email: '',
    client_phone: '', service: '', subject: '', scope_of_work: [], items: [], gst_rate: 18,
    payment_terms: '', timeline: '', validity_days: 30, advance_terms: '', extra_terms: [],
    notes: '', extra_checklist_items: [], status: 'draft',
  };
  const [form, setForm] = useState(emptyForm);

  /* ── checklist from service ── */
  const [checklists, setChecklists] = useState({});

  /* ── fetch data ── */
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cRes, qRes, sRes] = await Promise.all([
        api.get('/companies'),
        api.get('/quotations'),
        api.get('/quotations/services'),
      ]);
      setCompanies(cRes.data || []);
      setQuotations(qRes.data || []);
      setServices(sRes.data?.services || []);
      setChecklists(sRes.data?.checklists || {});
      try {
        const lRes = await api.get('/leads/');
        setLeads((lRes.data || []).filter(l => !['won', 'lost'].includes(l.status)));
      } catch {}
    } catch (err) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchAll();
    const raw = sessionStorage.getItem('createQuotationForLead');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setForm(p => ({
          ...p,
          lead_id: data.lead_id || '',
          client_name: data.client_name || '',
          client_phone: data.client_phone || '',
          client_email: data.client_email || '',
          service: data.service || '',
        }));
        setShowForm(true);
        sessionStorage.removeItem('createQuotationForLead');
      } catch {}
    }
  }, []);

  if (!canAccess) return (
    <div className={`flex items-center justify-center h-64 ${isDark ? 'bg-[#0f172a]' : ''}`}>
      <div className="text-center">
        <Receipt className="h-16 w-16 text-slate-200 mx-auto mb-4" />
        <h2 className={`text-xl font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No Access</h2>
        <p className="text-slate-400 text-sm">You don't have permission to use the Quotations module.</p>
      </div>
    </div>
  );

  /* ── computed ── */
  const detailCompany = detailQtn ? companies.find(c => c.id === detailQtn.company_id) : null;

  const filteredQtns = quotations
    .filter(q => !searchQuery || q.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) || q.quotation_no?.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(q => statusFilter === 'all' || q.status === statusFilter);

  /* ── item helpers ── */
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }] }));
  const removeItem = i => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, key, val) => setForm(p => {
    const items = [...p.items];
    items[i] = { ...items[i], [key]: val };
    const qty   = key === 'quantity'   ? Number(val) || 0 : Number(items[i].quantity)  || 0;
    const price = key === 'unit_price' ? Number(val) || 0 : Number(items[i].unit_price) || 0;
    items[i].amount = Math.round(qty * price * 100) / 100;
    return { ...p, items };
  });

  const subtotal   = form.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const gst_amount = Math.round(subtotal * Number(form.gst_rate || 0) / 100 * 100) / 100;
  const total      = subtotal + gst_amount;

  /* ── scope / checklist helpers ── */
  const addScopeLine     = () => setForm(p => ({ ...p, scope_of_work: [...p.scope_of_work, ''] }));
  const removeScopeLine  = i  => setForm(p => ({ ...p, scope_of_work: p.scope_of_work.filter((_, idx) => idx !== i) }));
  const updateScopeLine  = (i, v) => setForm(p => { const s = [...p.scope_of_work]; s[i] = v; return { ...p, scope_of_work: s }; });
  const addExtraCheck    = () => setForm(p => ({ ...p, extra_checklist_items: [...p.extra_checklist_items, ''] }));
  const removeExtraCheck = i  => setForm(p => ({ ...p, extra_checklist_items: p.extra_checklist_items.filter((_, idx) => idx !== i) }));
  const updateExtraCheck = (i, v) => setForm(p => { const a = [...p.extra_checklist_items]; a[i] = v; return { ...p, extra_checklist_items: a }; });
  const addExtraTerm     = () => setForm(p => ({ ...p, extra_terms: [...p.extra_terms, ''] }));
  const removeExtraTerm  = i  => setForm(p => ({ ...p, extra_terms: p.extra_terms.filter((_, idx) => idx !== i) }));
  const updateExtraTerm  = (i, v) => setForm(p => { const a = [...p.extra_terms]; a[i] = v; return { ...p, extra_terms: a }; });

  /* ── status change ── */
  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.put(`/quotations/${id}`, { status: newStatus });
      toast.success(`Status → ${newStatus}`);
      fetchAll();
      if (detailQtn?.id === id) setDetailQtn(p => ({ ...p, status: newStatus }));
    } catch { toast.error('Failed to update status'); }
  };

  /* ── PDF download ──────────────────────────────────────────────────────────
   * FIX: When axios gets a blob response with a non-2xx status code, the
   * error.response.data is a Blob, not a parsed JSON object. We must convert
   * it back to text to read the actual error detail from FastAPI.
   * Without this fix the catch block only shows "Request failed with status 500"
   * and the real reason (e.g. "fpdf2 not installed") is invisible to the user.
   * ─────────────────────────────────────────────────────────────────────── */
  const handleDownloadPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-pdf');
    try {
      const token   = getToken();
      const baseURL = (api.defaults?.baseURL || '/api').replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Verify the response is actually a PDF (not an error JSON wrapped in blob)
      const contentType = response.headers?.['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        // Server returned an error as blob — convert and show it
        const text = await response.data.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json?.detail || 'PDF generation failed');
        } catch {
          throw new Error(text || 'PDF generation failed');
        }
      }

      const url  = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `quotation-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Quotation PDF downloaded');
    } catch (err) {
      console.error('PDF download error:', err);
      // FIX: extract real message from blob error response
      const message = await extractBlobError(err);
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadChecklist = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-checklist');
    try {
      const token   = getToken();
      const baseURL = (api.defaults?.baseURL || '/api').replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/checklist-pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });

      const contentType = response.headers?.['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        const text = await response.data.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json?.detail || 'Checklist PDF generation failed');
        } catch {
          throw new Error(text || 'Checklist PDF generation failed');
        }
      }

      const url  = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `checklist-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Checklist PDF downloaded');
    } catch (err) {
      console.error('Checklist download error:', err);
      const message = await extractBlobError(err);
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  /* ── delete ── */
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try { await api.delete(`/quotations/${id}`); toast.success('Deleted'); fetchAll(); }
    catch { toast.error('Failed to delete'); }
  };

  /* ── submit form ── */
  const handleSubmit = async () => {
    if (!form.company_id)          { toast.error('Select a company profile'); return; }
    if (!form.client_name?.trim()) { toast.error('Client name is required'); return; }
    if (!form.service)             { toast.error('Select a service'); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, gst_rate: Number(form.gst_rate || 18), validity_days: Number(form.validity_days || 30) };
      if (editingQtn) { await api.put(`/quotations/${editingQtn.id}`, payload); toast.success('Quotation updated'); }
      else            { await api.post('/quotations', payload); toast.success('Quotation created'); }
      setShowForm(false); setEditingQtn(null); setForm(emptyForm); setCurrentStep(0); fetchAll();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const openEdit = (q) => {
    setEditingQtn(q);
    setForm({
      company_id: q.company_id || '', lead_id: q.lead_id || '', client_name: q.client_name || '',
      client_address: q.client_address || '', client_email: q.client_email || '', client_phone: q.client_phone || '',
      service: q.service || '', subject: q.subject || '', scope_of_work: q.scope_of_work || [], items: q.items || [],
      gst_rate: q.gst_rate || 18, payment_terms: q.payment_terms || '', timeline: q.timeline || '',
      validity_days: q.validity_days || 30, advance_terms: q.advance_terms || '', extra_terms: q.extra_terms || [],
      notes: q.notes || '', extra_checklist_items: q.extra_checklist_items || [], status: q.status || 'draft',
    });
    setCurrentStep(0); setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingQtn(null); setForm(emptyForm); setCurrentStep(0); };

  /* ── step validation ── */
  const canGoNext = () => {
    if (currentStep === 0) return !!form.company_id && !!form.client_name?.trim();
    if (currentStep === 1) return !!form.service;
    return true;
  };

  /* ── render steps ── */
  const renderStep = () => {
    switch (currentStep) {

      case 0: return (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="font-semibold">Company Profile *</Label>
            {companies.length === 0
              ? <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-700">No company profiles yet. <button onClick={() => setCompanyManagerOpen(true)} className="underline font-semibold">Add one</button></div>
              : <Select value={form.company_id} onValueChange={v => setForm(p => ({ ...p, company_id: v }))}>
                  <SelectTrigger className="h-10 rounded-xl text-sm"><SelectValue placeholder="Select your company…" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>}
            <button onClick={() => setCompanyManagerOpen(true)} className="text-xs text-blue-600 hover:underline mt-0.5">+ Add / edit company profile</button>
          </div>

          {leads.length > 0 && (
            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1.5"><Link className="h-3.5 w-3.5 text-purple-400" />Link to Lead <span className="text-slate-400 font-normal text-xs">(optional)</span></Label>
              <Select value={form.lead_id || 'none'} onValueChange={v => {
                const leadId = v === 'none' ? '' : v;
                setForm(p => {
                  const lead = leads.find(l => l.id === leadId);
                  return {
                    ...p,
                    lead_id: leadId,
                    client_name: lead ? lead.company_name : p.client_name,
                    client_phone: lead?.phone || p.client_phone,
                    client_email: lead?.email || p.client_email,
                    service: lead && (lead.services || []).length > 0 ? lead.services[0] : p.service,
                  };
                });
              }}>
                <SelectTrigger className="h-10 rounded-xl text-sm"><SelectValue placeholder="Select a lead…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No linked lead —</SelectItem>
                  {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.company_name} <span className="text-slate-400 text-xs capitalize">[{l.status}]</span></SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">Linking updates the lead's pipeline stage automatically.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="font-semibold">Client Name *</Label>
              <Input value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Client / Company name" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400" />Phone</Label>
              <Input value={form.client_phone} onChange={e => setForm(p => ({ ...p, client_phone: e.target.value }))} placeholder="+91 98765 43210" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" />Email</Label>
              <Input type="email" value={form.client_email} onChange={e => setForm(p => ({ ...p, client_email: e.target.value }))} placeholder="client@company.com" className="h-10 rounded-xl" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="font-semibold">Address</Label>
              <Textarea value={form.client_address} onChange={e => setForm(p => ({ ...p, client_address: e.target.value }))} rows={2} className="resize-none rounded-xl text-sm" placeholder="Client address…" />
            </div>
          </div>
        </div>
      );

      case 1: return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Service *</Label>
              <Select value={form.service} onValueChange={v => setForm(p => ({ ...p, service: v }))}>
                <SelectTrigger className="h-10 rounded-xl text-sm"><SelectValue placeholder="Select service…" /></SelectTrigger>
                <SelectContent>{services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Subject</Label>
              <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Quotation subject…" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1"><Percent className="h-3.5 w-3.5 text-slate-400" />GST Rate (%)</Label>
              <Input type="number" value={form.gst_rate} onChange={e => setForm(p => ({ ...p, gst_rate: e.target.value }))} placeholder="18" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-slate-400" />Validity (Days)</Label>
              <Input type="number" value={form.validity_days} onChange={e => setForm(p => ({ ...p, validity_days: e.target.value }))} placeholder="30" className="h-10 rounded-xl" />
            </div>
          </div>

          {/* Scope of Work */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Scope of Work</Label>
              <button onClick={addScopeLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" />Add line</button>
            </div>
            {form.scope_of_work.map((line, i) => (
              <div key={i} className="flex gap-2">
                <Input value={line} onChange={e => updateScopeLine(i, e.target.value)} placeholder={`Scope item ${i + 1}`} className="h-9 rounded-xl text-sm flex-1" />
                <button onClick={() => removeScopeLine(i)} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {form.scope_of_work.length === 0 && <p className="text-xs text-slate-400 italic">No scope lines. Click "Add line" to add.</p>}
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Line Items</Label>
              <button onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" />Add item</button>
            </div>
            {form.items.map((item, i) => (
              <div key={i} className={`p-3 rounded-2xl border space-y-2 ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Item {i + 1}</span>
                  <button onClick={() => removeItem(i)} className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                </div>
                <Input
                  value={item.description}
                  onChange={e => updateItem(i, 'description', e.target.value)}
                  placeholder="Description of service / work"
                  className={`h-9 rounded-xl text-sm ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white'}`}
                />
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Qty</p>
                    <Input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="1"
                      className={`h-8 rounded-xl text-sm text-center ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white'}`} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Unit</p>
                    <Select value={item.unit || 'service'} onValueChange={v => updateItem(i, 'unit', v)}>
                      <SelectTrigger className={`h-8 rounded-xl text-xs ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white'}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Unit Price (₹)</p>
                    <Input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} placeholder="0"
                      className={`h-8 rounded-xl text-sm ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white'}`} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Amount (₹)</p>
                    <div className="h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center px-3 text-sm font-bold text-emerald-700">
                      {(item.amount || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {form.items.length === 0 && <p className="text-xs text-slate-400 italic">No items yet. Click "Add item".</p>}
            {form.items.length > 0 && (
              <div className="flex flex-col items-end gap-1 pt-2 pr-1 text-sm">
                <p className={`${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sub Total: <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>₹{subtotal.toLocaleString()}</span></p>
                {Number(form.gst_rate) > 0 && <p className={`${isDark ? 'text-slate-400' : 'text-slate-500'}`}>GST @ {form.gst_rate}%: <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>₹{gst_amount.toLocaleString()}</span></p>}
                <p className="text-base font-bold" style={{ color: COLORS.deepBlue }}>Total: ₹{total.toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Extra checklist items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Extra Checklist Items <span className="text-slate-400 font-normal text-xs">(added to standard checklist)</span></Label>
              <button onClick={addExtraCheck} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" />Add</button>
            </div>
            {form.extra_checklist_items.map((item, i) => (
              <div key={i} className="flex gap-2">
                <Input value={item} onChange={e => updateExtraCheck(i, e.target.value)} placeholder={`Extra doc ${i + 1}`} className="h-9 rounded-xl text-sm flex-1" />
                <button onClick={() => removeExtraCheck(i)} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      );

      case 2: return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Payment Terms</Label>
              <Input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} placeholder="e.g. 50% advance, 50% on completion" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Timeline</Label>
              <Input value={form.timeline} onChange={e => setForm(p => ({ ...p, timeline: e.target.value }))} placeholder="e.g. 7-10 working days" className="h-10 rounded-xl" />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="font-semibold">Advance Terms</Label>
              <Input value={form.advance_terms} onChange={e => setForm(p => ({ ...p, advance_terms: e.target.value }))} placeholder="e.g. 50% advance before commencement" className="h-10 rounded-xl" />
            </div>
          </div>

          {/* Extra Terms */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Additional Terms</Label>
              <button onClick={addExtraTerm} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" />Add term</button>
            </div>
            {form.extra_terms.map((term, i) => (
              <div key={i} className="flex gap-2">
                <Input value={term} onChange={e => updateExtraTerm(i, e.target.value)} placeholder={`Term ${i + 1}`} className="h-9 rounded-xl text-sm flex-1" />
                <button onClick={() => removeExtraTerm(i)} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Internal Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="resize-none rounded-xl text-sm" placeholder="Internal notes (not shown on PDF)…" />
          </div>
        </div>
      );

      case 3: return (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2 text-sm">
            <p className="font-bold text-blue-800 flex items-center gap-2"><Check className="h-4 w-4" />Preview Summary</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <p><span className="text-slate-500">Client:</span> <span className="font-semibold">{form.client_name}</span></p>
              <p><span className="text-slate-500">Service:</span> <span className="font-semibold">{form.service}</span></p>
              <p><span className="text-slate-500">Company:</span> <span className="font-semibold">{companies.find(c => c.id === form.company_id)?.name}</span></p>
              {form.lead_id && <p><span className="text-slate-500">Linked Lead:</span> <span className="font-semibold text-purple-700">{leads.find(l => l.id === form.lead_id)?.company_name || form.lead_id}</span></p>}
              <p><span className="text-slate-500">Items:</span> <span className="font-semibold">{form.items.length} line item{form.items.length !== 1 ? 's' : ''}</span></p>
              <p><span className="text-slate-500">Validity:</span> <span className="font-semibold">{form.validity_days} days</span></p>
            </div>
            {form.items.length > 0 && (
              <div className="pt-2 border-t border-blue-200 space-y-0.5 text-xs text-right">
                <p className="text-slate-600">Subtotal: <span className="font-bold text-slate-800">₹{subtotal.toLocaleString()}</span></p>
                {Number(form.gst_rate) > 0 && <p className="text-slate-600">GST @ {form.gst_rate}%: <span className="font-bold text-slate-800">₹{gst_amount.toLocaleString()}</span></p>}
                <p className="text-base font-bold" style={{ color: COLORS.deepBlue }}>Total: ₹{total.toLocaleString()}</p>
              </div>
            )}
          </div>
          {form.lead_id && (
            <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-700">
              <p className="font-semibold flex items-center gap-1.5"><Link className="h-3.5 w-3.5" />Lead Integration Active</p>
              <p className="mt-0.5">Creating this quotation will auto-update the linked lead's stage to <strong>"Proposal"</strong>.</p>
              <p>When you mark it as <strong>Accepted</strong>, the lead will advance to <strong>"Negotiation"</strong>.</p>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  /* ─── RENDER ─────────────────────────────────────────────────────────────── */
  return (
    <motion.div className={`space-y-5 p-2 md:p-4 min-h-screen rounded-2xl ${isDark ? 'bg-[#0f172a]' : ''}`} variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <Card className={`rounded-3xl overflow-hidden border shadow-sm ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200'}`}>
          <div className="h-1.5 w-full bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600" />
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: isDark ? '#93c5fd' : COLORS.deepBlue }}>Quotations</h1>
              <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{quotations.length} total · {quotations.filter(q => q.status === 'accepted').length} accepted</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-9 rounded-2xl gap-1.5" onClick={() => setCompanyManagerOpen(true)}>
                <Building2 className="h-4 w-4" />Manage Companies
              </Button>
              <Button size="sm" className="h-9 px-4 rounded-2xl shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95"
                onClick={() => { setForm(emptyForm); setEditingQtn(null); setCurrentStep(0); setShowForm(true); }}>
                <Plus className="mr-2 h-4 w-4" />New Quotation
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search quotations…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className={`pl-10 rounded-2xl ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white'}`} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={`w-36 rounded-2xl text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white'}`}><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['draft', 'sent', 'accepted', 'rejected'].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </motion.div>

      {/* ── Quotation Cards ── */}
      {loading
        ? <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className={`h-24 rounded-2xl animate-pulse ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`} />)}</div>
        : filteredQtns.length === 0
          ? <div className="text-center py-20">
              <Receipt className={`h-16 w-16 mx-auto mb-4 ${isDark ? 'text-slate-700' : 'text-slate-200'}`} />
              <p className={`font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No quotations yet</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Click "New Quotation" to create one</p>
            </div>
          : (
            <motion.div className="space-y-3" variants={containerVariants}>
              {filteredQtns.map(q => {
                const linkedLead = q.lead_id ? leads.find(l => l.id === q.lead_id) : null;
                return (
                  <motion.div key={q.id} variants={itemVariants}>
                    <Card className={`rounded-2xl border hover:shadow-md transition-all hover:-translate-y-[1px] cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200'}`} onClick={() => setDetailQtn(q)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{q.quotation_no}</span>
                              <span className={cn('px-2.5 py-0.5 rounded-xl text-[11px] font-bold border capitalize', STATUS_STYLES[q.status] || STATUS_STYLES.draft)}>{q.status}</span>
                              {q.lead_id && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  <Link className="h-3 w-3" />{linkedLead ? linkedLead.company_name : 'Linked Lead'}
                                </span>
                              )}
                            </div>
                            <p className={`text-base font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{q.client_name}</p>
                            <div className={`flex flex-wrap items-center gap-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{q.service}</span>
                              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{q.date}</span>
                              {q.client_phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{q.client_phone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-lg font-bold" style={{ color: isDark ? '#93c5fd' : COLORS.deepBlue }}>₹{(q.total || 0).toLocaleString()}</p>
                              <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{q.items?.length || 0} item{q.items?.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleDownloadPdf(q.id, q.quotation_no)} disabled={!!downloading}
                                className={`p-2 rounded-xl text-slate-400 hover:text-blue-600 transition-all active:scale-90 ${isDark ? 'hover:bg-blue-900/30' : 'hover:bg-blue-50'}`} title="Download PDF">
                                {downloading === q.id + '-pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => openEdit(q)} className={`p-2 rounded-xl text-slate-400 hover:text-blue-600 transition-all active:scale-90 ${isDark ? 'hover:bg-blue-900/30' : 'hover:bg-blue-50'}`} title="Edit"><Edit className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(q.id)} className={`p-2 rounded-xl text-slate-400 hover:text-red-600 transition-all active:scale-90 ${isDark ? 'hover:bg-red-900/30' : 'hover:bg-red-50'}`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

      {/* ── Quotation Detail Modal ── */}
      <QuotationDetailModal
        quotation={detailQtn}
        company={detailCompany}
        open={!!detailQtn}
        onClose={() => setDetailQtn(null)}
        onStatusChange={handleStatusChange}
        onDownloadPdf={handleDownloadPdf}
        onDownloadChecklist={handleDownloadChecklist}
        downloading={downloading}
      />

      {/* ── Company Manager Dialog ── */}
      <Dialog open={companyManagerOpen} onOpenChange={setCompanyManagerOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editingCompany !== null
            ? <CompanyManager editingCompany={editingCompany} onClose={() => setEditingCompany(null)} onSaved={() => { setEditingCompany(null); fetchAll(); }} />
            : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-bold" style={{ color: COLORS.deepBlue }}>Company Profiles</DialogTitle>
                  <Button size="sm" onClick={() => setEditingCompany({})} className="rounded-xl gap-1.5 text-xs" style={{ background: COLORS.emeraldGreen }}>
                    <Plus className="h-3.5 w-3.5" />Add Company
                  </Button>
                </div>
                {companies.length === 0
                  ? <p className="text-slate-400 text-sm text-center py-8">No companies yet.</p>
                  : <div className="space-y-2">{companies.map(c => (
                      <div key={c.id} className={`flex items-center justify-between p-3 rounded-2xl border ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-3">
                          {c.logo_base64 && <img src={c.logo_base64} alt="logo" className={`h-8 w-8 object-contain rounded-lg border p-0.5 ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-white'}`} />}
                          <div>
                            <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{c.name}</p>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingCompany(c)} className="p-2 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all"><Edit className="h-3.5 w-3.5" /></button>
                          <button onClick={async () => {
                            if (!window.confirm('Delete this company?')) return;
                            await api.delete(`/companies/${c.id}`);
                            fetchAll();
                          }} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}</div>}
              </div>
            )}
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Form Dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) closeForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>{editingQtn ? 'Edit Quotation' : 'New Quotation'}</DialogTitle>
            <DialogDescription>Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]}</DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 py-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className={cn('flex items-center gap-1.5 text-xs font-semibold transition-all', i === currentStep ? 'text-indigo-700' : i < currentStep ? 'text-emerald-600' : 'text-slate-400')}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 flex-shrink-0',
                    i === currentStep ? 'bg-indigo-600 text-white border-indigo-600' : i < currentStep ? 'bg-emerald-500 text-white border-emerald-500' : isDark ? 'bg-slate-700 border-slate-500 text-slate-400' : 'bg-white border-slate-300 text-slate-400')}>
                    {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn('flex-1 h-0.5 rounded-full', i < currentStep ? 'bg-emerald-400' : isDark ? 'bg-slate-600' : 'bg-slate-200')} />}
              </React.Fragment>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={currentStep} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: .2 }} className="py-2">
              {renderStep()}
            </motion.div>
          </AnimatePresence>

          <DialogFooter className="gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" onClick={closeForm} className="rounded-2xl">Cancel</Button>
            {currentStep > 0 && <Button variant="outline" onClick={() => setCurrentStep(p => p - 1)} className="rounded-2xl gap-1"><ChevronLeft className="h-4 w-4" />Back</Button>}
            {currentStep < STEPS.length - 1
              ? <Button onClick={() => setCurrentStep(p => p + 1)} disabled={!canGoNext()} className="rounded-2xl gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
              : <Button onClick={handleSubmit} disabled={submitting || !canGoNext()} className="rounded-2xl min-w-[140px]" style={{ background: COLORS.emeraldGreen }}>
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : editingQtn ? 'Update Quotation' : 'Create Quotation'}
                </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
