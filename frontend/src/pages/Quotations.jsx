import React, { useState, useEffect, useRef } from 'react';
import GifLoader from '@/components/ui/GifLoader.jsx';
import { useNavigate } from 'react-router-dom';
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
  Send, MessageCircle, Settings, Eye, ArrowRight, Users,
  Printer, LayoutGrid, List, TrendingUp, Filter, RefreshCw,
  FileCheck, Clock, XCircle, Zap, BarChart3, ChevronDown,
  CheckCircle2, AlertCircle, DraftingCompass, Sparkles,
  SlidersHorizontal, Keyboard
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
import { generateQuotationHTML } from './QuotationTemplates';

/* ─── Constants ─────────────────────────────────────────────── */
const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A' };

const STEPS = ['Client & Lead', 'Services & Items', 'Terms', 'Preview'];

const UNIT_OPTIONS = ['service', 'month', 'hour', 'year', 'session', 'document', 'return', 'filing', 'visit', 'item'];

const STATUS_META = {
  draft:    { label: 'Draft',    color: '#64748b', bg: 'rgba(100,116,139,0.12)', dot: '#94a3b8', icon: DraftingCompass },
  sent:     { label: 'Sent',     color: '#2563eb', bg: 'rgba(59,130,246,0.12)',  dot: '#3b82f6', icon: Send },
  accepted: { label: 'Accepted', color: '#059669', bg: 'rgba(16,185,129,0.12)', dot: '#10b981', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: '#dc2626', bg: 'rgba(239,68,68,0.12)',  dot: '#ef4444', icon: XCircle },
};

const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: .25 } } };
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: .04 } } };

