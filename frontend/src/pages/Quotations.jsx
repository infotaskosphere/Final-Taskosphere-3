import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import axios from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit, Trash2, Download, Search, Building2, FileText,
  ChevronRight, ChevronLeft, Check, X, Loader2, Receipt,
  Phone, Mail, Globe, CreditCard, User, Tag, Info,
  IndianRupee, Percent, Hash, Calendar, Link, ExternalLink,
  Send, MessageCircle, Settings, Eye, ArrowRight, Users,
  Printer, LayoutGrid, List, Filter, TrendingUp, AlertCircle,
  CheckCircle2, Clock, ArrowUpRight, RefreshCw, FileCheck,
  DollarSign, BarChart3
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generateQuotationHTML } from './QuotationTemplates';

// ─── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber:        '#F59E0B',
  coral:        '#EF4444',
  purple:       '#7C3AED',
};

// ─── Dark palette (mirrors Dashboard) ────────────────────────────────────────
const D = {
  bg: '#0f172a', card: '#1e293b', raised: '#263348',
  border: '#334155', text: '#f1f5f9', muted: '#94a3b8', dimmer: '#64748b',
};

const STATUS_META = {
  draft:    { label: 'Draft',    bg: 'bg-slate-100 dark:bg-slate-700',    text: 'text-slate-600 dark:text-slate-300',    dot: 'bg-slate-400',   hex: '#94A3B8', darkBg: 'rgba(148,163,184,0.15)' },
  sent:     { label: 'Sent',     bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-600 dark:text-blue-400',      dot: 'bg-blue-500',    hex: '#1F6FB2', darkBg: 'rgba(31,111,178,0.20)'  },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', hex: '#1FAF5A', darkBg: 'rgba(31,175,90,0.15)'  },
  rejected: { label: 'Rejected', bg: 'bg-red-50 dark:bg-red-900/20',     text: 'text-red-600 dark:text-red-400',        dot: 'bg-red-500',     hex: '#EF4444', darkBg: 'rgba(239,68,68,0.15)'   },
};

const STEPS = ['Client & Lead', 'Services & Items', 'Terms', 'Preview'];
const UNIT_OPTIONS = ['service','month','hour','year','session','document','return','filing','visit','item'];

const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
const fmtC = (n) => `₹${fmt(n)}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
const avatarGrad = (name) => {
  const colors = ['#0D3B66','#1F6FB2','#1FAF5A','#7C3AED','#F59E0B','#EF4444','#0D9488'];
  const i = (name || '?').charCodeAt(0) % colors.length;
  return `linear-gradient(135deg, ${colors[i]}, ${colors[(i+2)%colors.length]})`;
};

// ════════════════════════════════════════════════════════════════════════════════
// STAT CARD (matches Invoicing exactly)
// ════════════════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sub, icon: Icon, color, bg, onClick, isDark, trend }) => (
  <div onClick={onClick}
    className={`rounded-2xl border p-5 relative overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}>
    <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: color }} />
    <div className="flex items-start justify-between mb-3 pl-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}><Icon className="h-5 w-5" style={{ color }} /></div>
      {trend !== undefined && (<span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{trend >= 0 ? '+' : ''}{trend}%</span>)}
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 pl-2 text-slate-400">{label}</p>
    <p className={`text-2xl font-bold tracking-tight pl-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
    {sub && <p className={`text-xs pl-2 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
  </div>
);

// ── Status chip ───────────────────────────────────────────────────────────────
const StatusChip = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${m.bg} ${m.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// EMAIL MODAL
// ════════════════════════════════════════════════════════════════════════════════
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
      toast.success(`Email sent to ${toEmail}`); onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to send email'); }
    finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Mail className="h-5 w-5" /> Send {pdfType === 'checklist' ? 'Checklist' : 'Quotation'} via Email
          </DialogTitle>
          <DialogDescription>PDF will be generated and attached automatically.</DialogDescription>
        </DialogHeader>
        {!company?.smtp_host && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <Settings className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>SMTP not configured. Add SMTP settings in company profile to enable email.</span>
          </div>
        )}
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">To Email *</Label><Input value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="client@company.com" className="h-9 rounded-xl text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Subject</Label><Input value={subject} onChange={e => setSubject(e.target.value)} className="h-9 rounded-xl text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Message</Label><Textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="resize-none rounded-xl text-sm" /></div>
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

