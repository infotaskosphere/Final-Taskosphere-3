import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format } from 'date-fns';
import {
  Plus, Trash2, Edit, Download, MessageCircle, Building2, FileText,
  ChevronDown, ChevronRight, Search, X, Check, Eye, Copy,
  IndianRupee, Calendar, User, Phone, Mail, Globe, CreditCard,
  ArrowLeft, Save, Send, Package, ClipboardList, Settings,
  RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
  Upload, Image, Pencil,
} from 'lucide-react';

// ── Brand palette (matches main app) ──────────────────────────────────────────
const C = {
  deepBlue:    '#0D3B66',
  medBlue:     '#1F6FB2',
  emerald:     '#1FAF5A',
  lightGreen:  '#5CCB5F',
  coral:       '#FF6B6B',
  amber:       '#F59E0B',
  lightBlue:   '#E0F2FE',
};

// ── All available services (mirrors backend) ────────────────────────────────
const ALL_SERVICES = [
  'GST Registration', 'GST Return Filing', 'GST Annual Return (GSTR-9)',
  'Income Tax Return (ITR) – Individual', 'Income Tax Return (ITR) – Business',
  'TDS Return Filing', 'Tax Audit (Form 3CA/3CB)',
  'Company Registration (Pvt. Ltd.)', 'LLP Registration', 'ROC Annual Compliance',
  'Trademark Registration', 'MSME / Udyam Registration',
  'Accounting & Bookkeeping', 'Payroll Processing',
  'FEMA / RBI Compliance', 'DSC (Digital Signature Certificate)',
  'Other / Custom Service',
];

const STATUS_MAP = {
  draft:    { label: 'Draft',    color: '#94A3B8', bg: '#F1F5F9' },
  sent:     { label: 'Sent',     color: C.medBlue, bg: '#EFF6FF' },
  accepted: { label: 'Accepted', color: C.emerald, bg: '#F0FDF4' },
  rejected: { label: 'Rejected', color: C.coral,   bg: '#FFF1F2' },
};

// ── Spring physics ─────────────────────────────────────────────────────────
const sp = { type: 'spring', stiffness: 360, damping: 26 };

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const uid  = () => Math.random().toString(36).slice(2, 9);

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SMALL SHARED UI
// ══════════════════════════════════════════════════════════════════════════════
const Badge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span className="inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
};

const Pill = ({ children, color = C.deepBlue }) => (
  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
    style={{ color, background: `${color}18` }}>
    {children}
  </span>
);