/* ─── Helpers ────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

const extractBlobError = async (error) => {
  try {
    if (error?.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try { const json = JSON.parse(text); return json?.detail || json?.message || text || 'PDF generation failed'; }
      catch { return text || 'PDF generation failed'; }
    }
    return error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'PDF generation failed';
  } catch { return 'PDF generation failed due to an unknown error.'; }
};

const openWhatsApp = (phone, message) => {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  window.open(`https://web.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(message)}`, '_blank');
};

/* ─── EmailModal ─────────────────────────────────────────────── */
function EmailModal({ open, onClose, quotation, company, pdfType = 'quotation' }) {
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !quotation) return;
    setToEmail(quotation.client_email || '');
    setSubject(`Quotation ${quotation.quotation_no} from ${company?.name || ''}`);
    setBody(
      `Dear ${quotation.client_name || 'Sir/Madam'},\n\n` +
      `Please find attached our ${pdfType === 'checklist' ? 'document checklist' : 'quotation'} ` +
      `${quotation.quotation_no} for ${quotation.service}.\n\n` +
      (pdfType === 'quotation' ? `Total Amount: Rs. ${(quotation.total || 0).toLocaleString()}\nValidity: ${quotation.validity_days || 30} days\n\n` : '') +
      `Regards,\n${company?.name || ''}`
    );
  }, [open, quotation, company, pdfType]);

  const handleSend = async () => {
    if (!toEmail.trim()) { toast.error('Enter recipient email'); return; }
    setSending(true);
    try {
      await api.post(`/quotations/${quotation.id}/send-email`, { to_email: toEmail, subject, body, pdf_type: pdfType });
      toast.success(`Email sent to ${toEmail}`);
      onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to send email'); }
    finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Mail className="h-5 w-5" />Send {pdfType === 'checklist' ? 'Checklist' : 'Quotation'} via Email
          </DialogTitle>
          <DialogDescription>PDF will be generated and attached automatically.</DialogDescription>
        </DialogHeader>
        {!company?.smtp_host && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <Settings className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>SMTP not configured in company profile. Add SMTP settings to enable email sending.</span>
          </div>
        )}
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">To Email *</Label>
            <Input value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="client@company.com" className="h-9 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="h-9 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Message</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="resize-none rounded-xl text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !company?.smtp_host} className="rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Send Email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── WhatsAppModal ──────────────────────────────────────────── */
function WhatsAppModal({ open, onClose, quotation, company, pdfType = 'quotation' }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !quotation) return;
    setPhone(quotation.client_phone || '');
    const base = pdfType === 'checklist'
      ? `Hi ${quotation.client_name || ''},\n\nPlease find the document checklist for *${quotation.service}* (Ref: ${quotation.quotation_no}).\n\nKindly arrange the required documents at your earliest.\n\nRegards,\n${company?.name || ''}`
      : `Hi ${quotation.client_name || ''},\n\nPlease find our quotation *${quotation.quotation_no}* for *${quotation.service}*.\n\n💰 *Total: Rs. ${(quotation.total || 0).toLocaleString()}*\n📅 Valid for ${quotation.validity_days || 30} days\n\nLooking forward to working with you.\n\nRegards,\n${company?.name || ''}`;
    setMessage(base);
  }, [open, quotation, company, pdfType]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#25D366' }}>
            <MessageCircle className="h-5 w-5" />Send via WhatsApp
          </DialogTitle>
          <DialogDescription>Opens WhatsApp Web with pre-filled message.</DialogDescription>
        </DialogHeader>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
          <strong>How it works:</strong> Click "Open WhatsApp Web" — the message will be pre-filled. Download the PDF separately and attach it in the WhatsApp chat.
        </div>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">WhatsApp Number *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="h-9 rounded-xl text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Message</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={7} className="resize-none rounded-xl text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={() => { if (!phone.trim()) { toast.error('Enter WhatsApp number'); return; } openWhatsApp(phone, message); toast.success('WhatsApp Web opened — please attach the PDF manually after downloading it.'); onClose(); }} className="rounded-xl gap-2 bg-[#25D366] hover:bg-[#20bc5a] text-white">
            <MessageCircle className="h-4 w-4" />Open WhatsApp Web
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CompanyManager ─────────────────────────────────────────── */
function CompanyManager({ onClose, onSaved, editingCompany }) {
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', website: '', gstin: '', pan: '',
    bank_account_name: '', bank_name: '', bank_account_no: '', bank_ifsc: '',
    logo_base64: null, signature_base64: null,
    smtp_host: '', smtp_port: 587, smtp_user: '', smtp_password: '', smtp_from_name: '',
  });
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef(null);
  const signatureInputRef = useRef(null);

  useEffect(() => {
    if (editingCompany) {
      setForm({
        name: editingCompany.name || '', address: editingCompany.address || '',
        phone: editingCompany.phone || '', email: editingCompany.email || '',
        website: editingCompany.website || '', gstin: editingCompany.gstin || '',
        pan: editingCompany.pan || '', bank_account_name: editingCompany.bank_account_name || '',
        bank_name: editingCompany.bank_name || '', bank_account_no: editingCompany.bank_account_no || '',
        bank_ifsc: editingCompany.bank_ifsc || '', logo_base64: editingCompany.logo_base64 || null,
        signature_base64: editingCompany.signature_base64 || null, smtp_host: editingCompany.smtp_host || '',
        smtp_port: editingCompany.smtp_port || 587, smtp_user: editingCompany.smtp_user || '',
        smtp_password: editingCompany.smtp_password || '', smtp_from_name: editingCompany.smtp_from_name || '',
      });
    }
  }, [editingCompany]);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 400;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h * MAX / w); w = MAX; } else { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setForm(prev => ({ ...prev, [fieldName]: canvas.toDataURL('image/jpeg', 0.7) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      if (editingCompany) { await api.put(`/companies/${editingCompany.id}`, form); toast.success('Company updated successfully'); }
      else { await api.post('/companies', form); toast.success('Company created successfully'); }
      onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save company'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Building2 className="h-5 w-5" />{editingCompany ? 'Edit Company Profile' : 'Create New Company Profile'}
          </DialogTitle>
          <DialogDescription>Manage your company details, bank information, and SMTP settings for email.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-2 max-h-[60vh] overflow-y-auto pr-4">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Info className="h-4 w-4" />Company Details</h4>
            {[{ label: 'Company Name *', name: 'name', type: 'text' }, { label: 'Phone', name: 'phone', type: 'text' }, { label: 'Email', name: 'email', type: 'email' }, { label: 'Website', name: 'website', type: 'text' }, { label: 'GSTIN', name: 'gstin', type: 'text' }, { label: 'PAN', name: 'pan', type: 'text' }].map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs font-semibold">{f.label}</Label>
                <Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} className="h-9 rounded-xl text-sm" />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Address</Label>
              <Textarea name="address" value={form.address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="h-4 w-4" />Bank Details</h4>
            {[{ label: 'Account Name', name: 'bank_account_name' }, { label: 'Bank Name', name: 'bank_name' }, { label: 'Account No.', name: 'bank_account_no' }, { label: 'IFSC Code', name: 'bank_ifsc' }].map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs font-semibold">{f.label}</Label>
                <Input name={f.name} value={form[f.name]} onChange={handleChange} className="h-9 rounded-xl text-sm" />
              </div>
            ))}
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Tag className="h-4 w-4" />Logo & Signature</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Company Logo</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'logo_base64')} className="h-9 rounded-xl text-sm" ref={logoInputRef} />
              {form.logo_base64 && (<div className="flex items-center gap-2"><img src={form.logo_base64} alt="Logo" className="h-12 object-contain rounded border" /><Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, logo_base64: null })); if (logoInputRef.current) logoInputRef.current.value = ''; }}>Remove</Button></div>)}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Signature</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'signature_base64')} className="h-9 rounded-xl text-sm" ref={signatureInputRef} />
              {form.signature_base64 && (<div className="flex items-center gap-2"><img src={form.signature_base64} alt="Signature" className="h-12 object-contain rounded border" /><Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, signature_base64: null })); if (signatureInputRef.current) signatureInputRef.current.value = ''; }}>Remove</Button></div>)}
            </div>
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Mail className="h-4 w-4" />SMTP Settings</h4>
            {[{ label: 'SMTP Host', name: 'smtp_host', type: 'text' }, { label: 'SMTP Port', name: 'smtp_port', type: 'number' }, { label: 'SMTP User (From Email)', name: 'smtp_user', type: 'text' }, { label: 'SMTP Password', name: 'smtp_password', type: 'password' }, { label: 'From Name', name: 'smtp_from_name', type: 'text' }].map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs font-semibold">{f.label}</Label>
                <Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} className="h-9 rounded-xl text-sm" />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : `${editingCompany ? 'Update' : 'Create'} Company`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CompanyListModal ───────────────────────────────────────── */