// ════════════════════════════════════════════════════════════════════════════════
// WHATSAPP MODAL
// ════════════════════════════════════════════════════════════════════════════════
function WhatsAppModal({ open, onClose, quotation, company, pdfType = 'quotation' }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !quotation) return;
    setPhone(quotation.client_phone || '');
    const base = pdfType === 'checklist'
      ? `Hi ${quotation.client_name || ''},\n\nPlease find the document checklist for *${quotation.service}* (Ref: ${quotation.quotation_no}).\n\nKindly arrange the required documents.\n\nRegards,\n${company?.name || ''}`
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
          <DialogDescription>Opens WhatsApp Web. Download PDF first, then attach in the chat.</DialogDescription>
        </DialogHeader>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
          <strong>How it works:</strong> Click "Open WhatsApp Web" — message will be pre-filled. Download PDF separately and attach.
        </div>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">WhatsApp Number *</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="h-9 rounded-xl text-sm" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Message</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} rows={7} className="resize-none rounded-xl text-sm" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={() => { if (!phone.trim()) { toast.error('Enter WhatsApp number'); return; } openWhatsApp(phone, message); toast.success('WhatsApp Web opened — attach the PDF manually.'); onClose(); }} className="rounded-xl gap-2 bg-[#25D366] hover:bg-[#20bc5a] text-white">
            <MessageCircle className="h-4 w-4" />Open WhatsApp Web
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPANY MANAGER
// ════════════════════════════════════════════════════════════════════════════════
function CompanyManager({ onClose, onSaved, editingCompany }) {
  const [form, setForm] = useState({ name:'', address:'', phone:'', email:'', website:'', gstin:'', pan:'', bank_account_name:'', bank_name:'', bank_account_no:'', bank_ifsc:'', logo_base64:null, signature_base64:null, smtp_host:'', smtp_port:587, smtp_user:'', smtp_password:'', smtp_from_name:'' });
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef(null);
  const sigInputRef = useRef(null);

  useEffect(() => { if (editingCompany) setForm({ name:editingCompany.name||'', address:editingCompany.address||'', phone:editingCompany.phone||'', email:editingCompany.email||'', website:editingCompany.website||'', gstin:editingCompany.gstin||'', pan:editingCompany.pan||'', bank_account_name:editingCompany.bank_account_name||'', bank_name:editingCompany.bank_name||'', bank_account_no:editingCompany.bank_account_no||'', bank_ifsc:editingCompany.bank_ifsc||'', logo_base64:editingCompany.logo_base64||null, signature_base64:editingCompany.signature_base64||null, smtp_host:editingCompany.smtp_host||'', smtp_port:editingCompany.smtp_port||587, smtp_user:editingCompany.smtp_user||'', smtp_password:editingCompany.smtp_password||'', smtp_from_name:editingCompany.smtp_from_name||'' }); }, [editingCompany]);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleFileChange = (e, field) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => { const canvas = document.createElement('canvas'); const MAX=400; let w=img.width,h=img.height; if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}} canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h); setForm(prev=>({...prev,[field]:canvas.toDataURL('image/jpeg',0.7)})); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      editingCompany ? await api.put(`/companies/${editingCompany.id}`, form) : await api.post('/companies', form);
      toast.success(editingCompany ? 'Company updated' : 'Company created'); onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save company'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={true} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}><Building2 className="h-5 w-5" />{editingCompany ? 'Edit Company Profile' : 'Create New Company Profile'}</DialogTitle>
          <DialogDescription>Manage company details, bank info, and SMTP settings.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-2 max-h-[60vh] overflow-y-auto pr-4">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Info className="h-4 w-4" />Company Details</h4>
            {[{label:'Company Name *',name:'name',type:'text'},{label:'Phone',name:'phone',type:'text'},{label:'Email',name:'email',type:'email'},{label:'Website',name:'website',type:'text'},{label:'GSTIN',name:'gstin',type:'text'},{label:'PAN',name:'pan',type:'text'}].map(f=>(
              <div key={f.name} className="space-y-1.5"><Label className="text-xs font-semibold">{f.label}</Label><Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} className="h-9 rounded-xl text-sm" /></div>
            ))}
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Address</Label><Textarea name="address" value={form.address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" /></div>
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><CreditCard className="h-4 w-4" />Bank Details</h4>
            {[{label:'Account Name',name:'bank_account_name'},{label:'Bank Name',name:'bank_name'},{label:'Account No.',name:'bank_account_no'},{label:'IFSC Code',name:'bank_ifsc'}].map(f=>(
              <div key={f.name} className="space-y-1.5"><Label className="text-xs font-semibold">{f.label}</Label><Input name={f.name} value={form[f.name]} onChange={handleChange} className="h-9 rounded-xl text-sm" /></div>
            ))}
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Tag className="h-4 w-4" />Logo & Signature</h4>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Company Logo</Label><Input type="file" accept="image/*" onChange={e=>handleFileChange(e,'logo_base64')} className="h-9 rounded-xl text-sm" ref={logoInputRef} />{form.logo_base64&&<div className="flex items-center gap-2"><img src={form.logo_base64} alt="Logo" className="h-12 object-contain rounded border" /><Button variant="outline" size="sm" onClick={()=>{setForm(p=>({...p,logo_base64:null}));if(logoInputRef.current)logoInputRef.current.value='';}}>Remove</Button></div>}</div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Signature</Label><Input type="file" accept="image/*" onChange={e=>handleFileChange(e,'signature_base64')} className="h-9 rounded-xl text-sm" ref={sigInputRef} />{form.signature_base64&&<div className="flex items-center gap-2"><img src={form.signature_base64} alt="Signature" className="h-12 object-contain rounded border" /><Button variant="outline" size="sm" onClick={()=>{setForm(p=>({...p,signature_base64:null}));if(sigInputRef.current)sigInputRef.current.value='';}}>Remove</Button></div>}</div>
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-4"><Mail className="h-4 w-4" />SMTP Settings</h4>
            {[{label:'SMTP Host',name:'smtp_host',type:'text'},{label:'SMTP Port',name:'smtp_port',type:'number'},{label:'SMTP User',name:'smtp_user',type:'text'},{label:'SMTP Password',name:'smtp_password',type:'password'},{label:'From Name',name:'smtp_from_name',type:'text'}].map(f=>(
              <div key={f.name} className="space-y-1.5"><Label className="text-xs font-semibold">{f.label}</Label><Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} className="h-9 rounded-xl text-sm" /></div>
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

// ════════════════════════════════════════════════════════════════════════════════
// COMPANY LIST MODAL
// ════════════════════════════════════════════════════════════════════════════════
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
    if (!window.confirm(`Delete company "${name}"?`)) return;
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
            <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}><Building2 className="h-5 w-5" />Company Profiles<Badge className="ml-2 bg-blue-100 text-blue-700">{companies.length}</Badge></DialogTitle>
            <DialogDescription>Manage company profiles used in quotations and invoices.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button onClick={() => { setEditingCompany(null); setShowForm(true); }} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}><Plus className="h-4 w-4" />Add New Company</Button>
          </div>
          {loading ? <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>
            : companies.length === 0 ? <div className="text-center py-10 text-slate-400"><Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No companies added yet.</p></div>
            : <div className="max-h-[55vh] overflow-y-auto space-y-3 pr-1">
              {companies.map(company => (
                <div key={company.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden">{company.logo_base64 ? <img src={company.logo_base64} alt="logo" className="w-full h-full object-contain" /> : <Building2 className="h-5 w-5 text-slate-400" />}</div>
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
            </div>}
          <DialogFooter><Button variant="outline" onClick={onClose} className="rounded-xl">Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {showForm && <CompanyManager editingCompany={editingCompany} onClose={() => { setShowForm(false); setEditingCompany(null); }} onSaved={() => { fetchCompanies(); onRefresh(); }} />}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// QUOTATION MANAGER (create / edit wizard)
// ════════════════════════════════════════════════════════════════════════════════
function QuotationManager({ onClose, onSaved, editingQuotation }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ company_id:'', lead_id:'', client_id:'', client_name:'', client_address:'', client_email:'', client_phone:'', service:'', subject:'', scope_of_work:[''], items:[{ description:'', quantity:1, unit:'service', unit_price:0, amount:0 }], gst_rate:18.0, payment_terms:'', timeline:'', validity_days:30, advance_terms:'', extra_terms:[''], notes:'', extra_checklist_items:[''], status:'draft' });
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
        const [cRes, lRes, sRes, clRes] = await Promise.all([api.get('/companies'), api.get('/leads'), api.get('/quotations/services'), api.get('/clients')]);
        setCompanies(cRes.data); setLeads(lRes.data); setServices(sRes.data.services); setClients(clRes.data);
        if (editingQuotation) {
          setForm({ company_id:editingQuotation.company_id||'', lead_id:editingQuotation.lead_id||'', client_id:editingQuotation.client_id||'', client_name:editingQuotation.client_name||'', client_address:editingQuotation.client_address||'', client_email:editingQuotation.client_email||'', client_phone:editingQuotation.client_phone||'', service:editingQuotation.service||'', subject:editingQuotation.subject||'', scope_of_work:editingQuotation.scope_of_work?.length?editingQuotation.scope_of_work:[''], items:editingQuotation.items?.length?editingQuotation.items:[{description:'',quantity:1,unit:'service',unit_price:0,amount:0}], gst_rate:editingQuotation.gst_rate||18.0, payment_terms:editingQuotation.payment_terms||'', timeline:editingQuotation.timeline||'', validity_days:editingQuotation.validity_days||30, advance_terms:editingQuotation.advance_terms||'', extra_terms:editingQuotation.extra_terms?.length?editingQuotation.extra_terms:[''], notes:editingQuotation.notes||'', extra_checklist_items:editingQuotation.extra_checklist_items?.length?editingQuotation.extra_checklist_items:[''], status:editingQuotation.status||'draft' });
        } else if (cRes.data.length > 0) {
          setForm(prev => ({ ...prev, company_id: cRes.data[0].id }));
        }
      } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to load data'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [editingQuotation]);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleClientSelect = (clientId) => {
    if (!clientId || clientId === 'none') { setForm(prev => ({ ...prev, client_id: '' })); return; }
    const c = clients.find(c => c.id === clientId); if (!c) return;
    const addr = [c.address, c.city, c.state].filter(Boolean).join(', ');
    const contact = c.contact_persons?.[0];
    setForm(prev => ({ ...prev, client_id: clientId, client_name: c.company_name||'', client_email: c.email||contact?.email||'', client_phone: c.phone||contact?.phone||'', client_address: addr }));
  };
  const handleLeadSelect = (leadId) => {
    if (!leadId || leadId === 'none') { setForm(prev => ({ ...prev, lead_id: '' })); return; }
    setForm(prev => ({ ...prev, lead_id: leadId }));
    const l = leads.find(l => l.id === leadId);
    if (l && !form.client_name) setForm(prev => ({ ...prev, lead_id: leadId, client_name: l.company_name||l.name||prev.client_name, client_email: l.email||prev.client_email, client_phone: l.phone||prev.client_phone }));
  };
  const handleItemChange = (index, field, value) => {
    const items = [...form.items]; items[index][field] = value;
    if (field === 'quantity' || field === 'unit_price') items[index].amount = items[index].quantity * items[index].unit_price;
    setForm(prev => ({ ...prev, items }));
  };
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { description:'', quantity:1, unit:'service', unit_price:0, amount:0 }] }));
  const removeItem = (i) => setForm(prev => ({ ...prev, items: prev.items.filter((_,idx)=>idx!==i) }));
  const handleListChange = (list, i, val) => { const a=[...form[list]]; a[i]=val; setForm(prev=>({...prev,[list]:a})); };
  const addListItem = (list) => setForm(prev => ({ ...prev, [list]: [...prev[list], ''] }));
  const removeListItem = (list, i) => setForm(prev => ({ ...prev, [list]: prev[list].filter((_,idx)=>idx!==i) }));

  const handleSave = async () => {
    if (!form.company_id) { toast.error('Please select a company'); return; }
    if (!form.client_name.trim()) { toast.error('Client name is required'); return; }
    if (!form.service.trim()) { toast.error('Service is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, scope_of_work: form.scope_of_work.filter(s=>s.trim()), extra_terms: form.extra_terms.filter(t=>t.trim()), extra_checklist_items: form.extra_checklist_items.filter(c=>c.trim()), lead_id: form.lead_id||null, client_id: form.client_id||null };
      editingQuotation ? await api.put(`/quotations/${editingQuotation.id}`, payload) : await api.post('/quotations', payload);
      toast.success(editingQuotation ? 'Quotation updated' : 'Quotation created'); onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save quotation'); }
    finally { setSaving(false); }
  };

  const subtotal = form.items.reduce((sum,it)=>sum+(it.quantity*it.unit_price),0);
  const gstAmount = subtotal*(form.gst_rate/100);
  const total = subtotal+gstAmount;

  if (loading) return (
    <Dialog open={true} onOpenChange={v=>{ if(!v) onClose(); }}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="sr-only">Loading</DialogTitle><DialogDescription className="sr-only">Loading…</DialogDescription></DialogHeader>
        <div className="flex items-center justify-center py-16 gap-3"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /><span className="text-slate-500">Loading data…</span></div>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open={true} onOpenChange={v=>{ if(!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: COLORS.deepBlue }}><Receipt className="h-5 w-5" />{editingQuotation ? `Edit ${editingQuotation.quotation_no}` : 'Create New Quotation'}</DialogTitle>
          <DialogDescription>Step-by-step professional quotation builder.</DialogDescription>
        </DialogHeader>

        {/* Step tabs */}
        <div className="flex space-x-2 mb-2">
          {STEPS.map((s,i) => (
            <button key={s} onClick={() => setStep(i+1)} className={cn("flex-1 text-center py-2 px-1 rounded-xl text-xs font-medium transition-colors", step===(i+1)?'bg-blue-100 text-blue-700 font-semibold':'bg-slate-50 text-slate-500 hover:bg-slate-100')}>
              <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] mr-1", step===(i+1)?'bg-blue-600 text-white':'bg-slate-200 text-slate-600')}>{i+1}</span>{s}
            </button>
          ))}
        </div>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          {/* Step 1 */}
          {step===1 && <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Select Company *</Label><Select value={form.company_id} onValueChange={v=>setForm(p=>({...p,company_id:v}))}><SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select company" /></SelectTrigger><SelectContent>{companies.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>{companies.length===0&&<p className="text-xs text-amber-600">No companies found. Add a company first.</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Link to Lead (Optional)</Label><Select value={form.lead_id||'none'} onValueChange={handleLeadSelect}><SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a lead" /></SelectTrigger><SelectContent><SelectItem value="none">-- No Lead --</SelectItem>{leads.map(l=><SelectItem key={l.id} value={l.id}>{l.company_name||l.name||'Unnamed'}{(l.contact_name||l.email)?` — ${l.contact_name||l.email}`:''}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
              <Label className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-2"><Users className="h-3.5 w-3.5" />Select from Client List (auto-fills details)</Label>
              <Select value={form.client_id||'none'} onValueChange={handleClientSelect}><SelectTrigger className="h-9 rounded-xl text-sm bg-white"><SelectValue placeholder="Choose existing client…" /></SelectTrigger><SelectContent><SelectItem value="none">-- Enter manually below --</SelectItem>{clients.map(c=><SelectItem key={c.id} value={c.id}>{c.company_name}{c.phone?` — ${c.phone}`:''}{c.email?` — ${c.email}`:''}</SelectItem>)}</SelectContent></Select>
              {form.client_id && <p className="text-[10px] text-blue-600 mt-1">✓ Client details loaded — you can edit below.</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Client Name *</Label><Input name="client_name" value={form.client_name} onChange={handleChange} className="h-9 rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Client Email</Label><Input name="client_email" value={form.client_email} onChange={handleChange} type="email" className="h-9 rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Client Phone</Label><Input name="client_phone" value={form.client_phone} onChange={handleChange} className="h-9 rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Client Address</Label><Textarea name="client_address" value={form.client_address} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" /></div>
            </div>
          </div>}

          {/* Step 2 */}
          {step===2 && <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Service *</Label><Select value={form.service} onValueChange={v=>setForm(p=>({...p,service:v}))}><SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Select a service" /></SelectTrigger><SelectContent>{services.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs font-semibold">Subject</Label><Input name="subject" value={form.subject} onChange={handleChange} className="h-9 rounded-xl text-sm" placeholder="e.g., Quotation for GST Registration" /></div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Scope of Work</Label>
              {form.scope_of_work.map((s,i)=>(<div key={i} className="flex items-center gap-2"><Input value={s} onChange={e=>handleListChange('scope_of_work',i,e.target.value)} className="h-9 rounded-xl text-sm" placeholder="e.g., Filing of GSTR-1 monthly" />{form.scope_of_work.length>1&&<Button variant="ghost" size="icon" onClick={()=>removeListItem('scope_of_work',i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}</div>))}
              <Button variant="outline" size="sm" onClick={()=>addListItem('scope_of_work')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Scope Item</Button>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Quotation Items *</Label>
              <div className="grid grid-cols-12 gap-1 text-[10px] font-semibold text-slate-500 px-1"><div className="col-span-4">Description</div><div className="col-span-2">Qty</div><div className="col-span-2">Unit</div><div className="col-span-2 text-right">Unit Price</div><div className="col-span-2 text-right">Amount</div></div>
              {form.items.map((item,i)=>(<div key={i} className="grid grid-cols-12 gap-1 items-center"><Input value={item.description} onChange={e=>handleItemChange(i,'description',e.target.value)} className="col-span-4 h-8 rounded-lg text-sm" placeholder="Item description" /><Input value={item.quantity} onChange={e=>handleItemChange(i,'quantity',parseFloat(e.target.value)||0)} type="number" step="0.01" className="col-span-2 h-8 rounded-lg text-sm" /><Select value={item.unit} onValueChange={v=>handleItemChange(i,'unit',v)}><SelectTrigger className="col-span-2 h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent>{UNIT_OPTIONS.map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select><Input value={item.unit_price} onChange={e=>handleItemChange(i,'unit_price',parseFloat(e.target.value)||0)} type="number" step="0.01" className="col-span-2 h-8 rounded-lg text-sm text-right" /><div className="col-span-1 text-right text-sm text-slate-600 font-medium">{item.amount.toFixed(0)}</div>{form.items.length>1&&<Button variant="ghost" size="icon" className="col-span-1 h-8 w-8" onClick={()=>removeItem(i)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>}</div>))}
              <Button variant="outline" size="sm" onClick={addItem} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Item</Button>
            </div>
          </div>}

          {/* Step 3 */}
          {step===3 && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[{label:'GST Rate (%)',name:'gst_rate',type:'number'},{label:'Validity (Days)',name:'validity_days',type:'number'},{label:'Timeline',name:'timeline',type:'text',placeholder:'e.g., 7 working days'},{label:'Advance Terms',name:'advance_terms',type:'text',placeholder:'e.g., 50% advance required'}].map(f=>(<div key={f.name} className="space-y-1.5"><Label className="text-xs font-semibold">{f.label}</Label><Input name={f.name} value={form[f.name]} onChange={handleChange} type={f.type} placeholder={f.placeholder||''} className="h-9 rounded-xl text-sm" /></div>))}
            <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-semibold">Payment Terms</Label><Textarea name="payment_terms" value={form.payment_terms} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" /></div>
            <div className="md:col-span-2 space-y-2"><Label className="text-xs font-semibold">Extra Terms & Conditions</Label>{form.extra_terms.map((t,i)=>(<div key={i} className="flex items-center gap-2"><Input value={t} onChange={e=>handleListChange('extra_terms',i,e.target.value)} className="h-9 rounded-xl text-sm" placeholder="Additional term..." />{form.extra_terms.length>1&&<Button variant="ghost" size="icon" onClick={()=>removeListItem('extra_terms',i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}</div>))}<Button variant="outline" size="sm" onClick={()=>addListItem('extra_terms')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Term</Button></div>
            <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-semibold">Notes</Label><Textarea name="notes" value={form.notes} onChange={handleChange} rows={2} className="resize-none rounded-xl text-sm" /></div>
            <div className="md:col-span-2 space-y-2"><Label className="text-xs font-semibold">Extra Document Checklist Items</Label>{form.extra_checklist_items.map((item,i)=>(<div key={i} className="flex items-center gap-2"><Input value={item} onChange={e=>handleListChange('extra_checklist_items',i,e.target.value)} className="h-9 rounded-xl text-sm" placeholder="e.g., Latest Bank Statement" />{form.extra_checklist_items.length>1&&<Button variant="ghost" size="icon" onClick={()=>removeListItem('extra_checklist_items',i)}><Trash2 className="h-4 w-4 text-red-400" /></Button>}</div>))}<Button variant="outline" size="sm" onClick={()=>addListItem('extra_checklist_items')} className="rounded-xl gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Add Checklist Item</Button></div>
          </div>}

          {/* Step 4 Preview */}
          {step===4 && <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="font-bold text-slate-800">Quotation Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">Company:</span> <span className="font-medium">{companies.find(c=>c.id===form.company_id)?.name||'—'}</span></div>
                <div><span className="text-slate-500">Client:</span> <span className="font-medium">{form.client_name}</span></div>
                <div><span className="text-slate-500">Service:</span> <span className="font-medium">{form.service}</span></div>
                <div><span className="text-slate-500">GST:</span> <span className="font-medium">{form.gst_rate}%</span></div>
                {form.timeline&&<div><span className="text-slate-500">Timeline:</span> <span className="font-medium">{form.timeline}</span></div>}
                <div><span className="text-slate-500">Validity:</span> <span className="font-medium">{form.validity_days} days</span></div>
              </div>
            </div>
            <div className="space-y-2">
              {form.items.filter(it=>it.description).map((item,i)=>(<div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-100"><span className="text-slate-700">{item.description} <span className="text-slate-400 text-xs">({item.quantity} {item.unit})</span></span><span className="font-medium text-slate-800">₹{item.amount.toFixed(2)}</span></div>))}
            </div>
            <div className="p-3 rounded-xl bg-slate-800 text-white space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-300">Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-300">GST ({form.gst_rate}%)</span><span>₹{gstAmount.toFixed(2)}</span></div>
              <div className="flex justify-between text-base font-bold border-t border-slate-600 pt-1.5 mt-1"><span>Total Payable</span><span style={{ color: '#4ade80' }}>₹{total.toFixed(2)}</span></div>
            </div>
          </div>}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t">
          {step>1 && <Button variant="outline" onClick={()=>setStep(p=>p-1)} className="rounded-xl gap-1"><ChevronLeft className="h-4 w-4" />Previous</Button>}
          {step<STEPS.length && <Button onClick={()=>setStep(p=>p+1)} className="rounded-xl gap-1" style={{ background: COLORS.deepBlue }}>Next<ChevronRight className="h-4 w-4" /></Button>}
          {step===STEPS.length && <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2" style={{ background: COLORS.emeraldGreen }}>{saving?<><Loader2 className="h-4 w-4 animate-spin" />Saving…</>:<><Check className="h-4 w-4" />Save Quotation</>}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
export default function Quotations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDark = useDark();

  // ── State ──────────────────────────────────────────────────────────────────
  const [quotations, setQuotations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloading, setDownloading] = useState(null);
  const [convertingId, setConvertingId] = useState(null);

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

  // ── Debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchQuotations = async () => {
    setLoading(true);
    try {
      const res = await api.get('/quotations');
      setQuotations(res.data);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to fetch quotations'); }
    finally { setLoading(false); }
  };

  const fetchMeta = async () => {
    try {
      const [cRes, sRes] = await Promise.all([api.get('/companies'), api.get('/quotations/services')]);
      setCompanies(cRes.data); setServices(sRes.data.services);
    } catch {}
  };

  useEffect(() => { fetchMeta(); fetchQuotations(); }, []);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = quotations.length;
    const totalValue = quotations.reduce((s, q) => s + (q.total || 0), 0);
    const accepted = quotations.filter(q => q.status === 'accepted');
    const acceptedValue = accepted.reduce((s, q) => s + (q.total || 0), 0);
    const pending = quotations.filter(q => q.status === 'draft' || q.status === 'sent').length;
    const convRate = total > 0 ? Math.round((accepted.length / total) * 100) : 0;
    return { total, totalValue, acceptedValue, pending, convRate, acceptedCount: accepted.length };
  }, [quotations]);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return quotations.filter(q => {
      if (filterStatus !== 'all' && q.status !== filterStatus) return false;
      if (filterService !== 'all' && q.service !== filterService) return false;
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return q.quotation_no?.toLowerCase().includes(s) || q.client_name?.toLowerCase().includes(s) || q.service?.toLowerCase().includes(s) || q.client_email?.toLowerCase().includes(s);
    });
  }, [quotations, filterStatus, filterService, searchTerm]);

  // ── Board columns ──────────────────────────────────────────────────────────
  const boardColumns = useMemo(() => {
    const cols = [
      { id: 'draft',    label: 'Draft',    color: '#94A3B8', bgLight: '#F8FAFC', bgDark: 'rgba(148,163,184,0.08)' },
      { id: 'sent',     label: 'Sent',     color: COLORS.mediumBlue, bgLight: '#EFF6FF', bgDark: 'rgba(31,111,178,0.10)' },
      { id: 'accepted', label: 'Accepted', color: COLORS.emeraldGreen, bgLight: '#F0FDF4', bgDark: 'rgba(31,175,90,0.08)' },
      { id: 'rejected', label: 'Rejected', color: COLORS.coral, bgLight: '#FEF2F2', bgDark: 'rgba(239,68,68,0.08)' },
    ];
    return cols.map(col => ({
      ...col,
      items: filtered.filter(q => (q.status || 'draft') === col.id),
    }));
  }, [filtered]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getCompany = (id) => companies.find(c => c.id === id);

  const handleStatusChange = async (qtnId, newStatus) => {
    try {
      await api.put(`/quotations/${qtnId}`, { status: newStatus });
      toast.success('Status updated');
      setQuotations(prev => prev.map(q => q.id === qtnId ? { ...q, status: newStatus } : q));
    } catch { toast.error('Failed to update status'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quotation?')) return;
    try { await api.delete(`/quotations/${id}`); toast.success('Quotation deleted'); setQuotations(prev => prev.filter(q => q.id !== id)); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Failed to delete quotation'); }
  };

  const handleConvertToInvoice = async (qtnId) => {
    if (!window.confirm('Convert this quotation to a Tax Invoice?')) return;
    setConvertingId(qtnId);
    try { await api.post(`/invoices/from-quotation/${qtnId}`); toast.success('Converted to invoice! Redirecting…'); setTimeout(() => navigate('/invoicing'), 1200); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Conversion failed'); }
    finally { setConvertingId(null); }
  };

  const handlePreview = (q) => {
    const company = getCompany(q.company_id) || {};
    const html = generateQuotationHTML(q, { company });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  };

  const handlePrint = (q) => {
    const company = getCompany(q.company_id) || {};
    const html = generateQuotationHTML(q, { company });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); win.print();
  };

  const handleDownloadPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-pdf');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/pdf`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `quotation-${(qtnNo||qtnId).replace(/\//g,'-')}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      toast.success('Quotation PDF downloaded');
    } catch (err) { toast.error(await extractBlobError(err)); }
    finally { setDownloading(null); }
  };

  const handleDownloadChecklistPdf = async (qtnId, qtnNo) => {
    setDownloading(qtnId + '-checklist');
    try {
      const token = getToken();
      const baseURL = (api.defaults?.baseURL ?? '/api').toString().replace(/\/$/, '');
      const response = await axios.get(`${baseURL}/quotations/${qtnId}/checklist-pdf`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` } });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `checklist-${(qtnNo||qtnId).replace(/\//g,'-')}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
      toast.success('Checklist PDF downloaded');
    } catch (err) { toast.error(await extractBlobError(err)); }
    finally { setDownloading(null); }
  };

  // ── Quotation action buttons (reusable) ────────────────────────────────────
  const QuotationActions = ({ q, compact = false }) => (
    <div className="flex flex-wrap gap-1">
      <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-pdf'} className={cn("rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50", compact && "h-7 px-2")}>
        {downloading === q.id + '-pdf' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}{!compact && 'PDF'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => handlePreview(q)} className={cn("rounded-lg gap-1 text-xs text-purple-600 border-purple-200 hover:bg-purple-50", compact && "h-7 px-2")}>
        <Eye className="h-3 w-3" />{!compact && 'Preview'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => handlePrint(q)} className={cn("rounded-lg gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50", compact && "h-7 px-2")}>
        <Printer className="h-3 w-3" />{!compact && 'Print'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('quotation'); setIsEmailModalOpen(true); }} className={cn("rounded-lg gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50", compact && "h-7 px-2")}>
        <Mail className="h-3 w-3" />{!compact && 'Email'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('quotation'); setIsWhatsAppModalOpen(true); }} className={cn("rounded-lg gap-1 text-xs text-green-600 border-green-200 hover:bg-green-50", compact && "h-7 px-2")}>
        <MessageCircle className="h-3 w-3" />{!compact && 'WA'}
      </Button>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen p-5 md:p-7 space-y-5 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>

      {/* ── PAGE HEADER (matches Invoice) ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 sm:px-6 pt-4 sm:pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">Quotations</h1>
              <p className="text-sm text-blue-200 mt-0.5">Professional quotes · PDF & email · Convert to invoice · Track status</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsCompanyListOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <Building2 className="h-4 w-4" /> Companies {companies.length > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{companies.length}</span>}
            </Button>
            <Button variant="outline" onClick={() => fetchQuotations()} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }} className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0">
              <Plus className="h-4 w-4" /> New Quotation
            </Button>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ────────────────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Quotations" value={stats.total} sub={`${stats.pending} pending`} icon={FileText} color={COLORS.mediumBlue} bg={`${COLORS.mediumBlue}12`} isDark={isDark} onClick={() => setFilterStatus('all')} />
          <StatCard label="Total Value" value={fmtC(stats.totalValue)} sub="all quotations" icon={IndianRupee} color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} isDark={isDark} />
          <StatCard label="Accepted Value" value={fmtC(stats.acceptedValue)} sub={`${stats.acceptedCount} accepted`} icon={CheckCircle2} color="#059669" bg="#05966912" isDark={isDark} onClick={() => setFilterStatus('accepted')} />
          <StatCard label="Conversion Rate" value={`${stats.convRate}%`} sub={`${stats.acceptedCount} of ${stats.total}`} icon={TrendingUp} color={COLORS.amber} bg={`${COLORS.amber}12`} isDark={isDark} />
        </div>
      )}

      {/* ── COMPANY MISSING WARNING ───────────────────────────────────────── */}
      {companies.length === 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2 dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-300">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>No company profiles yet. <button onClick={() => setIsCompanyListOpen(true)} className="underline font-semibold">Add a company</button> before creating quotations.</span>
        </div>
      )}

      {/* ── FILTERS + VIEW TOGGLE ─────────────────────────────────────────── */}
      <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        {/* Search row */}
        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input placeholder="Search by quotation no., client, service…" className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {filtered.length} <span className="ml-1 font-normal text-slate-400">quotations</span>
          </div>
          {/* View mode toggle */}
          <div className={`flex items-center rounded-xl border overflow-hidden flex-shrink-0 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
            <button onClick={() => setViewMode('list')} className={`h-9 px-3 flex items-center gap-1.5 text-xs font-semibold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white' : (isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50')}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setViewMode('board')} className={`h-9 px-3 flex items-center gap-1.5 text-xs font-semibold transition-all ${viewMode === 'board' ? 'bg-blue-600 text-white' : (isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50')}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
          </div>
        </div>
        {/* Filter row */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className={`h-9 w-[140px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_META).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterService} onValueChange={setFilterService}>
            <SelectTrigger className={`h-9 w-[150px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterStatus !== 'all' || filterService !== 'all' || searchTerm) && (
            <button onClick={() => { setFilterStatus('all'); setFilterService('all'); setSearchInput(''); }} className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── LOADING ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className={`rounded-2xl border p-16 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-10 h-10 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}20, ${COLORS.mediumBlue}20)` }}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.mediumBlue }} />
          </div>
          <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading quotations…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-2xl border p-16 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}20, ${COLORS.mediumBlue}20)` }}>
            <Receipt className="h-8 w-8" style={{ color: COLORS.mediumBlue }} />
          </div>
          <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>No quotations found</h3>
          <p className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{searchTerm || filterStatus !== 'all' ? 'Try adjusting your filters' : 'Create your first quotation to get started'}</p>
          <Button onClick={() => { setEditingQuotation(null); setIsManagerOpen(true); }} className="h-10 px-6 rounded-xl text-white gap-2" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            <Plus className="h-4 w-4" /> New Quotation
          </Button>
        </div>

      ) : viewMode === 'list' ? (
        /* ─── LIST VIEW (table style matching Invoicing) ─────────────────── */
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{minWidth:620}}>
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-700/40' : 'border-slate-100 bg-slate-50/60'}`}>
                  {['Quotation', 'Client', 'Service', 'Date', 'Amount', 'Status', 'Actions'].map(h => (
                    <th key={h} className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((q, idx) => (
                    <motion.tr key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: idx * 0.02 }}
                      className={`border-b last:border-0 transition-colors ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-50 hover:bg-slate-50/80'}`}>
                      <td className="px-4 py-3.5">
                        <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{q.quotation_no}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Valid {q.validity_days}d</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: avatarGrad(q.client_name) }}>
                            {(q.client_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate max-w-[160px] ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{q.client_name || '—'}</p>
                            {q.client_phone && <p className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{q.client_phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className={`text-sm truncate max-w-[140px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{q.service}</p>
                        {getCompany(q.company_id) && <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Building2 className="h-2.5 w-2.5" />{getCompany(q.company_id)?.name}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{q.date}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{fmtC(q.total || 0)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Select value={q.status || 'draft'} onValueChange={(v) => handleStatusChange(q.id, v)}>
                          <SelectTrigger className="h-8 rounded-lg text-xs w-[110px] border-0 p-0 bg-transparent focus:ring-0 shadow-none"><StatusChip status={q.status || 'draft'} /></SelectTrigger>
                          <SelectContent>{Object.entries(STATUS_META).map(([k,v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          <QuotationActions q={q} compact />
                          <Button variant="outline" size="sm" onClick={() => handleDownloadChecklistPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-checklist'} className="h-7 px-2 rounded-lg gap-1 text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                            {downloading === q.id + '-checklist' ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck className="h-3 w-3" />}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleConvertToInvoice(q.id)} disabled={convertingId === q.id} className="h-7 px-2 rounded-lg gap-1 text-xs text-purple-600 border-purple-200 hover:bg-purple-50">
                            {convertingId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { setEditingQuotation(q); setIsManagerOpen(true); }} className="h-7 px-2 rounded-lg text-xs text-slate-600 border-slate-200 hover:bg-slate-50">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(q.id)} className="h-7 px-2 rounded-lg text-xs text-red-600 border-red-200 hover:bg-red-50">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

      ) : (
        /* ─── BOARD VIEW (Kanban) ─────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {boardColumns.map(col => (
            <div key={col.id} className={`rounded-2xl border flex flex-col min-h-[300px] ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: isDark ? '#334155' : '#f1f5f9', backgroundColor: isDark ? col.bgDark : col.bgLight }}>
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <span className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{col.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: isDark ? `${col.color}25` : `${col.color}18`, color: col.color }}>
                    {col.items.length}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: col.color }}>
                    {fmtC(col.items.reduce((s, q) => s + (q.total || 0), 0))}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: '70vh' }}>
                {col.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: isDark ? `${col.color}15` : `${col.color}10` }}>
                      <Receipt className="h-5 w-5 opacity-40" style={{ color: col.color }} />
                    </div>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No {col.label.toLowerCase()} quotations</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {col.items.map((q, idx) => (
                      <motion.div key={q.id}
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18, delay: idx * 0.04 }}
                        className={`rounded-xl border p-4 cursor-default transition-shadow hover:shadow-md ${isDark ? 'bg-slate-750 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}
                        style={{ borderLeft: `3px solid ${col.color}` }}>
                        {/* Card top */}
                        <div className="flex items-start justify-between mb-2.5 gap-2">
                          <div className="min-w-0">
                            <p className={`text-xs font-bold truncate ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{q.quotation_no}</p>
                            <p className={`text-sm font-semibold truncate mt-0.5 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{q.client_name}</p>
                          </div>
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: avatarGrad(q.client_name) }}>
                              {(q.client_name || '?').charAt(0).toUpperCase()}
                            </div>
                          </div>
                        </div>

                        {/* Service */}
                        <p className={`text-xs truncate mb-2.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{q.service}</p>

                        {/* Amount */}
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-base font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{fmtC(q.total || 0)}</span>
                          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{q.date} · {q.validity_days}d</span>
                        </div>

                        {/* Company */}
                        {getCompany(q.company_id) && (
                          <p className={`text-[10px] flex items-center gap-1 mb-2.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <Building2 className="h-2.5 w-2.5" />{getCompany(q.company_id)?.name}
                          </p>
                        )}

                        {/* Status change */}
                        <Select value={q.status || 'draft'} onValueChange={(v) => handleStatusChange(q.id, v)}>
                          <SelectTrigger className="h-7 rounded-lg text-[11px] mb-2.5 border-0 px-0 bg-transparent focus:ring-0 shadow-none w-full">
                            <StatusChip status={q.status || 'draft'} />
                          </SelectTrigger>
                          <SelectContent>{Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                        </Select>

                        {/* Action buttons — same as list, compact */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-pdf'} className="h-6 px-1.5 rounded-md gap-0.5 text-[10px] text-blue-600 border-blue-200 hover:bg-blue-50">
                            {downloading === q.id + '-pdf' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />} PDF
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handlePreview(q)} className="h-6 px-1.5 rounded-md gap-0.5 text-[10px] text-purple-600 border-purple-200 hover:bg-purple-50"><Eye className="h-2.5 w-2.5" /> View</Button>
                          <Button variant="outline" size="sm" onClick={() => { setEmailModalQuotation(q); setEmailModalPdfType('quotation'); setIsEmailModalOpen(true); }} className="h-6 px-1.5 rounded-md gap-0.5 text-[10px] text-blue-600 border-blue-200 hover:bg-blue-50"><Mail className="h-2.5 w-2.5" /> Email</Button>
                          <Button variant="outline" size="sm" onClick={() => { setWhatsAppModalQuotation(q); setWhatsAppModalPdfType('quotation'); setIsWhatsAppModalOpen(true); }} className="h-6 px-1.5 rounded-md gap-0.5 text-[10px] text-green-600 border-green-200 hover:bg-green-50"><MessageCircle className="h-2.5 w-2.5" /> WA</Button>
                        </div>

                        {/* Checklist + Edit + Delete + Convert */}
                        <div className="flex items-center gap-1 border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
                          <Button variant="outline" size="sm" onClick={() => handleDownloadChecklistPdf(q.id, q.quotation_no)} disabled={downloading === q.id + '-checklist'} className="h-6 px-1.5 rounded-md text-[10px] text-slate-600 border-slate-200 flex-1">
                            {downloading === q.id + '-checklist' ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FileCheck className="h-2.5 w-2.5" />} Checklist
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleConvertToInvoice(q.id)} disabled={convertingId === q.id} title="Convert to Invoice" className="h-6 px-1.5 rounded-md text-[10px] text-purple-600 border-purple-200">
                            {convertingId === q.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArrowRight className="h-2.5 w-2.5" />}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { setEditingQuotation(q); setIsManagerOpen(true); }} className="h-6 px-1.5 rounded-md text-[10px] text-slate-600 border-slate-200">
                            <Edit className="h-2.5 w-2.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(q.id)} className="h-6 px-1.5 rounded-md text-[10px] text-red-600 border-red-200">
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      {isManagerOpen && (
        <QuotationManager onClose={() => setIsManagerOpen(false)} onSaved={() => { fetchQuotations(); fetchMeta(); }} editingQuotation={editingQuotation} />
      )}
      <CompanyListModal open={isCompanyListOpen} onClose={() => setIsCompanyListOpen(false)} onRefresh={fetchMeta} />
      {isEmailModalOpen && <EmailModal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} quotation={emailModalQuotation} company={getCompany(emailModalQuotation?.company_id)} pdfType={emailModalPdfType} />}
      {isWhatsAppModalOpen && <WhatsAppModal open={isWhatsAppModalOpen} onClose={() => setIsWhatsAppModalOpen(false)} quotation={whatsAppModalQuotation} company={getCompany(whatsAppModalQuotation?.company_id)} pdfType={whatsAppModalPdfType} />}
    </div>
  );
}