const Input = React.forwardRef(({ label, hint, className = '', ...props }, ref) => (
  <div className="space-y-1">
    {label && <label className="text-xs font-semibold text-slate-600">{label}</label>}
    <input ref={ref}
      className={`w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
        focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
        placeholder:text-slate-400 transition-all ${className}`}
      {...props} />
    {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
  </div>
));

const Textarea = ({ label, className = '', ...props }) => (
  <div className="space-y-1">
    {label && <label className="text-xs font-semibold text-slate-600">{label}</label>}
    <textarea
      className={`w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
        focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
        placeholder:text-slate-400 transition-all resize-none ${className}`}
      {...props} />
  </div>
);

const Select = ({ label, options, className = '', ...props }) => (
  <div className="space-y-1">
    {label && <label className="text-xs font-semibold text-slate-600">{label}</label>}
    <select
      className={`w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
        focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
        transition-all cursor-pointer ${className}`}
      {...props}>
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  </div>
);

const Btn = ({ children, variant = 'primary', size = 'md', loading, icon: Icon, className = '', ...props }) => {
  const base = `inline-flex items-center gap-2 font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer`;
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  const variants = {
    primary:  `text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5`,
    outline:  `border-2 bg-white hover:shadow-md`,
    ghost:    `hover:bg-slate-100`,
    danger:   `bg-red-500 hover:bg-red-600 text-white shadow`,
    success:  `text-white shadow-lg hover:-translate-y-0.5`,
    whatsapp: `text-white shadow-lg hover:-translate-y-0.5`,
  };
  const variantStyles = {
    primary:  { background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` },
    outline:  { borderColor: C.deepBlue, color: C.deepBlue },
    ghost:    {},
    danger:   {},
    success:  { background: `linear-gradient(135deg, ${C.emerald}, ${C.lightGreen})` },
    whatsapp: { background: 'linear-gradient(135deg, #25D366, #128C7E)' },
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={variantStyles[variant]} {...props}>
      {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </button>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// COMPANY MANAGER MODAL
// ══════════════════════════════════════════════════════════════════════════════
function CompanyModal({ company, onClose, onSave }) {
  const [form, setForm] = useState(company || {
    name: '', address: '', phone: '', email: '', website: '',
    gstin: '', pan: '', bank_account_name: '', bank_name: '',
    bank_account_no: '', bank_ifsc: '', logo_base64: null, signature_base64: null,
  });
  const [saving, setSaving] = useState(false);

  const handleImg = async (e, field) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error('Image must be < 2 MB'); return; }
    const b64 = await fileToBase64(f);
    setForm(p => ({ ...p, [field]: b64 }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Company name required'); return; }
    setSaving(true);
    try {
      const res = company?.id
        ? await api.put(`/companies/${company.id}`, form)
        : await api.post('/companies', form);
      toast.success(company?.id ? 'Company updated' : 'Company created');
      onSave(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.88, y: 40 }} animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 40 }} transition={sp}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white">
              {company?.id ? 'Edit Company Profile' : 'Add Company Profile'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Logo & Signature uploads */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { field: 'logo_base64', label: 'Company Logo' },
              { field: 'signature_base64', label: 'Authorized Signature' },
            ].map(({ field, label }) => (
              <div key={field} className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">{label}</label>
                <label className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                  {form[field]
                    ? <img src={form[field]} alt={label} className="max-h-20 object-contain rounded" />
                    : <>
                        <Upload className="h-6 w-6 text-slate-400 mb-1" />
                        <span className="text-xs text-slate-400">Upload {label}</span>
                      </>
                  }
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleImg(e, field)} />
                </label>
                {form[field] && (
                  <button onClick={() => f(field, null)} className="text-xs text-red-500 hover:underline">Remove</button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Company Name *" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Acme Consultants LLP" />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Address" value={form.address} onChange={e => f('address', e.target.value)} rows={2} placeholder="123, Business Park, Surat - 395001" />
            </div>
            <Input label="Phone" value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+91 99999 99999" />
            <Input label="Email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="info@company.com" type="email" />
            <Input label="Website" value={form.website} onChange={e => f('website', e.target.value)} placeholder="www.company.com" />
            <Input label="GSTIN" value={form.gstin} onChange={e => f('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" className="uppercase" />
            <Input label="PAN" value={form.pan} onChange={e => f('pan', e.target.value)} placeholder="AAAAA0000A" className="uppercase" />
          </div>

          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Bank Details
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Account Holder Name" value={form.bank_account_name} onChange={e => f('bank_account_name', e.target.value)} />
              <Input label="Bank Name" value={form.bank_name} onChange={e => f('bank_name', e.target.value)} />
              <Input label="Account Number" value={form.bank_account_no} onChange={e => f('bank_account_no', e.target.value)} />
              <Input label="IFSC Code" value={form.bank_ifsc} onChange={e => f('bank_ifsc', e.target.value)} className="uppercase" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3 bg-slate-50">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn loading={saving} icon={Save} onClick={save}>Save Company</Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// QUOTATION FORM (Create / Edit)
// ══════════════════════════════════════════════════════════════════════════════
function QuotationForm({ quotation, companies, onClose, onSave }) {
  const isEdit = !!quotation?.id;

  const [form, setForm] = useState(() => ({
    company_id:           quotation?.company_id    || (companies[0]?.id || ''),
    client_name:          quotation?.client_name   || '',
    client_address:       quotation?.client_address|| '',
    client_email:         quotation?.client_email  || '',
    client_phone:         quotation?.client_phone  || '',
    service:              quotation?.service        || ALL_SERVICES[0],
    subject:              quotation?.subject        || '',
    scope_of_work:        quotation?.scope_of_work  || [''],
    items:                quotation?.items?.length ? quotation.items : [{ id: uid(), description: '', amount: '' }],
    gst_rate:             quotation?.gst_rate       ?? 18,
    payment_terms:        quotation?.payment_terms  || '50% advance, 50% on delivery',
    timeline:             quotation?.timeline       || '',
    validity_days:        quotation?.validity_days  ?? 30,
    advance_terms:        quotation?.advance_terms  || '',
    extra_terms:          quotation?.extra_terms    || [''],
    notes:                quotation?.notes          || '',
    extra_checklist_items:quotation?.extra_checklist_items || [''],
    status:               quotation?.status         || 'draft',
  }));

  const [step,    setStep]    = useState(0);  // 0=client 1=service 2=items 3=terms 4=checklist
  const [saving,  setSaving]  = useState(false);
  const [nextNo,  setNextNo]  = useState('');

  useEffect(() => {
    if (!isEdit) api.get('/quotations/next-number').then(r => setNextNo(r.data.number)).catch(() => {});
  }, [isEdit]);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Dynamic items total
  const subtotal  = form.items.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const gstAmt    = Math.round(subtotal * form.gst_rate / 100 * 100) / 100;
  const total     = subtotal + gstAmt;

  const addScopeItem  = () => f('scope_of_work', [...form.scope_of_work, '']);
  const addTermItem   = () => f('extra_terms',    [...form.extra_terms, '']);
  const addCheckItem  = () => f('extra_checklist_items', [...form.extra_checklist_items, '']);
  const addLineItem   = () => f('items', [...form.items, { id: uid(), description: '', amount: '' }]);

  const removeItem = (arr, key, idx) => f(key, arr.filter((_, i) => i !== idx));
  const updateArr  = (arr, key, idx, val) => { const a = [...arr]; a[idx] = val; f(key, a); };

  const save = async () => {
    if (!form.company_id) { toast.error('Select a company'); return; }
    if (!form.client_name.trim()) { toast.error('Client name required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        scope_of_work:          form.scope_of_work.filter(Boolean),
        extra_terms:             form.extra_terms.filter(Boolean),
        extra_checklist_items:   form.extra_checklist_items.filter(Boolean),
        items:                   form.items.map(i => ({ description: i.description, amount: parseFloat(i.amount || 0) })),
      };
      const res = isEdit
        ? await api.put(`/quotations/${quotation.id}`, payload)
        : await api.post('/quotations', payload);
      toast.success(isEdit ? 'Quotation updated' : 'Quotation created');
      onSave(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const STEPS = ['Client', 'Service', 'Items', 'Terms', 'Checklist'];

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 md:p-4"
      style={{ background: 'rgba(7,15,30,0.80)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.88, y: 48 }} animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 48 }} transition={sp}
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '95vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
          <div>
            <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
              {isEdit ? `Editing ${quotation.quotation_no}` : `New Quotation · ${nextNo}`}
            </p>
            <h2 className="text-lg font-bold text-white mt-0.5">
              {isEdit ? 'Edit Quotation' : 'Create Quotation'}
            </h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Step bar */}
        <div className="flex px-6 py-3 gap-1 border-b bg-slate-50 overflow-x-auto flex-shrink-0">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                step === i ? 'text-white shadow' : 'text-slate-500 hover:bg-white'
              }`}
              style={step === i ? { background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` } : {}}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                step > i ? 'bg-emerald-500 text-white' : step === i ? 'bg-white text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {step > i ? '✓' : i + 1}
              </span>
              {s}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-5">

              {/* ── STEP 0: Client ── */}
              {step === 0 && (
                <>
                  <Select label="Company / Sender *"
                    options={companies.map(c => ({ value: c.id, label: c.name }))}
                    value={form.company_id}
                    onChange={e => f('company_id', e.target.value)} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Input label="Client / Company Name *" value={form.client_name}
                        onChange={e => f('client_name', e.target.value)} placeholder="Rajesh Enterprises" />
                    </div>
                    <div className="md:col-span-2">
                      <Textarea label="Client Address" value={form.client_address}
                        onChange={e => f('client_address', e.target.value)} rows={2}
                        placeholder="123 Main Street, Surat" />
                    </div>
                    <Input label="Client Email" type="email" value={form.client_email}
                      onChange={e => f('client_email', e.target.value)} placeholder="client@email.com" />
                    <Input label="Client Phone" value={form.client_phone}
                      onChange={e => f('client_phone', e.target.value)} placeholder="+91 99999 99999" />
                  </div>
                  <Select label="Status"
                    options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
                    value={form.status} onChange={e => f('status', e.target.value)} />
                </>
              )}

              {/* ── STEP 1: Service ── */}
              {step === 1 && (
                <>
                  <Select label="Service Type *" options={ALL_SERVICES}
                    value={form.service} onChange={e => f('service', e.target.value)} />
                  <Input label="Subject Line"
                    value={form.subject}
                    onChange={e => f('subject', e.target.value)}
                    placeholder={`Quotation for ${form.service}`} />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">Scope of Work</label>
                      <Btn size="sm" variant="ghost" icon={Plus} onClick={addScopeItem}>Add</Btn>
                    </div>
                    {form.scope_of_work.map((item, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input className="flex-1" value={item}
                          onChange={e => updateArr(form.scope_of_work, 'scope_of_work', idx, e.target.value)}
                          placeholder={`Scope item ${idx + 1}`} />
                        {form.scope_of_work.length > 1 && (
                          <button onClick={() => removeItem(form.scope_of_work, 'scope_of_work', idx)}
                            className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── STEP 2: Items & Pricing ── */}
              {step === 2 && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">Line Items</label>
                      <Btn size="sm" variant="ghost" icon={Plus} onClick={addLineItem}>Add Item</Btn>
                    </div>
                    {form.items.map((item, idx) => (
                      <div key={item.id || idx} className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Input value={item.description}
                            onChange={e => { const a = [...form.items]; a[idx] = { ...a[idx], description: e.target.value }; f('items', a); }}
                            placeholder="Description of service / item" />
                        </div>
                        <div className="w-36">
                          <Input value={item.amount}
                            onChange={e => { const a = [...form.items]; a[idx] = { ...a[idx], amount: e.target.value }; f('items', a); }}
                            type="number" placeholder="Amount (₹)" />
                        </div>
                        {form.items.length > 1 && (
                          <button onClick={() => f('items', form.items.filter((_, i) => i !== idx))}
                            className="p-2.5 mt-0 rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Totals preview */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 flex justify-between text-sm">
                      <span className="text-slate-600">Sub Total</span>
                      <span className="font-semibold">{fmt(subtotal)}</span>
                    </div>
                    <div className="px-4 py-2 flex items-center gap-3 border-t">
                      <span className="text-sm text-slate-600 flex-1">GST Rate %</span>
                      <input type="number" min="0" max="28" value={form.gst_rate}
                        onChange={e => f('gst_rate', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm border rounded-lg text-center" />
                      <span className="text-sm font-medium text-slate-600">{fmt(gstAmt)}</span>
                    </div>
                    <div className="px-4 py-3 border-t flex justify-between"
                      style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
                      <span className="text-white font-bold text-sm">Total Payable</span>
                      <span className="text-white font-bold text-base">{fmt(total)}</span>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 3: Terms ── */}
              {step === 3 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Payment Terms"
                      value={form.payment_terms} onChange={e => f('payment_terms', e.target.value)}
                      placeholder="50% advance, 50% on completion" />
                    <Input label="Timeline"
                      value={form.timeline} onChange={e => f('timeline', e.target.value)}
                      placeholder="e.g. 7-10 working days" />
                    <Input label="Validity (days)" type="number" min="1"
                      value={form.validity_days} onChange={e => f('validity_days', parseInt(e.target.value) || 30)} />
                    <Input label="Advance Terms"
                      value={form.advance_terms} onChange={e => f('advance_terms', e.target.value)}
                      placeholder="e.g. 50% advance required" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">Additional Terms</label>
                      <Btn size="sm" variant="ghost" icon={Plus} onClick={addTermItem}>Add</Btn>
                    </div>
                    {form.extra_terms.map((t, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input className="flex-1" value={t}
                          onChange={e => updateArr(form.extra_terms, 'extra_terms', idx, e.target.value)}
                          placeholder={`Additional term ${idx + 1}`} />
                        {form.extra_terms.length > 1 && (
                          <button onClick={() => removeItem(form.extra_terms, 'extra_terms', idx)}
                            className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Textarea label="Internal Notes (not shown in PDF)"
                    value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
                    placeholder="Any internal notes about this quotation..." />
                </>
              )}

              {/* ── STEP 4: Checklist ── */}
              {step === 4 && (
                <>
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <p className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      Standard Checklist for: <span className="font-extrabold">{form.service}</span>
                    </p>
                    <p className="text-xs text-emerald-700">
                      The standard document checklist for this service will be included automatically in the checklist PDF.
                      Add extra documents below if needed.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-600">Extra Documents (optional)</label>
                      <Btn size="sm" variant="ghost" icon={Plus} onClick={addCheckItem}>Add</Btn>
                    </div>
                    {form.extra_checklist_items.map((t, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input className="flex-1" value={t}
                          onChange={e => updateArr(form.extra_checklist_items, 'extra_checklist_items', idx, e.target.value)}
                          placeholder={`Extra document ${idx + 1}`} />
                        {form.extra_checklist_items.length > 1 && (
                          <button onClick={() => removeItem(form.extra_checklist_items, 'extra_checklist_items', idx)}
                            className="p-2.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div className="flex gap-2">
            {step > 0 && (
              <Btn variant="outline" onClick={() => setStep(s => s - 1)} icon={ArrowLeft}>Back</Btn>
            )}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Btn onClick={() => setStep(s => s + 1)} icon={ChevronRight}>Next</Btn>
            ) : (
              <Btn loading={saving} icon={Save} onClick={save}>
                {isEdit ? 'Save Changes' : 'Create Quotation'}
              </Btn>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// QUOTATION DETAIL MODAL (view + actions)
// ══════════════════════════════════════════════════════════════════════════════
function QuotationDetailModal({ q, company, onClose, onEdit, onDelete, onRefresh }) {
  const [dlLoading, setDlLoading] = useState(null);

  const download = async (type) => {
    setDlLoading(type);
    try {
      const url    = type === 'quotation'
        ? `/quotations/${q.id}/pdf`
        : `/quotations/${q.id}/checklist-pdf`;
      const res    = await api.get(url, { responseType: 'blob' });
      const blobURL = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = blobURL;
      a.download = `${type}_${q.quotation_no.replace('/', '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(blobURL);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Download failed');
    } finally { setDlLoading(null); }
  };

  // WhatsApp share — formats a professional message
  const shareWhatsApp = () => {
    const phone = q.client_phone?.replace(/\D/g, '') || '';
    const gstLine = q.gst_rate > 0 ? `\n🔹 GST (${q.gst_rate}%): ${fmt(q.gst_amount)}` : '';
    const msg = `*Quotation from ${company?.name || 'Us'}*

Dear ${q.client_name},

Thank you for your enquiry. Please find our quotation below:

*📋 Quotation No:* ${q.quotation_no}
*📅 Date:* ${q.date}
*🔧 Service:* ${q.service}

*💰 Pricing Summary*
${q.items?.map((i, idx) => `${idx + 1}. ${i.description}: ${fmt(i.amount)}`).join('\n')}
${gstLine}
*✅ Total Payable: ${fmt(q.total)}*

*📌 Terms*
• Payment: ${q.payment_terms || 'As agreed'}
• Validity: ${q.validity_days} days
${q.timeline ? `• Timeline: ${q.timeline}` : ''}

Kindly confirm your acceptance or contact us for any queries.

Regards,
${company?.name || ''}
${company?.phone || ''}`;

    const encoded = encodeURIComponent(msg);
    const url = phone
      ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const updateStatus = async (status) => {
    try {
      await api.put(`/quotations/${q.id}`, { status });
      toast.success(`Status updated to ${status}`);
      onRefresh();
    } catch { toast.error('Update failed'); }
  };

  return (
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,15,30,0.80)', backdropFilter: 'blur(10px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.88, y: 40 }} animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 40 }} transition={sp}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
          <div className="absolute right-0 top-0 w-40 h-40 rounded-full -mr-12 -mt-12 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">{q.service}</p>
              <h2 className="text-xl font-bold text-white mt-1">{q.quotation_no}</h2>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge status={q.status} />
                <span className="text-white/50 text-xs">{q.date}</span>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center">
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Client + Company */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">To</p>
              <p className="font-bold text-slate-800">{q.client_name}</p>
              {q.client_address && <p className="text-xs text-slate-500 mt-0.5">{q.client_address}</p>}
              {q.client_phone && <p className="text-xs text-slate-500">{q.client_phone}</p>}
              {q.client_email && <p className="text-xs text-slate-500">{q.client_email}</p>}
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">From</p>
              <p className="font-bold text-slate-800">{company?.name || '—'}</p>
              {company?.phone && <p className="text-xs text-slate-500">{company.phone}</p>}
              {company?.email && <p className="text-xs text-slate-500">{company.email}</p>}
            </div>
          </div>

          {/* Items */}
          {q.items?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-800 flex gap-2">
                <span className="text-white/70 text-xs flex-1 font-semibold">Description</span>
                <span className="text-white/70 text-xs w-32 text-right font-semibold">Amount</span>
              </div>
              {q.items.map((item, i) => (
                <div key={i} className={`px-4 py-3 flex items-center gap-2 border-b last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                  <span className="text-sm flex-1">{item.description}</span>
                  <span className="text-sm font-semibold w-32 text-right">{fmt(item.amount)}</span>
                </div>
              ))}
              <div className="px-4 py-2 bg-slate-50 flex justify-between border-t">
                <span className="text-xs text-slate-500">Subtotal</span>
                <span className="text-sm font-semibold">{fmt(q.subtotal)}</span>
              </div>
              {q.gst_rate > 0 && (
                <div className="px-4 py-2 bg-slate-50 flex justify-between border-t">
                  <span className="text-xs text-slate-500">GST ({q.gst_rate}%)</span>
                  <span className="text-sm font-semibold">{fmt(q.gst_amount)}</span>
                </div>
              )}
              <div className="px-4 py-3 flex justify-between"
                style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
                <span className="text-white font-bold">Total Payable</span>
                <span className="text-white font-bold text-lg">{fmt(q.total)}</span>
              </div>
            </div>
          )}

          {/* Terms */}
          {(q.payment_terms || q.timeline || q.validity_days) && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-1.5">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Terms</p>
              {q.payment_terms && <p className="text-xs text-amber-700">• Payment: {q.payment_terms}</p>}
              {q.timeline && <p className="text-xs text-amber-700">• Timeline: {q.timeline}</p>}
              <p className="text-xs text-amber-700">• Validity: {q.validity_days} days</p>
            </div>
          )}

          {/* Status change */}
          <div className="flex flex-wrap gap-2">
            <p className="text-xs font-semibold text-slate-600 w-full">Change Status:</p>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <button key={k} onClick={() => updateStatus(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                  q.status === k ? 'scale-105 shadow-md' : 'opacity-60 hover:opacity-100'
                }`}
                style={{ borderColor: v.color, color: v.color, background: q.status === k ? `${v.color}18` : 'white' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t bg-slate-50 flex flex-wrap items-center gap-2">
          <Btn size="sm" variant="outline" icon={Edit} onClick={() => { onClose(); onEdit(q); }}>Edit</Btn>
          <Btn size="sm" loading={dlLoading === 'quotation'} icon={Download}
            onClick={() => download('quotation')}>Quotation PDF</Btn>
          <Btn size="sm" variant="success" loading={dlLoading === 'checklist'} icon={ClipboardList}
            onClick={() => download('checklist')}>Checklist PDF</Btn>
          <Btn size="sm" variant="whatsapp" icon={MessageCircle} onClick={shareWhatsApp}>WhatsApp</Btn>
          <Btn size="sm" variant="danger" icon={Trash2}
            onClick={() => { if (window.confirm('Delete this quotation?')) { onDelete(q.id); onClose(); } }}>
            Delete
          </Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPANIES LIST VIEW
// ══════════════════════════════════════════════════════════════════════════════
function CompaniesView({ companies, onAdd, onEdit, onDelete }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: C.deepBlue }}>My Companies</h2>
          <p className="text-sm text-slate-500">Manage sender company profiles for quotations</p>
        </div>
        <Btn icon={Plus} onClick={onAdd}>Add Company</Btn>
      </div>

      {companies.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl">
          <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No companies yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add a company profile to create quotations</p>
          <Btn icon={Plus} onClick={onAdd}>Add First Company</Btn>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map(c => (
            <motion.div key={c.id} whileHover={{ y: -3 }} transition={sp}
              className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg p-5 transition-all">
              <div className="flex items-start gap-3 mb-3">
                {c.logo_base64
                  ? <img src={c.logo_base64} alt={c.name} className="w-12 h-12 object-contain rounded-xl border" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg"
                      style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
                      {c.name?.charAt(0)}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 truncate">{c.name}</h3>
                  {c.gstin && <p className="text-[10px] text-slate-400 font-mono">{c.gstin}</p>}
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-500 mb-4">
                {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</p>}
                {c.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3" />{c.email}</p>}
                {c.bank_name && <p className="flex items-center gap-1.5"><CreditCard className="h-3 w-3" />{c.bank_name} · {c.bank_account_no?.slice(-4)?.padStart(8, '*')}</p>}
              </div>
              <div className="flex gap-2 border-t pt-3">
                <button onClick={() => onEdit(c)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl transition">
                  <Edit className="h-3.5 w-3.5" />Edit
                </button>
                <button onClick={() => { if (window.confirm('Delete company?')) onDelete(c.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-xl transition">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN QUOTATIONS PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Quotations() {
  const { user } = useAuth();

  // Permission check
  const canAccess = useMemo(() => {
    if (user?.role === 'admin') return true;
    const p = user?.permissions || {};
    return !!(p.can_create_quotations);
  }, [user]);

  const [view,         setView]         = useState('quotations'); // 'quotations' | 'companies'
  const [quotations,   setQuotations]   = useState([]);
  const [companies,    setCompanies]    = useState([]);
  const [loading,      setLoading]      = useState(true);

  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSvc,    setFilterSvc]    = useState('all');

  const [showForm,      setShowForm]     = useState(false);
  const [editQtn,       setEditQtn]      = useState(null);
  const [viewQtn,       setViewQtn]      = useState(null);
  const [showCompanyFm, setShowCompanyFm]= useState(false);
  const [editCompany,   setEditCompany]  = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        api.get('/quotations'),
        api.get('/companies'),
      ]);
      setQuotations(Array.isArray(qRes.data) ? qRes.data : []);
      setCompanies(Array.isArray(cRes.data) ? cRes.data : []);
    } catch (e) {
      toast.error('Failed to load data');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (canAccess) fetchAll(); }, [canAccess]);

  const deleteQtn = async (id) => {
    try {
      await api.delete(`/quotations/${id}`);
      toast.success('Quotation deleted');
      fetchAll();
    } catch { toast.error('Delete failed'); }
  };

  const deleteCompany = async (id) => {
    try {
      await api.delete(`/companies/${id}`);
      toast.success('Company deleted');
      fetchAll();
    } catch { toast.error('Delete failed'); }
  };

  const companyMap = useMemo(() => Object.fromEntries(companies.map(c => [c.id, c])), [companies]);

  const filtered = useMemo(() => quotations.filter(q => {
    const q_ = search.toLowerCase();
    const matchSearch = !search
      || q.client_name?.toLowerCase().includes(q_)
      || q.quotation_no?.toLowerCase().includes(q_)
      || q.service?.toLowerCase().includes(q_);
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    const matchSvc    = filterSvc === 'all' || q.service === filterSvc;
    return matchSearch && matchStatus && matchSvc;
  }), [quotations, search, filterStatus, filterSvc]);

  // Stats
  const stats = useMemo(() => ({
    total:    quotations.length,
    draft:    quotations.filter(q => q.status === 'draft').length,
    sent:     quotations.filter(q => q.status === 'sent').length,
    accepted: quotations.filter(q => q.status === 'accepted').length,
    value:    quotations.filter(q => q.status === 'accepted').reduce((s, q) => s + (q.total || 0), 0),
  }), [quotations]);

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center p-8 rounded-3xl border-2 border-red-100 bg-red-50 max-w-sm">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-700">Access Restricted</h2>
          <p className="text-sm text-slate-500 mt-1">You need <b>Create Quotations</b> permission.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Modals ── */}
      <AnimatePresence>
        {(showForm || editQtn) && (
          <QuotationForm
            quotation={editQtn}
            companies={companies}
            onClose={() => { setShowForm(false); setEditQtn(null); }}
            onSave={() => { setShowForm(false); setEditQtn(null); fetchAll(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewQtn && (
          <QuotationDetailModal
            q={viewQtn}
            company={companyMap[viewQtn.company_id]}
            onClose={() => setViewQtn(null)}
            onEdit={(q) => { setViewQtn(null); setEditQtn(q); }}
            onDelete={deleteQtn}
            onRefresh={fetchAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(showCompanyFm || editCompany) && (
          <CompanyModal
            company={editCompany}
            onClose={() => { setShowCompanyFm(false); setEditCompany(null); }}
            onSave={() => { setShowCompanyFm(false); setEditCompany(null); fetchAll(); }}
          />
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: C.deepBlue }}>Quotations</h1>
          <p className="text-slate-500 text-sm">Create, manage and share professional quotations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
            {[
              { key: 'quotations', icon: FileText,   label: 'Quotations' },
              { key: 'companies',  icon: Building2,  label: 'Companies' },
            ].map(t => (
              <button key={t.key} onClick={() => setView(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-all ${
                  view === t.key ? 'text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
                style={view === t.key ? { background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` } : {}}>
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
                {t.key === 'companies' && (
                  <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full font-bold">
                    {companies.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {view === 'quotations'
            ? <Btn icon={Plus} onClick={() => { if (!companies.length) { toast.error('Add a company first'); setView('companies'); return; } setShowForm(true); }}>New Quotation</Btn>
            : <Btn icon={Plus} onClick={() => setShowCompanyFm(true)}>Add Company</Btn>
          }
        </div>
      </div>

      {/* ── Companies View ── */}
      {view === 'companies' && (
        <CompaniesView
          companies={companies}
          onAdd={() => setShowCompanyFm(true)}
          onEdit={(c) => setEditCompany(c)}
          onDelete={deleteCompany}
        />
      )}

      {/* ── Quotations View ── */}
      {view === 'quotations' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: stats.total, color: C.deepBlue, icon: FileText },
              { label: 'Draft',  value: stats.draft,    color: '#94A3B8', icon: Clock },
              { label: 'Sent',   value: stats.sent,     color: C.medBlue, icon: Send },
              { label: 'Accepted', value: stats.accepted, color: C.emerald, icon: CheckCircle2 },
            ].map(s => (
              <motion.div key={s.label} whileHover={{ y: -2 }} transition={sp}
                className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all"
                onClick={() => setFilterStatus(s.label.toLowerCase() === 'total' ? 'all' : s.label.toLowerCase())}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                    <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
                  </div>
                  <div className="p-2.5 rounded-xl" style={{ background: `${s.color}15` }}>
                    <s.icon className="h-5 w-5" style={{ color: s.color }} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Accepted value banner */}
          {stats.accepted > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${C.emerald}, ${C.lightGreen})` }}>
              <IndianRupee className="h-6 w-6" />
              <div>
                <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Total Accepted Value</p>
                <p className="text-2xl font-black">{fmt(stats.value)}</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by client, quotation no. or service…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none cursor-pointer">
              <option value="all">All Status</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterSvc} onChange={e => setFilterSvc(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none cursor-pointer">
              <option value="all">All Services</option>
              {ALL_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No quotations found</p>
              {quotations.length === 0 && (
                <>
                  <p className="text-xs text-slate-400 mt-1 mb-4">Create your first quotation</p>
                  <Btn icon={Plus} onClick={() => { if (!companies.length) { toast.error('Add a company first'); setView('companies'); } else setShowForm(true); }}>
                    Create Quotation
                  </Btn>
                </>
              )}
            </div>
          ) : (
            <motion.div className="space-y-3" initial="hidden" animate="visible"
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } }}>
              {filtered.map(q => {
                const co = companyMap[q.company_id];
                return (
                  <motion.div key={q.id}
                    variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
                    whileHover={{ y: -2, transition: sp }}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-lg p-4 sm:p-5 cursor-pointer transition-all group"
                    onClick={() => setViewQtn(q)}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Logo / Icon */}
                      <div className="flex-shrink-0">
                        {co?.logo_base64
                          ? <img src={co.logo_base64} alt={co.name} className="w-10 h-10 rounded-xl border object-contain" />
                          : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})` }}>
                              {q.client_name?.charAt(0)?.toUpperCase()}
                            </div>
                        }
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-slate-800">{q.client_name}</span>
                          <Badge status={q.status} />
                          <Pill color={C.medBlue}>{q.service}</Pill>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                          <span className="font-mono font-semibold text-slate-500">{q.quotation_no}</span>
                          <span>{q.date}</span>
                          {co && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{co.name}</span>}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-black" style={{ color: C.deepBlue }}>{fmt(q.total)}</p>
                        <p className="text-[10px] text-slate-400">incl. GST</p>
                      </div>

                      {/* Action buttons (visible on hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setEditQtn(q); }}
                          className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); if (window.confirm('Delete?')) deleteQtn(q.id); }}
                          className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