function CompanyListModal({ open, onClose, onRefresh }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try { const res = await api.get('/companies'); setCompanies(res.data); }
    catch { toast.error('Failed to load companies'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) fetchCompanies(); }, [open]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete company "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try { await api.delete(`/companies/${id}`); toast.success('Company deleted'); fetchCompanies(); onRefresh(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Failed to delete'); }
    finally { setDeletingId(null); }
  };

  return (
    <>
      <Dialog open={open && !showForm} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Building2 className="h-5 w-5" />Company Profiles
              <Badge className="ml-2 bg-blue-100 text-blue-700">{companies.length}</Badge>
            </DialogTitle>
            <DialogDescription>Manage company profiles used in quotations and invoices.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
              <Plus className="h-4 w-4" />Add New Company
            </Button>
          </div>
          {loading ? <GifLoader /> : companies.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No companies added yet.</p>
              <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="mt-4 rounded-xl gap-2" style={{ background: COLORS.deepBlue }}><Plus className="h-4 w-4" />Add First Company</Button>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
              {companies.map(company => (
                <div key={company.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {company.logo_base64 ? <img src={company.logo_base64} alt="logo" className="w-full h-full object-contain" /> : <Building2 className="h-5 w-5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{company.name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
                      {company.gstin && <span>GSTIN: {company.gstin}</span>}
                      {company.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{company.phone}</span>}
                      {company.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{company.email}</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {company.smtp_host ? <Badge className="text-[10px] px-2 py-0 bg-green-50 text-green-700 border-green-200">Email Ready</Badge> : <Badge className="text-[10px] px-2 py-0 bg-amber-50 text-amber-700 border-amber-200">SMTP Not Set</Badge>}
                      {company.logo_base64 && <Badge className="text-[10px] px-2 py-0 bg-blue-50 text-blue-700 border-blue-200">Has Logo</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setEditingCompany(company); setShowForm(true); }} className="rounded-lg gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Edit className="h-3.5 w-3.5" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(company.id, company.name)} disabled={deletingId === company.id} className="rounded-lg gap-1 text-red-600 border-red-200 hover:bg-red-50">{deletingId === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-xl">Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {showForm && <CompanyManager editingCompany={editingCompany} onClose={() => { setShowForm(false); setEditingCompany(null); }} onSaved={() => { fetchCompanies(); onRefresh(); }} />}
    </>
  );
}

/* ─── QuotationManager ───────────────────────────────────────── */
function QuotationManager({ onClose, onSaved, editingQuotation }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    company_id: '', lead_id: '', client_id: '', client_name: '', client_address: '',
    client_email: '', client_phone: '', service: '', subject: '',
    scope_of_work: [''],
    items: [{ description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }],
    gst_rate: 18.0, payment_terms: '', timeline: '', validity_days: 30,
    advance_terms: '', extra_terms: [''], notes: '', extra_checklist_items: [''],
    status: 'draft',
  });
  const [companies, setCompanies] = useState([]);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [companiesRes, leadsRes, servicesRes, clientsRes] = await Promise.all([
          api.get('/companies'), api.get('/leads'), api.get('/quotations/services'), api.get('/clients'),
        ]);
        setCompanies(companiesRes.data); setLeads(leadsRes.data);
        setServices(servicesRes.data.services); setClients(clientsRes.data);
        if (editingQuotation) {
          setForm({
            company_id: editingQuotation.company_id || '', lead_id: editingQuotation.lead_id || '',
            client_id: editingQuotation.client_id || '', client_name: editingQuotation.client_name || '',
            client_address: editingQuotation.client_address || '', client_email: editingQuotation.client_email || '',
            client_phone: editingQuotation.client_phone || '', service: editingQuotation.service || '',
            subject: editingQuotation.subject || '',
            scope_of_work: editingQuotation.scope_of_work?.length ? editingQuotation.scope_of_work : [''],
            items: editingQuotation.items?.length ? editingQuotation.items : [{ description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }],
            gst_rate: editingQuotation.gst_rate || 18.0, payment_terms: editingQuotation.payment_terms || '',
            timeline: editingQuotation.timeline || '', validity_days: editingQuotation.validity_days || 30,
            advance_terms: editingQuotation.advance_terms || '',
            extra_terms: editingQuotation.extra_terms?.length ? editingQuotation.extra_terms : [''],
            notes: editingQuotation.notes || '',
            extra_checklist_items: editingQuotation.extra_checklist_items?.length ? editingQuotation.extra_checklist_items : [''],
            status: editingQuotation.status || 'draft',
          });
        } else if (companiesRes.data.length > 0) {
          setForm(prev => ({ ...prev, company_id: companiesRes.data[0].id }));
        }
      } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to load data'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [editingQuotation]);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleClientSelect = (clientId) => {
    if (!clientId || clientId === 'none') { setForm(prev => ({ ...prev, client_id: '' })); return; }
    const selectedClient = clients.find(c => c.id === clientId);
    if (!selectedClient) return;
    const addrParts = [selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean);
    const primaryContact = selectedClient.contact_persons?.[0];
    setForm(prev => ({
      ...prev, client_id: clientId, client_name: selectedClient.company_name || '',
      client_email: selectedClient.email || primaryContact?.email || '',
      client_phone: selectedClient.phone || primaryContact?.phone || '',
      client_address: addrParts.join(', '),
    }));
  };

  const handleLeadSelect = (leadId) => {
    if (!leadId || leadId === 'none') { setForm(prev => ({ ...prev, lead_id: '' })); return; }
    setForm(prev => ({ ...prev, lead_id: leadId }));
    const selectedLead = leads.find(l => l.id === leadId);
    if (selectedLead && !form.client_name) {
      setForm(prev => ({
        ...prev, lead_id: leadId,
        client_name: selectedLead.company_name || selectedLead.name || prev.client_name,
        client_email: selectedLead.email || prev.client_email,
        client_phone: selectedLead.phone || prev.client_phone,
      }));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;
    if (field === 'quantity' || field === 'unit_price') newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    setForm(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }] }));
  const removeItem = (index) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  const handleListChange = (listName, index, value) => { const newList = [...form[listName]]; newList[index] = value; setForm(prev => ({ ...prev, [listName]: newList })); };
  const addListItem = (listName) => setForm(prev => ({ ...prev, [listName]: [...prev[listName], ''] }));
  const removeListItem = (listName, index) => setForm(prev => ({ ...prev, [listName]: prev[listName].filter((_, i) => i !== index) }));

  const handleSave = async () => {
    if (!form.company_id) { toast.error('Please select a company'); return; }
    if (!form.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!form.service.trim()) { toast.error('Service is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        scope_of_work: form.scope_of_work.filter(s => s.trim() !== ''),
        extra_terms: form.extra_terms.filter(t => t.trim() !== ''),
        extra_checklist_items: form.extra_checklist_items.filter(c => c.trim() !== ''),
        lead_id: form.lead_id || null, client_id: form.client_id || null,
      };
      if (editingQuotation) { await api.put(`/quotations/${editingQuotation.id}`, payload); toast.success('Quotation updated successfully'); }
      else { await api.post('/quotations', payload); toast.success('Quotation created successfully'); }
      onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save quotation'); }
    finally { setSaving(false); }
  };

  const subtotal = form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const gstAmount = subtotal * (form.gst_rate / 100);
  const total = subtotal + gstAmount;

  if (loading) return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="sr-only">Loading</DialogTitle><DialogDescription className="sr-only">Please wait.</DialogDescription></DialogHeader>
        <div className="flex items-center justify-center py-16"><GifLoader /></div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Receipt className="h-5 w-5" />{editingQuotation ? `Edit Quotation ${editingQuotation.quotation_no}` : 'Create New Quotation'}
          </DialogTitle>
          <DialogDescription>Step-by-step process to generate a professional quotation.</DialogDescription>
        </DialogHeader>
        <div className="flex space-x-2 mb-2">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i + 1)} className={cn("flex-1 text-center py-2 px-1 rounded-xl text-xs font-medium transition-colors", step === (i + 1) ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-50 text-slate-500 hover:bg-slate-100')}>
              <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] mr-1", step === (i + 1) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600')}>{i + 1}</span>{s}
            </button>
          ))}
        </div>
        <div className="max-h-[58vh] overflow-y-auto pr-1">
          {step === 1 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Select Company *</Label>
                  <Select value={form.company_id} onValueChange={v => setForm(prev => ({ ...prev, company_id: v }))}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Link to Lead (Optional)</Label>
                  <Select value={form.lead_id || 'none'} onValueChange={handleLeadSelect}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a lead" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">-- No Lead --</SelectItem>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.company_name || l.name || 'Unnamed'}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </motion.div>
              <motion.div variants={itemVariants} className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <Label className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-2"><Users className="h-3.5 w-3.5" />Select from Client List (auto-fills details)</Label>
                <Select value={form.client_id || 'none'} onValueChange={handleClientSelect}>
                  <SelectTrigger className="h-9 rounded-xl text-sm bg-white"><SelectValue placeholder="Choose existing client…" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">-- Enter manually below --</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}{c.phone ? ` — ${c.phone}` : ''}</SelectItem>)}</SelectContent>
                </Select>
                {form.client_id && <p className="text-[10px] text-blue-600 mt-1">✓ Client details loaded. You can edit them below.</p>}
              </motion.div>
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{ label: 'Client Name *', name: 'client_name', placeholder: 'Full name or company name' }, { label: 'Client Email', name: 'client_email', type: 'email' }, { label: 'Client Phone', name: 'client_phone' }].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <Label className="text-xs font-semibold">{f.label}</Label>
                    <Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type || 'text'} placeholder={f.placeholder} className="h-9 rounded-xl text-sm" />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Client Address</Label>
                  <Textarea name="client_address" value={form.client_address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" />
                </div>
              </motion.div>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Service *</Label>
                  <Select value={form.service} onValueChange={v => setForm(prev => ({ ...prev, service: v }))}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a service" /></SelectTrigger>
                    <SelectContent>{services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Subject</Label>
                  <Input name="subject" value={form.subject} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="e.g., Quotation for GST Registration" />
                </div>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-2">
                <Label className="text-xs font-semibold">Scope of Work / Services</Label>
                {form.scope_of_work.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={s} onChange={e => handleListChange('scope_of_work', i, e.target.value)} className="h-9 rounded-xl text-sm" placeholder="e.g., Filing of GSTR-1 monthly" />
                    {form.scope_of_work.length > 1 && <Button variant="ghost" size="icon" onClick={() => removeListItem('scope_of_work', i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addListItem('scope_of_work')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Scope Item</Button>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-2">
                <Label className="text-xs font-semibold">Quotation Items *</Label>
                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-slate-500 px-1">
                  <div className="col-span-4">Description</div><div className="col-span-2">Qty</div><div className="col-span-2">Unit</div><div className="col-span-2 text-right">Unit Price</div><div className="col-span-2 text-right">Amount</div>
                </div>
                {form.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <Input value={item.description} onChange={e => handleItemChange(i, 'description', e.target.value)} className="col-span-4 h-8 rounded-lg text-sm" placeholder="Item description" />
                    <Input value={item.quantity} onChange={e => handleItemChange(i, 'quantity', parseFloat(e.target.value) || 0)} type="number" step="0.01" className="col-span-2 h-8 rounded-lg text-sm" />
                    <Select value={item.unit} onValueChange={v => handleItemChange(i, 'unit', v)}>
                      <SelectTrigger className="col-span-2 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={item.unit_price} onChange={e => handleItemChange(i, 'unit_price', parseFloat(e.target.value) || 0)} type="number" step="0.01" className="col-span-2 h-8 rounded-lg text-sm text-right" />
                    <div className="col-span-1 text-right text-sm text-slate-600 font-medium">{item.amount.toFixed(0)}</div>
                    {form.items.length > 1 && <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8" onClick={() => removeItem(i)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addItem} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Item</Button>
              </motion.div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[{ label: 'GST Rate (%)', name: 'gst_rate', type: 'number' }, { label: 'Validity (Days)', name: 'validity_days', type: 'number' }, { label: 'Timeline', name: 'timeline', type: 'text', placeholder: 'e.g., 7 working days' }, { label: 'Advance Terms', name: 'advance_terms', type: 'text', placeholder: 'e.g., 50% advance required' }].map(f => (
                <motion.div key={f.name} variants={itemVariants} className="space-y-1.5">
                  <Label className="text-xs font-semibold">{f.label}</Label>
                  <Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} placeholder={f.placeholder || ''} className="h-9 rounded-xl text-sm" />
                </motion.div>
              ))}
              <motion.div variants={itemVariants} className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Payment Terms</Label>
                <Textarea name="payment_terms" value={form.payment_terms} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" placeholder="e.g., 50% advance, 50% upon completion" />
              </motion.div>
              <motion.div variants={itemVariants} className="md:col-span-2 space-y-2">
                <Label className="text-xs font-semibold">Extra Terms & Conditions</Label>
                {form.extra_terms.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={t} onChange={e => handleListChange('extra_terms', i, e.target.value)} className="h-9 rounded-xl text-sm" placeholder="Additional term..." />
                    {form.extra_terms.length > 1 && <Button variant="ghost" size="icon" onClick={() => removeListItem('extra_terms', i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addListItem('extra_terms')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Term</Button>
              </motion.div>
              <motion.div variants={itemVariants} className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" placeholder="Any additional notes for the client" />
              </motion.div>
              <motion.div variants={itemVariants} className="md:col-span-2 space-y-2">
                <Label className="text-xs font-semibold">Extra Document Checklist Items</Label>
                {form.extra_checklist_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={item} onChange={e => handleListChange('extra_checklist_items', i, e.target.value)} className="h-9 rounded-xl text-sm" placeholder="e.g., Latest Bank Statement" />
                    {form.extra_checklist_items.length > 1 && <Button variant="ghost" size="icon" onClick={() => removeListItem('extra_checklist_items', i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => addListItem('extra_checklist_items')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Checklist Item</Button>
              </motion.div>
            </motion.div>
          )}
          {step === 4 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-800">Quotation Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Company:</span> <span className="font-medium">{companies.find(c => c.id === form.company_id)?.name || '—'}</span></div>
                  <div><span className="text-slate-500">Client:</span> <span className="font-medium">{form.client_name}</span></div>
                  <div><span className="text-slate-500">Service:</span> <span className="font-medium">{form.service}</span></div>
                  <div><span className="text-slate-500">GST Rate:</span> <span className="font-medium">{form.gst_rate}%</span></div>
                  <div><span className="text-slate-500">Validity:</span> <span className="font-medium">{form.validity_days} days</span></div>
                </div>
              </div>
              <div className="space-y-2">
                {form.items.filter(it => it.description).map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-700">{item.description} <span className="text-slate-400 text-xs">({item.quantity} {item.unit})</span></span>
                    <span className="font-medium text-slate-800">Rs. {item.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-slate-800 text-white space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-300">Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-300">GST ({form.gst_rate}%)</span><span>Rs. {gstAmount.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-bold border-t border-slate-600 pt-1.5 mt-1"><span>Total Payable</span><span style={{ color: '#4ade80' }}>Rs. {total.toFixed(2)}</span></div>
              </div>
            </motion.div>
          )}
        </div>
        <DialogFooter className="gap-2 pt-2 border-t">
          {step > 1 && <Button variant="outline" onClick={() => setStep(p => p - 1)} className="rounded-xl gap-1"><ChevronLeft className="h-4 w-4" />Previous</Button>}
          {step < STEPS.length && <Button onClick={() => setStep(p => p + 1)} className="rounded-xl gap-1" style={{ background: COLORS.deepBlue }}>Next<ChevronRight className="h-4 w-4" /></Button>}
          {step === STEPS.length && (
            <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Check className="h-4 w-4" />Save Quotation</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Quotations Page ───────────────────────────────────── */
export default function Quotations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDark = useDark();

  const [quotations, setQuotations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [services, setServices] = useState([]);
  const [viewMode, setViewMode] = useState('list');

  // Modals
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [isCompanyListOpen, setIsCompanyListOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailModalQuotation, setEmailModalQuotation] = useState(null);
  const [emailModalPdfType, setEmailModalPdfType] = useState('quotation');
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalQuotation, setWhatsAppModalQuotation] = useState(null);
  const [whatsAppModalPdfType, setWhatsAppModalPdfType] = useState('quotation');
  const [downloading, setDownloading] = useState(null);
  const [convertingId, setConvertingId] = useState(null);

  /* Theme tokens */
  const bg       = isDark ? '#0f172a' : '#F0F4FA';
  const cardBg   = isDark ? '#1e293b' : '#ffffff';
  const cardBdr  = isDark ? '#334155' : '#e2e8f0';
  const textMain = isDark ? '#f1f5f9' : '#0f172a';
  const textSub  = isDark ? '#94a3b8' : '#64748b';
  const inputBg  = isDark ? '#1e293b' : '#ffffff';
  const inputBdr = isDark ? '#334155' : '#e2e8f0';
  const rowHover = isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc';

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      // Don't pass status param when filtering all — avoids sending 'all' as a value
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterService !== 'all') params.service = filterService;
      const res = await api.get('/quotations', { params });
      setQuotations(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to fetch quotations');
      setQuotations([]);
    } finally { setLoading(false); }
  };

  const fetchMeta = async () => {
    try {
      const [companiesRes, servicesRes] = await Promise.all([api.get('/companies'), api.get('/quotations/services')]);
      setCompanies(companiesRes.data);
      setServices(servicesRes.data.services || []);
    } catch { /* non-fatal */ }
  };

  useEffect(() => { fetchMeta(); }, []);
  useEffect(() => { fetchQuotations(); }, [filterStatus, filterService]);

  const handleConvertToInvoice = async (qtnId) => {
    if (!window.confirm('Convert this quotation to a Tax Invoice?')) return;
    setConvertingId(qtnId);
    try { await api.post(`/invoices/from-quotation/${qtnId}`); toast.success('Converted to invoice! Redirecting…'); setTimeout(() => navigate('/invoicing'), 1200); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Conversion failed'); }
    finally { setConvertingId(null); }
  };

  const handleDeleteQuotation = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try { await api.delete(`/quotations/${id}`); toast.success('Quotation deleted'); fetchQuotations(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Failed to delete quotation'); }
  };

  const handlePreviewQuotation = (quotation, company = {}) => {
    const html = generateQuotationHTML(quotation, { company });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  };

  const handlePrintQuotation = (quotation, company = {}) => {
    const html = generateQuotationHTML(quotation, { company });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); win.print();
  };

  const handleDownloadPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-pdf');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/pdf`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `quotation-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      toast.success('Quotation PDF downloaded');
    } catch (err) { toast.error(await extractBlobError(err)); }
    finally { setDownloading(null); }
  };

  const handleDownloadChecklistPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-checklist-pdf');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/checklist-pdf`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `checklist-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      toast.success('Checklist PDF downloaded');
    } catch (err) { toast.error(await extractBlobError(err)); }
    finally { setDownloading(null); }
  };

  const handleStatusChange = async (q, newStatus) => {
    try {
      await api.put(`/quotations/${q.id}`, { status: newStatus });
      toast.success('Status updated');
      fetchQuotations();
    } catch { toast.error('Failed to update status'); }
  };

  const filteredQuotations = quotations.filter(q => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (q.quotation_no?.toLowerCase().includes(s) || q.client_name?.toLowerCase().includes(s) || q.service?.toLowerCase().includes(s) || q.client_email?.toLowerCase().includes(s));
  });

  const getCompanyById = id => companies.find(c => c.id === id);

  /* Stats */
  const stats = {
    total:    quotations.length,
    draft:    quotations.filter(q => q.status === 'draft').length,
    sent:     quotations.filter(q => q.status === 'sent').length,
    accepted: quotations.filter(q => q.status === 'accepted').length,
    rejected: quotations.filter(q => q.status === 'rejected').length,
    value:    quotations.reduce((s, q) => s + (q.total || 0), 0),
  };

  const STAT_CARDS = [
    { label: 'Total',    value: stats.total,                             icon: Receipt,      color: '#1F6FB2', badge: null },
    { label: 'Draft',    value: stats.draft,                             icon: FileText,     color: '#64748b', badge: null },
    { label: 'Sent',     value: stats.sent,                              icon: Send,         color: '#3b82f6', badge: null },
    { label: 'Accepted', value: stats.accepted,                          icon: CheckCircle2, color: '#059669', badge: null },
    { label: 'Value',    value: `₹${stats.value >= 100000 ? (stats.value/100000).toFixed(1)+'L' : stats.value >= 1000 ? (stats.value/1000).toFixed(0)+'k' : stats.value}`, icon: TrendingUp, color: '#a855f7', badge: null },
  ];

  /* ── Action button row shared between board + list ── */
  const ActionButtons = ({ q, compact = false }) => {
    const company = getCompanyById(q.company_id);
    const sz = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
    const btnBase = 'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80 cursor-pointer';

    return (
      <div className="flex flex-wrap gap-1">
        <button onClick={() => handleDownloadPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-pdf'}
          className={btnBase} style={{ background: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', borderColor: 'transparent', color: '#3b82f6' }}>
          {downloading === q.id + '-pdf' ? <Loader2 className={sz + ' animate-spin'} /> : <Download className={sz} />}
          {!compact && 'PDF'}
        </button>
        <button onClick={() => handlePreviewQuotation(q, company || {})}
          className={btnBase} style={{ background: isDark ? 'rgba(168,85,247,0.1)' : '#faf5ff', borderColor: 'transparent', color: '#a855f7' }}>
          <Eye className={sz} />{!compact && 'Preview'}
        </button>
        <button onClick={() => handlePrintQuotation(q, company || {})}
          className={btnBase} style={{ background: isDark ? 'rgba(16,185,129,0.1)' : '#ecfdf5', borderColor: 'transparent', color: '#10b981' }}>
          <Printer className={sz} />{!compact && 'Print'}
        </button>
        <button onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('quotation'); setIsEmailModalOpen(true); }}
          className={btnBase} style={{ background: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', borderColor: 'transparent', color: '#3b82f6' }}>
          <Mail className={sz} />{!compact && 'Email'}
        </button>
        <button onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('quotation'); setIsWhatsAppModalOpen(true); }}
          className={btnBase} style={{ background: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4', borderColor: 'transparent', color: '#22c55e' }}>
          <MessageCircle className={sz} />WA
        </button>
        <button onClick={() => handleConvertToInvoice(q.id)} disabled={convertingId === q.id}
          className={btnBase} style={{ background: isDark ? 'rgba(168,85,247,0.1)' : '#faf5ff', borderColor: 'transparent', color: '#a855f7' }}>
          {convertingId === q.id ? <Loader2 className={sz + ' animate-spin'} /> : <ArrowRight className={sz} />}
          {!compact && 'Invoice'}
        </button>
        <button onClick={() => { setEditingQuotation(q); setIsManagerOpen(true); }}
          className={btnBase} style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', borderColor: cardBdr, color: textSub }}>
          <Edit className={sz} />{!compact && 'Edit'}
        </button>
        <button onClick={() => handleDeleteQuotation(q.id)}
          className={btnBase} style={{ background: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2', borderColor: 'transparent', color: '#ef4444' }}>
          <Trash2 className={sz} />
        </button>
      </div>
    );
  };

  return (
    <div style={{ background: bg, minHeight: '100vh' }} className="transition-colors duration-200">
      <div className="max-w-screen-2xl mx-auto">

        {/* ── Hero Banner (Invoice-style) ── */}
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-lg"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
          <div className="px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Receipt className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Quotations & Proposals</h1>
                <p className="text-white/60 text-sm mt-0.5">
                  GST-compliant · Client proposals · PDF · Email &amp; WhatsApp
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setIsCompanyListOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all">
                <Building2 className="h-4 w-4" />Manage Companies
                {companies.length > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/20">{companies.length}</span>}
              </button>
              <button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-blue-700 hover:bg-blue-50 transition-all shadow-sm">
                <Plus className="h-4 w-4" />New Quotation
              </button>
            </div>
          </div>

          {/* Stat pills inside banner */}
          <div className="px-6 pb-5 grid grid-cols-5 gap-3">
            {STAT_CARDS.map(s => (
              <div key={s.label} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{s.label}</span>
                  <s.icon className="h-3.5 w-3.5 text-white/40" />
                </div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── No company warning ── */}
        {companies.length === 0 && (
          <div className="mx-4 mt-3 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border"
            style={{ background: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb', borderColor: isDark ? 'rgba(245,158,11,0.3)' : '#fde68a', color: isDark ? '#fbbf24' : '#92400e' }}>
            <Info className="h-4 w-4 flex-shrink-0" />
            No company profiles yet.{' '}
            <button onClick={() => setIsCompanyListOpen(true)} className="underline font-semibold">Add a company</button> before creating quotations.
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="mx-4 mt-4 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: textSub }} />
            <input
              placeholder="Search by quotation no., client, service…"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-xl text-sm border outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
              style={{ background: inputBg, borderColor: inputBdr, color: textMain }}
            />
          </div>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="h-10 px-3 rounded-xl text-sm border outline-none cursor-pointer"
            style={{ background: inputBg, borderColor: inputBdr, color: textMain }}>
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Refresh */}
          <button onClick={fetchQuotations}
            className="h-10 w-10 flex items-center justify-center rounded-xl border transition-all hover:opacity-80"
            style={{ background: inputBg, borderColor: inputBdr, color: textSub }}
            title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: cardBdr }}>
            {[{ mode: 'board', icon: LayoutGrid, label: 'Board' }, { mode: 'list', icon: List, label: 'List' }].map(({ mode, icon: Icon, label }) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className="px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-all"
                style={{
                  background: viewMode === mode ? `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` : cardBg,
                  color: viewMode === mode ? '#fff' : textSub,
                }}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div className="mx-4 mt-4 mb-6">
          {loading ? (
            <div className="flex items-center justify-center py-20"><GifLoader /></div>
          ) : filteredQuotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4" style={{ background: cardBg, borderRadius: 16, border: `1px solid ${cardBdr}` }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${COLORS.deepBlue}12` }}>
                <Receipt className="h-8 w-8" style={{ color: COLORS.mediumBlue }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-base" style={{ color: textMain }}>No quotations found</p>
                <p className="text-sm mt-1" style={{ color: textSub }}>{searchTerm ? 'Try a different search term.' : 'Create your first quotation to get started.'}</p>
              </div>
              {!searchTerm && (
                <button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                  <Plus className="h-4 w-4" />Create Quotation
                </button>
              )}
            </div>

          ) : viewMode === 'board' ? (
            /* ══ BOARD VIEW ══ */
            <motion.div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" variants={containerVariants} initial="hidden" animate="visible">
              <AnimatePresence>
                {filteredQuotations.map(q => {
                  const sm = STATUS_META[q.status] || STATUS_META.draft;
                  const company = getCompanyById(q.company_id);
                  return (
                    <motion.div key={q.id} variants={itemVariants} layout exit={{ opacity: 0, scale: 0.95 }}>
                      <div className="rounded-2xl border overflow-hidden transition-all hover:shadow-lg"
                        style={{ background: cardBg, borderColor: cardBdr, borderTop: `3px solid ${sm.dot}` }}>
                        <div className="p-4">
                          {/* Header */}
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-bold text-sm" style={{ color: COLORS.deepBlue }}>{q.quotation_no}</p>
                              <p className="text-[11px] mt-0.5" style={{ color: textSub }}>{q.date} · Valid {q.validity_days}d</p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ background: sm.bg, color: sm.color }}>
                              <sm.icon className="h-3 w-3" />{sm.label}
                            </span>
                          </div>

                          {/* Client */}
                          <div className="mb-3">
                            <p className="font-semibold text-sm truncate" style={{ color: textMain }}>{q.client_name}</p>
                            <p className="text-xs mt-0.5" style={{ color: textSub }}>{q.service}</p>
                            {q.client_phone && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: textSub }}><Phone className="h-3 w-3" />{q.client_phone}</p>}
                            {company && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: textSub }}><Building2 className="h-3 w-3" />{company.name}</p>}
                          </div>

                          {/* Amount */}
                          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-3"
                            style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', border: `1px solid ${cardBdr}` }}>
                            <span className="text-xs font-medium" style={{ color: textSub }}>Total Amount</span>
                            <span className="font-bold text-base" style={{ color: COLORS.emeraldGreen }}>₹{(q.total || 0).toLocaleString()}</span>
                          </div>

                          {/* Status changer */}
                          <select value={q.status || 'draft'} onChange={e => handleStatusChange(q, e.target.value)}
                            className="w-full h-8 px-2 rounded-lg text-xs border mb-3 outline-none"
                            style={{ background: inputBg, borderColor: inputBdr, color: textMain }}>
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="accepted">Accepted</option>
                            <option value="rejected">Rejected</option>
                          </select>

                          {/* Actions */}
                          <ActionButtons q={q} />

                          {/* Checklist section */}
                          <div className="pt-2 mt-2 border-t" style={{ borderColor: cardBdr }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: textSub }}>Document Checklist</p>
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => handleDownloadChecklistPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-checklist-pdf'}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80"
                                style={{ background: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', borderColor: 'transparent', color: '#3b82f6' }}>
                                {downloading === q.id + '-checklist-pdf' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}Checklist PDF
                              </button>
                              <button onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('checklist'); setIsEmailModalOpen(true); }}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80"
                                style={{ background: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff', borderColor: 'transparent', color: '#3b82f6' }}>
                                <Mail className="h-3 w-3" />Email
                              </button>
                              <button onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('checklist'); setIsWhatsAppModalOpen(true); }}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80"
                                style={{ background: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4', borderColor: 'transparent', color: '#22c55e' }}>
                                <MessageCircle className="h-3 w-3" />WA
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>

          ) : (
            /* ══ LIST VIEW ══ */
            <div className="rounded-2xl border overflow-hidden" style={{ background: cardBg, borderColor: cardBdr }}>
              {/* Table header */}
              <div className="grid grid-cols-12 px-4 py-3 text-[10px] font-bold uppercase tracking-widest border-b"
                style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: cardBdr, color: textSub }}>
                <div className="col-span-2">Quot. No.</div>
                <div className="col-span-2">Client</div>
                <div className="col-span-2">Service</div>
                <div className="col-span-1">Date</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-3 text-right">Actions</div>
              </div>

              <AnimatePresence>
                {filteredQuotations.map((q, idx) => {
                  const sm = STATUS_META[q.status] || STATUS_META.draft;
                  const company = getCompanyById(q.company_id);
                  return (
                    <motion.div key={q.id}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.015 }}
                      className="grid grid-cols-12 px-4 py-3 border-b items-center gap-1 transition-colors"
                      style={{ borderColor: cardBdr, background: idx % 2 === 0 ? 'transparent' : rowHover }}>

                      {/* Quot no */}
                      <div className="col-span-2">
                        <p className="text-xs font-bold" style={{ color: COLORS.deepBlue }}>{q.quotation_no}</p>
                        <p className="text-[10px]" style={{ color: textSub }}>Valid {q.validity_days}d</p>
                      </div>

                      {/* Client */}
                      <div className="col-span-2">
                        <p className="text-xs font-semibold truncate" style={{ color: textMain }}>{q.client_name}</p>
                        {company && <p className="text-[10px] truncate" style={{ color: textSub }}>{company.name}</p>}
                      </div>

                      {/* Service */}
                      <div className="col-span-2">
                        <p className="text-xs truncate" style={{ color: textSub }}>{q.service}</p>
                      </div>

                      {/* Date */}
                      <div className="col-span-1">
                        <p className="text-xs" style={{ color: textSub }}>{q.date}</p>
                      </div>

                      {/* Amount */}
                      <div className="col-span-1 text-right">
                        <p className="text-xs font-bold" style={{ color: COLORS.emeraldGreen }}>₹{(q.total || 0).toLocaleString()}</p>
                      </div>

                      {/* Status */}
                      <div className="col-span-1 flex justify-center">
                        <select value={q.status || 'draft'} onChange={e => handleStatusChange(q, e.target.value)}
                          className="h-6 px-1.5 rounded-lg text-[10px] border outline-none font-semibold cursor-pointer"
                          style={{ background: sm.bg, borderColor: 'transparent', color: sm.color }}>
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 flex items-center justify-end gap-1 flex-wrap">
                        <ActionButtons q={q} compact />
                        {/* Checklist in list view — compact buttons */}
                        <button onClick={() => handleDownloadChecklistPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-checklist-pdf'}
                          title="Checklist PDF"
                          className="p-1.5 rounded-lg border transition-all hover:opacity-80"
                          style={{ background: isDark ? 'rgba(99,102,241,0.1)' : '#eef2ff', borderColor: 'transparent', color: '#6366f1' }}>
                          {downloading === q.id + '-checklist-pdf' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Footer */}
              <div className="px-4 py-2.5 text-xs" style={{ color: textSub }}>
                {filteredQuotations.length} quotation{filteredQuotations.length !== 1 ? 's' : ''}
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {isManagerOpen && (
        <QuotationManager
          onClose={() => setIsManagerOpen(false)}
          onSaved={() => { fetchQuotations(); fetchMeta(); }}
          editingQuotation={editingQuotation}
        />
      )}
      <CompanyListModal open={isCompanyListOpen} onClose={() => setIsCompanyListOpen(false)} onRefresh={fetchMeta} />
      {isEmailModalOpen && (
        <EmailModal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)}
          quotation={emailModalQuotation} company={getCompanyById(emailModalQuotation?.company_id)} pdfType={emailModalPdfType} />
      )}
      {isWhatsAppModalOpen && (
        <WhatsAppModal open={isWhatsAppModalOpen} onClose={() => setIsWhatsAppModalOpen(false)}
          quotation={whatsAppModalQuotation} company={getCompanyById(whatsAppModalQuotation?.company_id)} pdfType={whatsAppModalPdfType} />
      )}
    </div>
  );
}
