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
  Send, MessageCircle, Settings,
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
    // Handle non-blob errors as well
    return (
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      'PDF generation failed'
    );
  } catch (e) {
    console.error("Error extracting blob error:", e);
    return 'PDF generation failed due to an unknown error.';
  }
};
//======================Invoicing========================
  
const handleConvertToInvoice = async (qtnId) => {
  const r = await api.post(`/invoices/from-quotation/${qtnId}`);
  toast.success('Converted to invoice!');
  navigate('/invoicing');
};

/* ─── WhatsApp share helper ──────────────────────────────────────────────── */
const openWhatsApp = (phone, message) => {
  // Strip non-digits, add India country code if needed
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  const url = `https://web.whatsapp.com/send?phone=${cleaned}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

/* ─── EmailModal ─────────────────────────────────────────────────────────── */
function EmailModal({ open, onClose, quotation, company, pdfType = 'quotation' }) {
  const [toEmail,  setToEmail]  = useState('');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);

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
        to_email: toEmail,
        subject,
        body,
        pdf_type: pdfType,
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
          <DialogDescription>
            PDF will be generated and attached automatically.
          </DialogDescription>
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
  const [phone,   setPhone]   = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !quotation) return;
    setPhone(quotation.client_phone || '');
    const base = pdfType === 'checklist'
      ? `Hi ${quotation.client_name || ''},\n\nPlease find the document checklist for *${quotation.service}* (Ref: ${quotation.quotation_no}).\n\nKindly arrange the required documents at your earliest.\n\nRegards,\n${company?.name || ''}`
      : `Hi ${quotation.client_name || ''},\n\nPlease find our quotation *${quotation.quotation_no}* for *${quotation.service}*.\n\n💰 *Total: Rs. ${(quotation.total || 0).toLocaleString()}*\n📅 Valid for ${quotation.validity_days || 30} days\n\nLooking forward to working with you.\n\nRegards,\n${company?.name || ''}`;
    setMessage(base);
  }, [open, quotation, company, pdfType]);

  const handleOpen = () => {
    if (!phone.trim()) { toast.error('Enter WhatsApp number'); return; }
    openWhatsApp(phone, message);
    toast.success('WhatsApp Web opened — please attach the PDF manually after downloading it.');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#25D366' }}>
            <MessageCircle className="h-5 w-5" />
            Send via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Opens WhatsApp Web with pre-filled message. Download PDF first then attach it in the chat.
          </DialogDescription>
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
          <Button onClick={handleOpen} className="rounded-xl gap-2 bg-[#25D366] hover:bg-[#20bc5a] text-white">
            <MessageCircle className="h-4 w-4" />Open WhatsApp Web
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── CompanyManager ─────────────────────────────────────────────────────── */
function CompanyManager({ onClose, onSaved, editingCompany }) {
  const { user } = useAuth();
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
    } else {
      setForm({
        name: '', address: '', phone: '', email: '', website: '', gstin: '', pan: '',
        bank_account_name: '', bank_name: '', bank_account_no: '', bank_ifsc: '',
        logo_base64: null, signature_base64: null,
        smtp_host: '', smtp_port: 587, smtp_user: '', smtp_password: '', smtp_from_name: '',
      });
    }
  }, [editingCompany]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, fieldName) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm(prev => ({ ...prev, [fieldName]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
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
          <DialogDescription>
            Manage your company details, bank information, and SMTP settings for email. These details will be used in quotations.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-2 max-h-[60vh] overflow-y-auto pr-4">
          {/* Company Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Info className="h-4 w-4" />Company Details</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Company Name *</Label>
              <Input name="name" value={form.name} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Address</Label>
              <Textarea name="address" value={form.address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone</Label>
              <Input name="phone" value={form.phone} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email</Label>
              <Input name="email" value={form.email} onChange={handleChange} type="email" className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Website</Label>
              <Input name="website" value={form.website} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">GSTIN</Label>
              <Input name="gstin" value={form.gstin} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">PAN</Label>
              <Input name="pan" value={form.pan} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
          </div>

          {/* Bank Details & Logos */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="h-4 w-4" />Bank Details</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank Account Name</Label>
              <Input name="bank_account_name" value={form.bank_account_name} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank Name</Label>
              <Input name="bank_name" value={form.bank_name} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank Account No.</Label>
              <Input name="bank_account_no" value={form.bank_account_no} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank IFSC Code</Label>
              <Input name="bank_ifsc" value={form.bank_ifsc} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>

            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-6"><Tag className="h-4 w-4" />Logos & Signatures</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Company Logo (Base64)</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'logo_base64')} className="h-9 rounded-xl text-sm" ref={logoInputRef} />
              {form.logo_base64 && <img src={form.logo_base64} alt="Company Logo" className="mt-2 h-16 object-contain" />}
              {form.logo_base64 && <Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, logo_base64: null })); if(logoInputRef.current) logoInputRef.current.value = ''; }} className="mt-1">Remove Logo</Button>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Signature (Base64)</Label>
              <Input type="file" accept="image/*" onChange={e => handleFileChange(e, 'signature_base64')} className="h-9 rounded-xl text-sm" ref={signatureInputRef} />
              {form.signature_base64 && <img src={form.signature_base64} alt="Signature" className="mt-2 h-16 object-contain" />}
              {form.signature_base64 && <Button variant="outline" size="sm" onClick={() => { setForm(prev => ({ ...prev, signature_base64: null })); if(signatureInputRef.current) signatureInputRef.current.value = ''; }} className="mt-1">Remove Signature</Button>}
            </div>

            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-6"><Mail className="h-4 w-4" />SMTP Settings (for sending emails)</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SMTP Host</Label>
              <Input name="smtp_host" value={form.smtp_host} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SMTP Port</Label>
              <Input name="smtp_port" value={form.smtp_port} onChange={handleChange} type="number" className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SMTP User (From Email)</Label>
              <Input name="smtp_user" value={form.smtp_user} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SMTP Password</Label>
              <Input name="smtp_password" value={form.smtp_password} onChange={handleChange} type="password" className="h-9 rounded-xl text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">SMTP From Name</Label>
              <Input name="smtp_from_name" value={form.smtp_from_name} onChange={handleChange} className="h-9 rounded-xl text-sm" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Save Company'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── QuotationManager ───────────────────────────────────────────────────── */
function QuotationManager({ onClose, onSaved, editingQuotation }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    company_id: '', lead_id: '', client_name: '', client_address: '', client_email: '', client_phone: '',
    service: '', subject: '', scope_of_work: [''], items: [{ description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }],
    gst_rate: 18.0, payment_terms: '', timeline: '', validity_days: 30, advance_terms: '', extra_terms: [''], notes: '', extra_checklist_items: [''],
    status: 'draft',
  });
  const [companies, setCompanies] = useState([]);
  const [leads, setLeads] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [companiesRes, leadsRes, servicesRes] = await Promise.all([
          api.get('/companies'),
          api.get('/leads'),
          api.get('/quotations/services'),
        ]);
        setCompanies(companiesRes.data);
        setLeads(leadsRes.data);
        setServices(servicesRes.data.services);

        if (editingQuotation) {
          setForm({
            company_id: editingQuotation.company_id || '',
            lead_id: editingQuotation.lead_id || '',
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    }
    setForm(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: 1, unit: 'service', unit_price: 0, amount: 0 }] }));
  };

  const removeItem = (index) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleListChange = (listName, index, value) => {
    const newList = [...form[listName]];
    newList[index] = value;
    setForm(prev => ({ ...prev, [listName]: newList }));
  };

  const addListItem = (listName) => {
    setForm(prev => ({ ...prev, [listName]: [...prev[listName], ''] }));
  };

  const removeListItem = (listName, index) => {
    setForm(prev => ({ ...prev, [listName]: prev[listName].filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (!form.company_id) { toast.error('Please select a company'); return; }
    if (!form.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!form.service.trim()) { toast.error('Service is required'); return; }
    if (form.items.some(item => !item.description.trim() || item.quantity <= 0 || item.unit_price < 0)) {
      toast.error('Please ensure all quotation items have a description, valid quantity, and unit price.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        scope_of_work: form.scope_of_work.filter(s => s.trim() !== ''),
        extra_terms: form.extra_terms.filter(t => t.trim() !== ''),
        extra_checklist_items: form.extra_checklist_items.filter(c => c.trim() !== ''),
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

  const currentCompany = companies.find(c => c.id === form.company_id);
  const currentLead = leads.find(l => l.id === form.lead_id);

  const subtotal = form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const gstAmount = subtotal * (form.gst_rate / 100);
  const total = subtotal + gstAmount;

  if (loading) return <div className="p-4 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" />Loading...</div>;

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Receipt className="h-5 w-5" />
            {editingQuotation ? `Edit Quotation ${editingQuotation.quotation_no}` : 'Create New Quotation'}
          </DialogTitle>
          <DialogDescription>
            Step-by-step process to generate a professional quotation for your clients.
          </DialogDescription>
        </DialogHeader>

        <div className="flex space-x-4 mb-4">
          {STEPS.map((s, i) => (
            <div key={s} className={cn(
              "flex-1 text-center py-2 rounded-xl text-sm font-medium",
              step === (i + 1) ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-500 cursor-pointer hover:bg-slate-100'
            )} onClick={() => setStep(i + 1)}>
              {s}
            </div>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-4">
          {step === 1 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Select Company *</Label>
                <Select name="company_id" value={form.company_id} onValueChange={v => handleChange({ target: { name: 'company_id', value: v } })}>
                  <SelectTrigger className="h-9 rounded-xl text-sm">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(comp => (
                      <SelectItem key={comp.id} value={comp.id}>{comp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Link to Lead (Optional)</Label>
                <Select name="lead_id" value={form.lead_id} onValueChange={v => handleChange({ target: { name: 'lead_id', value: v } })}>
                  <SelectTrigger className="h-9 rounded-xl text-sm">
                    <SelectValue placeholder="Select a lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">-- No Lead --</SelectItem>
                    {leads.map(lead => (
                      <SelectItem key={lead.id} value={lead.id}>{lead.name} ({lead.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Client Name *</Label>
                <Input name="client_name" value={form.client_name} onChange={handleChange} className="h-9 rounded-xl text-sm" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Client Email</Label>
                <Input name="client_email" value={form.client_email} onChange={handleChange} type="email" className="h-9 rounded-xl text-sm" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Client Phone</Label>
                <Input name="client_phone" value={form.client_phone} onChange={handleChange} className="h-9 rounded-xl text-sm" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Client Address</Label>
                <Textarea name="client_address" value={form.client_address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" />
              </motion.div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Service *</Label>
                <Select name="service" value={form.service} onValueChange={v => handleChange({ target: { name: 'service', value: v } })}>
                  <SelectTrigger className="h-9 rounded-xl text-sm">
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Subject</Label>
                <Input name="subject" value={form.subject} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="e.g., Quotation for GST Registration" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-3">
                <Label className="text-xs font-semibold">Scope of Work / Services</Label>
                {form.scope_of_work.map((scopeItem, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={scopeItem}
                      onChange={e => handleListChange('scope_of_work', index, e.target.value)}
                      className="h-9 rounded-xl text-sm"
                      placeholder="e.g., Filing of GSTR-1, GSTR-3B monthly"
                    />
                    {form.scope_of_work.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeListItem('scope_of_work', index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={() => addListItem('scope_of_work')} className="rounded-xl gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-4 w-4" />Add Scope Item
                </Button>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-3">
                <Label className="text-xs font-semibold">Quotation Items *</Label>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs font-semibold text-slate-600 mb-2">
                  <div className="col-span-2">Description</div>
                  <div>Qty</div>
                  <div>Unit</div>
                  <div className="text-right">Unit Price</div>
                  <div className="text-right">Amount</div>
                </div>
                {form.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                    <Input
                      value={item.description}
                      onChange={e => handleItemChange(index, 'description', e.target.value)}
                      className="col-span-2 h-9 rounded-xl text-sm"
                      placeholder="Item Description"
                    />
                    <Input
                      value={item.quantity}
                      onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                      type="number" step="0.01" className="h-9 rounded-xl text-sm"
                    />
                    <Select value={item.unit} onValueChange={v => handleItemChange(index, 'unit', v)}>
                      <SelectTrigger className="h-9 rounded-xl text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map(unit => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={item.unit_price}
                      onChange={e => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      type="number" step="0.01" className="h-9 rounded-xl text-sm text-right"
                    />
                    <Input
                      value={item.amount.toFixed(2)}
                      readOnly
                      className="h-9 rounded-xl text-sm text-right bg-slate-50 text-slate-500"
                    />
                    {form.items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeItem(index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={addItem} className="rounded-xl gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-4 w-4" />Add Item
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">GST Rate (%)</Label>
                <Input name="gst_rate" value={form.gst_rate} onChange={handleChange} type="number" step="0.01" className="h-9 rounded-xl text-sm" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Terms</Label>
                <Textarea name="payment_terms" value={form.payment_terms} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" placeholder="e.g., 50% advance, 50% upon completion" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Timeline</Label>
                <Input name="timeline" value={form.timeline} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="e.g., 7 working days" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Validity (Days)</Label>
                <Input name="validity_days" value={form.validity_days} onChange={handleChange} type="number" className="h-9 rounded-xl text-sm" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Advance Terms</Label>
                <Input name="advance_terms" value={form.advance_terms} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="e.g., 50% advance payment required" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-3">
                <Label className="text-xs font-semibold">Extra Terms & Conditions</Label>
                {form.extra_terms.map((term, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={term}
                      onChange={e => handleListChange('extra_terms', index, e.target.value)}
                      className="h-9 rounded-xl text-sm"
                      placeholder="e.g., All disputes subject to Mumbai jurisdiction"
                    />
                    {form.extra_terms.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeListItem('extra_terms', index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={() => addListItem('extra_terms')} className="rounded-xl gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-4 w-4" />Add Extra Term
                </Button>
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className="resize-none rounded-xl text-sm" placeholder="Any additional notes for the client" />
              </motion.div>
              <motion.div variants={itemVariants} className="space-y-3">
                <Label className="text-xs font-semibold">Extra Document Checklist Items</Label>
                {form.extra_checklist_items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item}
                      onChange={e => handleListChange('extra_checklist_items', index, e.target.value)}
                      className="h-9 rounded-xl text-sm"
                      placeholder="e.g., Copy of Latest Bank Statement"
                    />
                    {form.extra_checklist_items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeListItem('extra_checklist_items', index)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={() => addListItem('extra_checklist_items')} className="rounded-xl gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                  <Plus className="h-4 w-4" />Add Checklist Item
                </Button>
              </motion.div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
              <h3 className="text-lg font-bold" style={{ color: COLORS.deepBlue }}>Quotation Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <motion.div variants={itemVariants}><strong>Company:</strong> {currentCompany?.name}</motion.div>
                <motion.div variants={itemVariants}><strong>Client:</strong> {form.client_name}</motion.div>
                <motion.div variants={itemVariants}><strong>Service:</strong> {form.service}</motion.div>
                <motion.div variants={itemVariants}><strong>Subject:</strong> {form.subject || 'N/A'}</motion.div>
              </div>

              <h4 className="text-md font-semibold mt-4">Items:</h4>
              <ul className="list-disc pl-5">
                {form.items.map((item, index) => (
                  <motion.li key={index} variants={itemVariants}>{item.description} - {item.quantity} {item.unit} @ Rs. {item.unit_price} = Rs. {item.amount.toFixed(2)}</motion.li>
                ))}
              </ul>

              <div className="text-right space-y-1 mt-4">
                <motion.div variants={itemVariants}><strong>Subtotal:</strong> Rs. {subtotal.toFixed(2)}</motion.div>
                <motion.div variants={itemVariants}><strong>GST ({form.gst_rate}%):</strong> Rs. {gstAmount.toFixed(2)}</motion.div>
                <motion.div variants={itemVariants} className="text-lg font-bold" style={{ color: COLORS.emeraldGreen }}>Total: Rs. {total.toFixed(2)}</motion.div>
              </div>

              <h4 className="text-md font-semibold mt-4">Terms:</h4>
              <ul className="list-disc pl-5">
                {form.payment_terms && <motion.li variants={itemVariants}>Payment Terms: {form.payment_terms}</motion.li>}
                {form.timeline && <motion.li variants={itemVariants}>Timeline: {form.timeline}</motion.li>}
                <motion.li variants={itemVariants}>Validity: {form.validity_days} days</motion.li>
                {form.advance_terms && <motion.li variants={itemVariants}>Advance: {form.advance_terms}</motion.li>}
                {form.extra_terms.filter(t => t.trim() !== '').map((term, index) => (
                  <motion.li key={index} variants={itemVariants}>{term}</motion.li>
                ))}
              </ul>

              {form.notes && (
                <motion.div variants={itemVariants} className="mt-4">
                  <h4 className="text-md font-semibold">Notes:</h4>
                  <p>{form.notes}</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(prev => prev - 1)} className="rounded-xl gap-2">
              <ChevronLeft className="h-4 w-4" />Previous
            </Button>
          )}
          {step < STEPS.length && (
            <Button onClick={() => setStep(prev => prev + 1)} className="rounded-xl gap-2" style={{ background: COLORS.deepBlue }}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {step === STEPS.length && (
            <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : 'Save Quotation'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Quotations ─────────────────────────────────────────────────────────── */
export default function Quotations() {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [services, setServices] = useState([]);

  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [isCompanyManagerOpen, setIsCompanyManagerOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailModalQuotation, setEmailModalQuotation] = useState(null);
  const [emailModalPdfType, setEmailModalPdfType] = useState('quotation');

  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalQuotation, setWhatsAppModalQuotation] = useState(null);
  const [whatsAppModalPdfType, setWhatsAppModalPdfType] = useState('quotation');

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
      toast.error(err?.response?.data?.detail || 'Failed to fetch companies or services');
    }
  };

  useEffect(() => {
    fetchCompaniesAndServices();
  }, []);

  useEffect(() => {
    fetchQuotations();
  }, [filterStatus, filterService]);

  const handleNewQuotation = () => {
    setEditingQuotation(null);
    setIsManagerOpen(true);
  };

  const handleEditQuotation = (quotation) => {
    setEditingQuotation(quotation);
    setIsManagerOpen(true);
  };

  const handleDeleteQuotation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this quotation?')) return;
    try {
      await api.delete(`/quotations/${id}`);
      toast.success('Quotation deleted successfully');
      fetchQuotations();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete quotation');
    }
  };

  const handleDownloadPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-pdf');
    try {
      const token   = getToken();
      const baseURL = (api.defaults?.baseURL || '/api').replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/pdf`, {
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });

      const contentType = response.headers?.['content-type'] || '';
      if (!contentType.includes('application/pdf')) {
        const text = await response.data.text();
        try { const json = JSON.parse(text); throw new Error(json?.detail || 'PDF generation failed'); }
        catch { throw new Error(text || 'PDF generation failed'); }
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
      const message = await extractBlobError(err);
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadChecklistPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-checklist-pdf');
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
        try { const json = JSON.parse(text); throw new Error(json?.detail || 'Checklist PDF generation failed'); }
        catch { throw new Error(text || 'Checklist PDF generation failed'); }
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
      const message = await extractBlobError(err);
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const handleEmailPdf = (quotation, pdfType) => {
    setEmailModalQuotation(quotation);
    setEmailModalPdfType(pdfType);
    setIsEmailModalOpen(true);
  };

  const handleWhatsAppPdf = (quotation, pdfType) => {
    setWhatsAppModalQuotation(quotation);
    setWhatsAppModalPdfType(pdfType);
    setIsWhatsAppModalOpen(true);
  };

  const [downloading, setDownloading] = useState(null);

  const filteredQuotations = quotations.filter(q => {
    const matchesSearch = searchTerm === '' ||
      q.quotation_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.service.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getCompanyById = (companyId) => companies.find(c => c.id === companyId);

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>Quotations</h1>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingCompany(null); setIsCompanyManagerOpen(true); }} className="rounded-xl gap-2" variant="outline">
            <Building2 className="h-4 w-4" />Manage Companies
          </Button>
          <Button onClick={handleNewQuotation} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>
            <Plus className="h-4 w-4" />Create New Quotation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Input
          placeholder="Search by QTN No., Client, Service..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="rounded-xl h-10 col-span-2"
          prefix={<Search className="h-4 w-4 text-slate-400" />}
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-10 rounded-xl">
            <SelectValue placeholder="Filter by Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center p-8"><Loader2 className="h-8 w-8 animate-spin mx-auto" />Loading Quotations...</div>
      ) : filteredQuotations.length === 0 ? (
        <div className="text-center p-8 text-slate-500">
          No quotations found. Click "Create New Quotation" to get started!
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredQuotations.map(quotation => (
              <motion.div
                key={quotation.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200 border-t-4" style={{ borderTopColor: COLORS.deepBlue }}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-bold" style={{ color: COLORS.deepBlue }}>{quotation.quotation_no}</h3>
                        <p className="text-sm text-slate-500">Issued: {new Date(quotation.date).toLocaleDateString()}</p>
                      </div>
                      <Badge className={cn("text-xs font-medium px-3 py-1 rounded-full", STATUS_STYLES[quotation.status])}>
                        {quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)}
                      </Badge>
                    </div>

                    <p className="text-slate-700 font-semibold text-lg mb-2">{quotation.client_name}</p>
                    <p className="text-slate-600 text-sm mb-4">For: {quotation.service}</p>

                    <div className="flex items-center justify-between text-sm text-slate-800 mb-4 p-3 bg-slate-50 rounded-xl">
                      <span className="font-medium">Total Amount:</span>
                      <span className="font-bold text-lg" style={{ color: COLORS.emeraldGreen }}>₹ {quotation.total.toLocaleString()}</span>
                    </div>

                    <div className="flex gap-2 flex-wrap mb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(quotation.id, quotation.quotation_no)}
                        disabled={downloading === quotation.id + '-pdf'}
                        className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        {downloading === quotation.id + '-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEmailPdf(quotation, 'quotation')}
                        className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <Mail className="h-4 w-4" /> Email to Client
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleWhatsAppPdf(quotation, 'quotation')}
                        className="rounded-xl gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      >
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </Button>
                    </div>

                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-semibold text-slate-700 mb-2">Document Checklist PDF:</p>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadChecklistPdf(quotation.id, quotation.quotation_no)}
                          disabled={downloading === quotation.id + '-checklist-pdf'}
                          className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          {downloading === quotation.id + '-checklist-pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Checklist
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEmailPdf(quotation, 'checklist')}
                          className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Mail className="h-4 w-4" /> Email Checklist
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWhatsAppPdf(quotation, 'checklist')}
                          className="rounded-xl gap-1 text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <MessageCircle className="h-4 w-4" /> WhatsApp Checklist
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                      <Button variant="outline" size="sm" onClick={() => handleEditQuotation(quotation)} className="rounded-xl gap-1 text-slate-600 border-slate-200 hover:bg-slate-50">
                        <Edit className="h-4 w-4" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeleteQuotation(quotation.id)} className="rounded-xl gap-1 text-red-600 border-red-200 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {isManagerOpen && (
        <QuotationManager
          onClose={() => setIsManagerOpen(false)}
          onSaved={() => { fetchQuotations(); fetchCompaniesAndServices(); }}
          editingQuotation={editingQuotation}
        />
      )}

      {isCompanyManagerOpen && (
        <CompanyManager
          onClose={() => setIsCompanyManagerOpen(false)}
          onSaved={fetchCompaniesAndServices}
          editingCompany={editingCompany}
        />
      )}

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
