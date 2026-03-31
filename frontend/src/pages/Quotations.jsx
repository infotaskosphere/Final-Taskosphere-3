import React, { useState, useEffect, useRef } from 'react';
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

const STEPS = ['Client & Lead', 'Services & Items', 'Terms', 'Preview'];

const itemVariants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: .25 } } };
const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: .04 } } };

const UNIT_OPTIONS = ['service', 'month', 'hour', 'year', 'session', 'document', 'return', 'filing', 'visit', 'item'];

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

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
  } catch (e) {
    return 'PDF generation failed due to an unknown error.';
  }
};

/* ─── WhatsApp share helper ──────────────────────────────────────────────── */
const openWhatsApp = (phone, message) => {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  const url = `https://web.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

/* ─── EmailModal ─────────────────────────────────────────────────────────── */
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
      await api.post(`/quotations/${quotation.id}/send-email`, {
        to_email: toEmail, subject, body, pdf_type: pdfType,
      });
      toast.success(`Email sent to ${toEmail}`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Mail className="h-5 w-5" />
            Send {pdfType === 'checklist' ? 'Checklist' : 'Quotation'} via Email
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

/* ─── WhatsAppModal ──────────────────────────────────────────────────────── */
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
          <DialogDescription>Opens WhatsApp Web with pre-filled message. Download PDF first then attach it in the chat.</DialogDescription>
        </DialogHeader>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
          <strong>How it works:</strong> Click "Open WhatsApp Web" — the message will be pre-filled. Download the PDF separately and attach it in the WhatsApp chat.
        </div>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">WhatsApp Number *</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="h-9 rounded-xl text-sm" />
            <p className="text-[10px] text-slate-400">10-digit mobile or with +91 country code</p>
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

/* ─── CompanyManager (Create / Edit single company) ─────────────────────── */
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
        name: editingCompany.name || '',
        address: editingCompany.address || '',
        phone: editingCompany.phone || '',
        email: editingCompany.email || '',
        website: editingCompany.website || '',
        gstin: editingCompany.gstin || '',
        pan: editingCompany.pan || '',
        bank_account_name: editingCompany.bank_account_name || '',
        bank_name: editingCompany.bank_name || '',
        bank_account_no: editingCompany.bank_account_no || '',
        bank_ifsc: editingCompany.bank_ifsc || '',
        logo_base64: editingCompany.logo_base64 || null,
        signature_base64: editingCompany.signature_base64 || null,
        smtp_host: editingCompany.smtp_host || '',
        smtp_port: editingCompany.smtp_port || 587,
        smtp_user: editingCompany.smtp_user || '',
        smtp_password: editingCompany.smtp_password || '',
        smtp_from_name: editingCompany.smtp_from_name || '',
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
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setForm(prev => ({ ...prev, [fieldName]: compressed }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, form);
        toast.success('Company updated successfully');
      } else {
        await api.post('/companies', form);
        toast.success('Company created successfully');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Building2 className="h-5 w-5" />
            {editingCompany ? 'Edit Company Profile' : 'Create New Company Profile'}
          </DialogTitle>
          <DialogDescription>Manage your company details, bank information, and SMTP settings for email.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-2 max-h-[60vh] overflow-y-auto pr-4">
          {/* Company Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Info className="h-4 w-4" />Company Details</h4>
            {[
              { label: 'Company Name *', name: 'name', type: 'text' },
              { label: 'Phone', name: 'phone', type: 'text' },
              { label: 'Email', name: 'email', type: 'email' },
              { label: 'Website', name: 'website', type: 'text' },
              { label: 'GSTIN', name: 'gstin', type: 'text' },
              { label: 'PAN', name: 'pan', type: 'text' },
            ].map(f => (
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

          {/* Bank + SMTP + Logos */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="h-4 w-4" />Bank Details</h4>
            {[
              { label: 'Account Name', name: 'bank_account_name' },
              { label: 'Bank Name', name: 'bank_name' },
              { label: 'Account No.', name: 'bank_account_no' },
              { label: 'IFSC Code', name: 'bank_ifsc' },
            ].map(f => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-xs font-semibold">{f.label}</Label>
                <Input name={f.name} value={form[f.name]} onChange={handleChange} className="h-9 rounded-xl text-sm" />
              </div>
            ))}

            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Tag className="h-4 w-4" />Logo & Signature</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Company Logo</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'logo_base64')} className="h-9 rounded-xl text-sm" ref={logoInputRef} />
              {form.logo_base64 && (
                <div className="flex items-center gap-2">
                  <img src={form.logo_base64} alt="Logo" className="h-12 object-contain rounded border" />
                  <Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, logo_base64: null })); if (logoInputRef.current) logoInputRef.current.value = ''; }}>Remove</Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Signature</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'signature_base64')} className="h-9 rounded-xl text-sm" ref={signatureInputRef} />
              {form.signature_base64 && (
                <div className="flex items-center gap-2">
                  <img src={form.signature_base64} alt="Signature" className="h-12 object-contain rounded border" />
                  <Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, signature_base64: null })); if (signatureInputRef.current) signatureInputRef.current.value = ''; }}>Remove</Button>
                </div>
              )}
            </div>

            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Mail className="h-4 w-4" />SMTP Settings</h4>
            {[
              { label: 'SMTP Host', name: 'smtp_host', type: 'text' },
              { label: 'SMTP Port', name: 'smtp_port', type: 'number' },
              { label: 'SMTP User (From Email)', name: 'smtp_user', type: 'text' },
              { label: 'SMTP Password', name: 'smtp_password', type: 'password' },
              { label: 'From Name', name: 'smtp_from_name', type: 'text' },
            ].map(f => (
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

/* ─── CompanyListModal — shows all companies with edit/delete ────────────── */
function CompanyListModal({ open, onClose, onRefresh }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.get('/companies');
      setCompanies(res.data);
    } catch {
      toast.error('Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchCompanies();
  }, [open]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete company "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/companies/${id}`);
      toast.success('Company deleted');
      fetchCompanies();
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Dialog open={open && !showForm} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <Building2 className="h-5 w-5" />
              Company Profiles
              <Badge className="ml-2 bg-blue-100 text-blue-700">{companies.length}</Badge>
            </DialogTitle>
            <DialogDescription>Manage company profiles used in quotations and invoices.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-end mb-2">
            <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
              <Plus className="h-4 w-4" />Add New Company
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>
          ) : companies.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No companies added yet.</p>
              <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="mt-4 rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
                <Plus className="h-4 w-4" />Add First Company
              </Button>
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
              {companies.map(company => (
                <div key={company.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                  {/* Logo */}
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {company.logo_base64 ? (
                      <img src={company.logo_base64} alt="logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="h-5 w-5 text-slate-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{company.name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
                      {company.gstin && <span>GSTIN: {company.gstin}</span>}
                      {company.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{company.phone}</span>}
                      {company.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{company.email}</span>}
                      {company.bank_name && <span className="flex items-center gap-1"><CreditCard className="h-3 w-3" />{company.bank_name}</span>}
                    </div>
                    {company.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{company.address}</p>}
                    <div className="flex items-center gap-1 mt-1">
                      {company.smtp_host ? (
                        <Badge className="text-[10px] px-2 py-0 bg-green-50 text-green-700 border-green-200">Email Ready</Badge>
                      ) : (
                        <Badge className="text-[10px] px-2 py-0 bg-amber-50 text-amber-700 border-amber-200">SMTP Not Set</Badge>
                      )}
                      {company.logo_base64 && <Badge className="text-[10px] px-2 py-0 bg-blue-50 text-blue-700 border-blue-200">Has Logo</Badge>}
                      {company.signature_base64 && <Badge className="text-[10px] px-2 py-0 bg-purple-50 text-purple-700 border-purple-200">Has Signature</Badge>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setEditingCompany(company); setShowForm(true); }} className="rounded-lg gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                      <Edit className="h-3.5 w-3.5" />Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(company.id, company.name)} disabled={deletingId === company.id} className="rounded-lg gap-1 text-red-600 border-red-200 hover:bg-red-50">
                      {deletingId === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="rounded-xl">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company create/edit form */}
      {showForm && (
        <CompanyManager
          editingCompany={editingCompany}
          onClose={() => { setShowForm(false); setEditingCompany(null); }}
          onSaved={() => { fetchCompanies(); onRefresh(); }}
        />
      )}
    </>
  );
}

/* ─── QuotationManager ───────────────────────────────────────────────────── */
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
          api.get('/companies'),
          api.get('/leads'),
          api.get('/quotations/services'),
          api.get('/clients'),
        ]);
        setCompanies(companiesRes.data);
        setLeads(leadsRes.data);
        setServices(servicesRes.data.services);
        setClients(clientsRes.data);

        if (editingQuotation) {
          setForm({
            company_id: editingQuotation.company_id || '',
            lead_id: editingQuotation.lead_id || '',
            client_id: editingQuotation.client_id || '',
            client_name: editingQuotation.client_name || '',
            client_address: editingQuotation.client_address || '',
            client_email: editingQuotation.client_email || '',
            client_phone: editingQuotation.client_phone || '',
            service: editingQuotation.service || '',
            subject: editingQuotation.subject || '',
            scope_of_work: editingQuotation.scope_of_work?.length ? editingQuotation.scope_of_work : [''],
            items: editingQuotation.items?.length ? editingQuotation.items : [{ description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }],
            gst_rate: editingQuotation.gst_rate || 18.0,
            payment_terms: editingQuotation.payment_terms || '',
            timeline: editingQuotation.timeline || '',
            validity_days: editingQuotation.validity_days || 30,
            advance_terms: editingQuotation.advance_terms || '',
            extra_terms: editingQuotation.extra_terms?.length ? editingQuotation.extra_terms : [''],
            notes: editingQuotation.notes || '',
            extra_checklist_items: editingQuotation.extra_checklist_items?.length ? editingQuotation.extra_checklist_items : [''],
            status: editingQuotation.status || 'draft',
          });
        } else if (companiesRes.data.length > 0) {
          setForm(prev => ({ ...prev, company_id: companiesRes.data[0].id }));
        }
      } catch (err) {
        toast.error(err?.response?.data?.detail || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [editingQuotation]);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // Auto-fill client details when a client is selected from the list
  const handleClientSelect = (clientId) => {
      if (!clientId || clientId === 'none') {
        setForm(prev => ({ ...prev, client_id: '' }));
        return;
      }
      const selectedClient = clients.find(c => c.id === clientId);
      if (!selectedClient) return; // Guard clause
      if (selectedClient) {
      // Build address from available fields
      const addrParts = [selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean);
      const fullAddress = addrParts.join(', ');

      // Get primary contact person phone/email if available
      const primaryContact = selectedClient.contact_persons?.[0];

      setForm(prev => ({
        ...prev,
        client_id: clientId,
        client_name: selectedClient.company_name || '',
        client_email: selectedClient.email || primaryContact?.email || '',
        client_phone: selectedClient.phone || primaryContact?.phone || '',
        client_address: fullAddress,
      }));
    }
  };

  // When lead is selected, auto-fill if lead has client info
  const handleLeadSelect = (leadId) => {
    setForm(prev => ({ ...prev, lead_id: leadId }));
    if (!leadId) return;
    const selectedLead = leads.find(l => l.id === leadId);
    if (selectedLead && !form.client_name) {
      setForm(prev => ({
        ...prev,
        lead_id: leadId,
        client_name: selectedLead.name || prev.client_name,
        client_email: selectedLead.email || prev.client_email,
        client_phone: selectedLead.phone || prev.client_phone,
      }));
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    }
    setForm(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }] }));
  const removeItem = (index) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const handleListChange = (listName, index, value) => {
    const newList = [...form[listName]];
    newList[index] = value;
    setForm(prev => ({ ...prev, [listName]: newList }));
  };
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
        lead_id: form.lead_id || null,
        client_id: form.client_id || null,
      };

      if (editingQuotation) {
        await api.put(`/quotations/${editingQuotation.id}`, payload);
        toast.success('Quotation updated successfully');
      } else {
        await api.post('/quotations', payload);
        toast.success('Quotation created successfully');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  };

  const subtotal = form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const gstAmount = subtotal * (form.gst_rate / 100);
  const total = subtotal + gstAmount;

  if (loading) return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-slate-500">Loading data…</span>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Receipt className="h-5 w-5" />
            {editingQuotation ? `Edit Quotation ${editingQuotation.quotation_no}` : 'Create New Quotation'}
          </DialogTitle>
          <DialogDescription>Step-by-step process to generate a professional quotation.</DialogDescription>
        </DialogHeader>

        {/* Step tabs */}
        <div className="flex space-x-2 mb-2">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i + 1)} className={cn(
              "flex-1 text-center py-2 px-1 rounded-xl text-xs font-medium transition-colors",
              step === (i + 1) ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            )}>
              <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] mr-1", step === (i + 1) ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600')}>{i + 1}</span>
              {s}
            </button>
          ))}
        </div>

        <div className="max-h-[58vh] overflow-y-auto pr-1">

          {/* ── STEP 1: Client & Lead ── */}
          {step === 1 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">

              {/* Company selector */}
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Select Company *</Label>
                  <Select value={form.company_id} onValueChange={v => setForm(prev => ({ ...prev, company_id: v }))}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {companies.length === 0 && <p className="text-xs text-amber-600">No companies found. Please add a company first.</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Link to Lead (Optional)</Label>
                  <Select value={form.lead_id || ''} onValueChange={handleLeadSelect}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a lead" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">-- No Lead --</SelectItem>
                      {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.email})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </motion.div>

              {/* Client from clients list */}
              <motion.div variants={itemVariants} className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <Label className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-2">
                  <Users className="h-3.5 w-3.5" />Select from Client List (auto-fills details)
                </Label>
                <Select value={form.client_id || ''} onValueChange={handleClientSelect}>
                  <SelectTrigger className="h-9 rounded-xl text-sm bg-white"><SelectValue placeholder="Choose existing client…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">-- Enter manually below --</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company_name}{c.phone ? ` — ${c.phone}` : ''}{c.email ? ` — ${c.email}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.client_id && <p className="text-[10px] text-blue-600 mt-1">✓ Client details loaded. You can edit them below.</p>}
              </motion.div>

              {/* Manual client fields */}
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Client Name *</Label>
                  <Input name="client_name" value={form.client_name} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="Full name or company name" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Client Email</Label>
                  <Input name="client_email" value={form.client_email} onChange={handleChange} type="email" className="h-9 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Client Phone</Label>
                  <Input name="client_phone" value={form.client_phone} onChange={handleChange} className="h-9 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Client Address</Label>
                  <Textarea name="client_address" value={form.client_address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ── STEP 2: Services & Items ── */}
          {step === 2 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Service *</Label>
                  <Select value={form.service} onValueChange={v => setForm(prev => ({ ...prev, service: v }))}>
                    <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a service" /></SelectTrigger>
                    <SelectContent>
                      {services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
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
                <Button variant="outline" size="sm" onClick={() => addListItem('scope_of_work')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-3.5 w-3.5" />Add Scope Item
                </Button>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-2">
                <Label className="text-xs font-semibold">Quotation Items *</Label>
                <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-slate-500 px-1">
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Unit</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Amount</div>
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
                <Button variant="outline" size="sm" onClick={addItem} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-3.5 w-3.5" />Add Item
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* ── STEP 3: Terms ── */}
          {step === 3 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'GST Rate (%)', name: 'gst_rate', type: 'number' },
                { label: 'Validity (Days)', name: 'validity_days', type: 'number' },
                { label: 'Timeline', name: 'timeline', type: 'text', placeholder: 'e.g., 7 working days' },
                { label: 'Advance Terms', name: 'advance_terms', type: 'text', placeholder: 'e.g., 50% advance required' },
              ].map(f => (
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
                <Button variant="outline" size="sm" onClick={() => addListItem('extra_terms')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-3.5 w-3.5" />Add Term
                </Button>
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
                <Button variant="outline" size="sm" onClick={() => addListItem('extra_checklist_items')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-3.5 w-3.5" />Add Checklist Item
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* ── STEP 4: Preview ── */}
          {step === 4 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h3 className="font-bold text-slate-800">Quotation Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-500">Company:</span> <span className="font-medium">{companies.find(c => c.id === form.company_id)?.name || '—'}</span></div>
                  <div><span className="text-slate-500">Client:</span> <span className="font-medium">{form.client_name}</span></div>
                  <div><span className="text-slate-500">Service:</span> <span className="font-medium">{form.service}</span></div>
                  <div><span className="text-slate-500">GST Rate:</span> <span className="font-medium">{form.gst_rate}%</span></div>
                  {form.client_email && <div><span className="text-slate-500">Email:</span> <span className="font-medium">{form.client_email}</span></div>}
                  {form.client_phone && <div><span className="text-slate-500">Phone:</span> <span className="font-medium">{form.client_phone}</span></div>}
                  {form.timeline && <div><span className="text-slate-500">Timeline:</span> <span className="font-medium">{form.timeline}</span></div>}
                  <div><span className="text-slate-500">Validity:</span> <span className="font-medium">{form.validity_days} days</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Items</h4>
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
                <div className="flex justify-between text-base font-bold border-t border-slate-600 pt-1.5 mt-1">
                  <span>Total Payable</span>
                  <span style={{ color: '#4ade80' }}>Rs. {total.toFixed(2)}</span>
                </div>
              </div>

              {form.notes && (
                <div className="text-xs text-slate-500 italic bg-yellow-50 border border-yellow-100 rounded-lg p-2">
                  Note: {form.notes}
                </div>
              )}
            </motion.div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(p => p - 1)} className="rounded-xl gap-1">
              <ChevronLeft className="h-4 w-4" />Previous
            </Button>
          )}
          {step < STEPS.length && (
            <Button onClick={() => setStep(p => p + 1)} className="rounded-xl gap-1" style={{ background: COLORS.deepBlue }}>
              Next<ChevronRight className="h-4 w-4" />
            </Button>
          )}
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

/* ─── Main Quotations Page ───────────────────────────────────────────────── */
export default function Quotations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all_statuses');
  const [filterService, setFilterService] = useState('all_services');
  const [searchTerm, setSearchTerm] = useState('');
  const [services, setServices] = useState([]);

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

  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterService !== 'all') params.service = filterService;
      const res = await api.get('/quotations', { params });
      setQuotations(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompaniesAndServices = async () => {
    try {
      const [companiesRes, servicesRes] = await Promise.all([
        api.get('/companies'),
        api.get('/quotations/services'),
      ]);
      setCompanies(companiesRes.data);
      setServices(servicesRes.data.services);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to fetch companies');
    }
  };

  useEffect(() => { fetchCompaniesAndServices(); }, []);
  useEffect(() => { fetchQuotations(); }, [filterStatus, filterService]);

  const handleConvertToInvoice = async (qtnId) => {
    if (!window.confirm('Convert this quotation to a Tax Invoice?')) return;
    setConvertingId(qtnId);
    try {
      await api.post(`/invoices/from-quotation/${qtnId}`);
      toast.success('Converted to invoice! Redirecting…');
      setTimeout(() => navigate('/invoicing'), 1200);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Conversion failed');
    } finally {
      setConvertingId(null);
    }
  };

  const handleDeleteQuotation = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      await api.delete(`/quotations/${id}`);
      toast.success('Quotation deleted');
      fetchQuotations();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete quotation');
    }
  };

  const handleDownloadPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-pdf');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = response.headers?.['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        const text = await response.data.text();
        try { const json = JSON.parse(text); throw new Error(json?.detail || 'PDF failed'); }
        catch { throw new Error(text || 'PDF failed'); }
      }
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `quotation-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Quotation PDF downloaded');
    } catch (err) {
      toast.error(await extractBlobError(err));
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadChecklistPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-checklist-pdf');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/checklist-pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = response.headers?.['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        const text = await response.data.text();
        try { const json = JSON.parse(text); throw new Error(json?.detail || 'Checklist PDF failed'); }
        catch { throw new Error(text || 'Checklist PDF failed'); }
      }
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `checklist-${(qtnNo || qtnId).replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Checklist PDF downloaded');
    } catch (err) {
      toast.error(await extractBlobError(err));
    } finally {
      setDownloading(null);
    }
  };

  const filteredQuotations = quotations.filter(q => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      q.quotation_no?.toLowerCase().includes(s) ||
      q.client_name?.toLowerCase().includes(s) ||
      q.service?.toLowerCase().includes(s) ||
      q.client_email?.toLowerCase().includes(s)
    );
  });

  const getCompanyById = id => companies.find(c => c.id === id);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>Quotations</h1>
          <p className="text-sm text-slate-500 mt-0.5">{quotations.length} quotation{quotations.length !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setIsCompanyListOpen(true)} variant="outline" className="rounded-xl gap-2">
            <Building2 className="h-4 w-4" />
            Manage Companies
            {companies.length > 0 && <Badge className="ml-1 bg-blue-100 text-blue-700 text-[10px]">{companies.length}</Badge>}
          </Button>
          <Button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
            <Plus className="h-4 w-4" />New Quotation
          </Button>
        </div>
      </div>

      {/* Company quick summary */}
      {companies.length === 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>No company profiles yet. <button onClick={() => setIsCompanyListOpen(true)} className="underline font-semibold">Add a company</button> before creating quotations.</span>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by quotation no., client, service…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-10 rounded-xl" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Filter by Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all_statuses">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotation Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          <span className="text-slate-500">Loading quotations…</span>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Receipt className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No quotations found</p>
          <p className="text-sm mt-1">Create your first quotation to get started.</p>
          <Button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }} className="mt-4 rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
            <Plus className="h-4 w-4" />Create Quotation
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence>
            {filteredQuotations.map(q => (
              <motion.div key={q.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
                <Card className="rounded-2xl shadow-md hover:shadow-lg transition-shadow border-t-4" style={{ borderTopColor: COLORS.deepBlue }}>
                  <CardContent className="p-5">
                    {/* Card Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>{q.quotation_no}</p>
                        <p className="text-xs text-slate-400">{q.date} · Valid {q.validity_days}d</p>
                      </div>
                      <Badge className={cn("text-xs font-medium px-3 py-1 rounded-full border", STATUS_STYLES[q.status] || STATUS_STYLES.draft)}>
                        {q.status}
                      </Badge>
                    </div>

                    {/* Client info */}
                    <div className="mb-3">
                      <p className="font-semibold text-slate-800">{q.client_name}</p>
                      <p className="text-xs text-slate-500">{q.service}</p>
                      {q.client_phone && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{q.client_phone}</p>}
                    </div>

                    {/* Company badge */}
                    {getCompanyById(q.company_id) && (
                      <div className="flex items-center gap-1.5 mb-3 text-xs text-slate-500">
                        <Building2 className="h-3 w-3" />
                        <span>{getCompanyById(q.company_id)?.name}</span>
                      </div>
                    )}

                    {/* Total */}
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-3">
                      <span className="text-sm text-slate-600 font-medium">Total Amount</span>
                      <span className="font-bold text-lg" style={{ color: COLORS.emeraldGreen }}>₹ {(q.total || 0).toLocaleString()}</span>
                    </div>

                    {/* Status changer */}
                    <div className="mb-3">
                      <Select value={q.status || 'draft'} onValueChange={async (newStatus) => {
                        try {
                          await api.put(`/quotations/${q.id}`, { status: newStatus });
                          toast.success('Status updated');
                          fetchQuotations();
                        } catch { toast.error('Failed to update status'); }
                      }}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="accepted">Accepted</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Quotation PDF actions */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-pdf'} className="rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                        {downloading === q.id + '-pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('quotation'); setIsEmailModalOpen(true); }} className="rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                        <Mail className="h-3.5 w-3.5" />Email
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('quotation'); setIsWhatsAppModalOpen(true); }} className="rounded-lg gap-1 text-xs text-green-600 border-green-200 hover:bg-green-50">
                        <MessageCircle className="h-3.5 w-3.5" />WA
                      </Button>
                    </div>

                    {/* Checklist PDF actions */}
                    <div className="border-t pt-2 mb-2">
                      <p className="text-[10px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wide">Document Checklist</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => handleDownloadChecklistPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-checklist-pdf'} className="rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                          {downloading === q.id + '-checklist-pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Checklist PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('checklist'); setIsEmailModalOpen(true); }} className="rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                          <Mail className="h-3.5 w-3.5" />Email
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('checklist'); setIsWhatsAppModalOpen(true); }} className="rounded-lg gap-1 text-xs text-green-600 border-green-200 hover:bg-green-50">
                          <MessageCircle className="h-3.5 w-3.5" />WA
                        </Button>
                      </div>
                    </div>

                    {/* Bottom actions */}
                    <div className="flex justify-between items-center pt-2 border-t gap-1 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => handleConvertToInvoice(q.id)} disabled={convertingId === q.id} className="rounded-lg gap-1 text-xs text-purple-600 border-purple-200 hover:bg-purple-50">
                        {convertingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}To Invoice
                      </Button>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => { setEditingQuotation(q); setIsManagerOpen(true); }} className="rounded-lg gap-1 text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                          <Edit className="h-3.5 w-3.5" />Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteQuotation(q.id)} className="rounded-lg gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Modals ── */}
      {isManagerOpen && (
        <QuotationManager
          onClose={() => setIsManagerOpen(false)}
          onSaved={() => { fetchQuotations(); fetchCompaniesAndServices(); }}
          editingQuotation={editingQuotation}
        />
      )}

      <CompanyListModal
        open={isCompanyListOpen}
        onClose={() => setIsCompanyListOpen(false)}
        onRefresh={fetchCompaniesAndServices}
      />

      {isEmailModalOpen && (
        <EmailModal
          open={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          quotation={emailModalQuotation}
          company={getCompanyById(emailModalQuotation?.company_id)}
          pdfType={emailModalPdfType}
        />
      )}

      {isWhatsAppModalOpen && (
        <WhatsAppModal
          open={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          quotation={whatsAppModalQuotation}
          company={getCompanyById(whatsAppModalQuotation?.company_id)}
          pdfType={whatsAppModalPdfType}
        />
      )}
    </div>
  );
}
