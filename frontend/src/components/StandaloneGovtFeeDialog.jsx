import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  IndianRupee, Save as SaveIcon, Loader2, UserPlus, X, ChevronDown,
  Upload, FileText, FileSpreadsheet, CheckCircle2, ArrowLeft,
  Plus, Trash2, Copy, Receipt, Wallet,
} from 'lucide-react';

/**
 * StandaloneGovtFeeDialog
 * ------------------------------------------------------------------
 * Create / edit an ad-hoc Government Fee that is NOT attached to a
 * compliance master assignment. Used from:
 *   - Client detail → Govt Fees tab  (lockClient = true, clientId fixed)
 *   - Compliance page → Govt Fees tab (client picker shown)
 *
 * Props
 *   open, onOpenChange
 *   editing       optional existing record
 *   clientId      pre-selected client (locked when lockClient=true)
 *   lockClient    boolean — hide client picker
 *   clients       array of {id, name} — required when !lockClient
 *   onSaved       (record) => void
 */
const CATEGORIES = ['ROC', 'GST', 'ITR', 'TDS', 'AUDIT', 'PF_ESIC', 'PT', 'OTHER'];
const STATUSES   = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid',    label: 'Paid'    },
];
const CLIENT_TYPES = [
  { value: 'proprietor',  label: 'Proprietor' },
  { value: 'pvt_ltd',     label: 'Private Limited' },
  { value: 'llp',         label: 'LLP' },
  { value: 'public_ltd',  label: 'Public Limited' },
  { value: 'section_8',   label: 'Section 8 Company' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'huf',         label: 'HUF' },
  { value: 'trust',       label: 'Trust' },
  { value: 'other',       label: 'Other' },
];
const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep',
  'Puducherry',
];

// ─────────────────────────────────────────────────────────────────────────────
// Mini Add-Client panel (inline, not a separate dialog)
// ─────────────────────────────────────────────────────────────────────────────
function AddClientPanel({ onClientCreated, onCancel }) {
  const [form, setForm] = useState({
    company_name: '', client_type: 'proprietor', client_type_other: '',
    email: '', phone: '', pan: '', gstin: '', cin: '', llpin: '',
    address: '', city: '', state: '', notes: '',
  });
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMode, setUploadMode] = useState(null); // 'pdf' | 'excel' | null
  const pdfRef   = useRef(null);
  const excelRef = useRef(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Parse PDF (AI-assisted) ──────────────────────────────────────────────
  const handlePdf = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMode('pdf');
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/clients/parse-pdf', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data || {};
      setForm(p => ({
        ...p,
        company_name: d.company_name || p.company_name,
        client_type:  d.client_type  || p.client_type,
        email:        d.email        || p.email,
        phone:        d.phone        || p.phone,
        pan:          d.pan          || p.pan,
        gstin:        d.gstin        || p.gstin,
        cin:          d.cin          || p.cin,
        llpin:        d.llpin        || p.llpin,
        address:      d.address      || p.address,
        city:         d.city         || p.city,
        state:        d.state        || p.state,
      }));
      toast.success('PDF parsed — please review and confirm the details');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'PDF parsing failed');
    } finally {
      setUploading(false);
      setUploadMode(null);
    }
  };

  // ── Parse Excel row ──────────────────────────────────────────────────────
  const handleExcel = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadMode('excel');
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/clients/parse-excel-row', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data || {};
      setForm(p => ({
        ...p,
        company_name: d.company_name || p.company_name,
        client_type:  d.client_type  || p.client_type,
        email:        d.email        || p.email,
        phone:        d.phone        || p.phone,
        pan:          d.pan          || p.pan,
        gstin:        d.gstin        || p.gstin,
        cin:          d.cin          || p.cin,
        address:      d.address      || p.address,
        city:         d.city         || p.city,
        state:        d.state        || p.state,
      }));
      toast.success('Excel data imported — please review the details');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Excel import failed');
    } finally {
      setUploading(false);
      setUploadMode(null);
    }
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error('Company / client name is required'); return; }
    setSaving(true);
    try {
      const cleanPhone = form.phone ? form.phone.replace(/\D/g, '') : '';
      const payload = {
        company_name:      form.company_name.trim(),
        client_type:       form.client_type,
        ...(form.client_type === 'other' ? { client_type_label: form.client_type_other?.trim() || 'Other' } : { client_type_label: null }),
        email:             form.email?.trim() || null,
        phone:             cleanPhone || null,
        pan:               form.pan?.trim().toUpperCase() || null,
        gstin:             form.gstin?.trim().toUpperCase() || null,
        cin:               form.cin?.trim().toUpperCase() || null,
        llpin:             form.llpin?.trim().toUpperCase() || null,
        address:           form.address?.trim() || null,
        city:              form.city?.trim() || null,
        state:             form.state?.trim() || null,
        notes:             form.notes?.trim() || null,
        status:            'active',
        contact_persons:   [],
        services:          [],
        dsc_details:       [],
        assignments:       [],
      };
      const res = await api.post('/clients', payload);
      const created = res.data;
      toast.success(`Client "${created.company_name}" created successfully`);
      onClientCreated({ id: created.id, name: created.company_name });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const lbl = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
  const inp = 'h-9 rounded-lg text-sm border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 w-full';

  return (
    <div className="border border-blue-100 rounded-2xl bg-blue-50/40 p-4 mt-2">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <UserPlus className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Add New Client</p>
            <p className="text-[10px] text-slate-400">Client will be saved and auto-selected</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Import from PDF / Excel */}
      <div className="flex gap-2 mb-4">
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { handlePdf(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={excelRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { handleExcel(e.target.files?.[0]); e.target.value = ''; }} />

        <button
          onClick={() => pdfRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-60"
        >
          {uploading && uploadMode === 'pdf'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <FileText className="h-3.5 w-3.5" />}
          Import from PDF
        </button>

        <button
          onClick={() => excelRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
        >
          {uploading && uploadMode === 'excel'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <FileSpreadsheet className="h-3.5 w-3.5" />}
          Import from Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        {/* Company Name — full width */}
        <div className="col-span-2">
          <label className={lbl}>Company / Client Name *</label>
          <Input className={inp} value={form.company_name}
            onChange={e => set('company_name', e.target.value)}
            placeholder="e.g. Acme Pvt Ltd" />
        </div>

        {/* Entity Type */}
        <div>
          <label className={lbl}>Entity Type</label>
          <Select value={form.client_type} onValueChange={v => set('client_type', v)}>
            <SelectTrigger className="h-9 rounded-lg text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Other label (only when type = other) */}
        {form.client_type === 'other'
          ? <div>
              <label className={lbl}>Custom Type Label</label>
              <Input className={inp} value={form.client_type_other}
                onChange={e => set('client_type_other', e.target.value)}
                placeholder="e.g. Co-operative" />
            </div>
          : <div>
              <label className={lbl}>PAN</label>
              <Input className={`${inp} font-mono uppercase`} value={form.pan}
                onChange={e => set('pan', e.target.value.toUpperCase())}
                placeholder="ABCDE1234F" maxLength={10} />
            </div>
        }

        {/* Email */}
        <div>
          <label className={lbl}>Email</label>
          <Input className={inp} type="email" value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="email@example.com" />
        </div>

        {/* Phone */}
        <div>
          <label className={lbl}>Phone / Mobile</label>
          <Input className={inp} type="tel" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="9876543210" maxLength={15} />
        </div>

        {/* GSTIN */}
        <div>
          <label className={lbl}>GSTIN</label>
          <Input className={`${inp} font-mono uppercase`} value={form.gstin}
            onChange={e => set('gstin', e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5" maxLength={15} />
        </div>

        {/* CIN / LLPIN */}
        <div>
          <label className={lbl}>{['pvt_ltd','public_ltd','section_8'].includes(form.client_type) ? 'CIN' : 'LLPIN / Reg. No.'}</label>
          <Input className={`${inp} font-mono uppercase`}
            value={form.client_type === 'llp' ? form.llpin : form.cin}
            onChange={e => form.client_type === 'llp'
              ? set('llpin', e.target.value.toUpperCase())
              : set('cin', e.target.value.toUpperCase())}
            placeholder={form.client_type === 'llp' ? 'AAA-1234' : 'U12345MH2020PTC123456'} />
        </div>

        {/* Address — full width */}
        <div className="col-span-2">
          <label className={lbl}>Address</label>
          <Input className={inp} value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="Street / locality" />
        </div>

        {/* City */}
        <div>
          <label className={lbl}>City</label>
          <Input className={inp} value={form.city}
            onChange={e => set('city', e.target.value)} placeholder="Surat" />
        </div>

        {/* State */}
        <div>
          <label className={lbl}>State</label>
          <Select value={form.state} onValueChange={v => set('state', v)}>
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue placeholder="Select state…" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Notes — full width */}
        <div className="col-span-2">
          <label className={lbl}>Notes</label>
          <Textarea className="rounded-lg text-sm border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none w-full"
            rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional notes…" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="flex-1">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || uploading}
          className="flex-1 text-white"
          style={{ background: 'linear-gradient(135deg,#0D3B66,#1F6FB2)' }}>
          {saving
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
            : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Create & Select Client</>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom client-select dropdown with "➕ New Client" option
// ─────────────────────────────────────────────────────────────────────────────
function ClientSelect({ value, onChange, clients, onNewClient }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = clients.find(c => c.id === value);
  const filtered = search
    ? clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative mt-1">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-9 flex items-center justify-between px-3 text-sm rounded-lg border border-slate-200 bg-white hover:border-blue-300 transition-colors focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? selected.name : 'Select client…'}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <Input
              autoFocus
              className="h-8 text-sm"
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* New Client option */}
          <button
            type="button"
            onClick={() => { setOpen(false); setSearch(''); onNewClient(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors border-b border-slate-100"
          >
            <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-3 w-3 text-white" />
            </div>
            ➕ Add New Client
          </button>

          {/* Client list */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="text-xs text-slate-400 text-center py-4">No clients found</p>
              : filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-slate-50 ${value === c.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'}`}
                >
                  <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ background: `hsl(${(c.name.charCodeAt(0) * 47) % 360}, 55%, 50%)` }}>
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A single "payment / form" row used in the multi-add flow. Everything except
// the client is scoped to the row so several government-fee forms/payments
// for the SAME client can be captured — and totalled — in one popup.
// ─────────────────────────────────────────────────────────────────────────────
let _rowSeq = 0;
const makeEmptyRow = () => ({
  _key:              `row-${Date.now()}-${_rowSeq++}`,
  title:             '',
  category:          'OTHER',
  period_label:      '',
  fy_year:           '',
  due_date:          '',
  payment_date:      '',
  amount:            '',
  srn:               '',
  notes:             '',
  status:            'pending',
  reimbursed:        false,
  reimbursed_amount: '',
});

// ─────────────────────────────────────────────────────────────────────────────
// One card per payment/form inside the multi-add flow. Compact but keeps every
// field the single-row editor has (minus client — that's shared at the top).
// ─────────────────────────────────────────────────────────────────────────────
function GovtFeeRowCard({ row, idx, canRemove, onChange, onRemove, onDuplicate }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3.5">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {idx + 1}
          </span>
          <span className="text-xs font-semibold text-slate-600">Payment {idx + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Duplicate this payment"
            onClick={onDuplicate}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {canRemove && (
            <button
              type="button"
              title="Remove this payment"
              onClick={onRemove}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-x-3 gap-y-2.5">
        {/* Title — full width */}
        <div className="col-span-4">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Title / Purpose *</label>
          <Input
            className="mt-1 h-9 bg-white"
            value={row.title}
            onChange={e => onChange('title', e.target.value)}
            placeholder="e.g. Increase in Authorised Capital — SH-7"
          />
        </div>

        {/* Category | FY Year | Period Label | Status */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Category</label>
          <Select value={row.category} onValueChange={v => onChange('category', v)}>
            <SelectTrigger className="mt-1 h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">FY Year</label>
          <Input
            className="mt-1 h-9 bg-white"
            value={row.fy_year}
            onChange={e => onChange('fy_year', e.target.value)}
            placeholder="2024-25"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Period Label</label>
          <Input
            className="mt-1 h-9 bg-white"
            value={row.period_label}
            onChange={e => onChange('period_label', e.target.value)}
            placeholder="Q1, May, One-time"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</label>
          <Select value={row.status} onValueChange={v => onChange('status', v)}>
            <SelectTrigger className="mt-1 h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Due Date | Payment Date | Amount | SRN */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Due Date</label>
          <Input className="mt-1 h-9 bg-white" type="date" value={row.due_date} onChange={e => onChange('due_date', e.target.value)} />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Payment Date</label>
          <Input className="mt-1 h-9 bg-white" type="date" value={row.payment_date} onChange={e => onChange('payment_date', e.target.value)} />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Amount (₹) *</label>
          <Input
            className="mt-1 h-9 bg-white"
            type="number" min="0" step="0.01"
            value={row.amount}
            onChange={e => onChange('amount', e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">SRN</label>
          <Input
            className="mt-1 h-9 bg-white font-mono"
            value={row.srn}
            onChange={e => onChange('srn', e.target.value)}
            placeholder="SRN…"
          />
        </div>

        {/* Reimbursed — full width */}
        <div className="col-span-4">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Reimbursed by Client</label>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white">
              {[{ v: true, l: 'Yes — Received' }, { v: false, l: 'No' }].map(opt => (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => onChange('reimbursed', opt.v)}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: row.reimbursed === opt.v ? (opt.v ? '#10b981' : '#94a3b8') : 'transparent',
                    color: row.reimbursed === opt.v ? '#fff' : '#64748b',
                  }}>
                  {opt.l}
                </button>
              ))}
            </div>
            {row.reimbursed && (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-slate-500">Amount (₹)</span>
                <Input
                  className="h-9 flex-1 bg-white"
                  type="number" min="0" step="0.01"
                  value={row.reimbursed_amount !== '' ? row.reimbursed_amount : (row.amount || '')}
                  onChange={e => onChange('reimbursed_amount', e.target.value)}
                  placeholder={row.amount || '0.00'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Notes — full width */}
        <div className="col-span-4">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
          <Textarea
            className="mt-1 resize-none bg-white"
            rows={1}
            value={row.notes}
            onChange={e => onChange('notes', e.target.value)}
            placeholder="Optional notes…"
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dialog
// ─────────────────────────────────────────────────────────────────────────────
export default function StandaloneGovtFeeDialog({
  open, onOpenChange,
  editing      = null,
  clientId     = null,
  lockClient   = false,
  clients: propClients = [],
  onSaved,
}) {
  const empty = {
    client_id:         clientId || '',
    title:             '',
    category:          'OTHER',
    period_label:      '',
    fy_year:           '',
    due_date:          '',
    payment_date:      '',
    amount:            '',
    srn:               '',
    notes:             '',
    status:            'pending',
    reimbursed:        false,
    reimbursed_amount: '',
  };
  const [form,        setForm]        = useState(empty);
  const [rows,        setRows]        = useState([makeEmptyRow()]);
  const [saving,      setSaving]      = useState(false);
  const [clients,     setClients]     = useState(propClients);
  const [showAddCli,  setShowAddCli]  = useState(false);

  // Keep local clients list in sync with prop (parent may refresh)
  useEffect(() => { setClients(propClients); }, [propClients]);

  useEffect(() => {
    if (!open) return;
    setShowAddCli(false);
    if (editing) {
      setForm({
        client_id:    editing.client_id    || clientId || '',
        title:        editing.title        || '',
        category:     editing.category     || 'OTHER',
        period_label: editing.period_label || '',
        fy_year:      editing.fy_year      || '',
        due_date:     editing.due_date     ? editing.due_date.slice(0, 10) : '',
        payment_date: editing.payment_date ? editing.payment_date.slice(0, 10) : '',
        amount:       editing.amount ?? '',
        srn:          editing.srn          || '',
        notes:        editing.notes        || '',
        status:       editing.status       || 'pending',
        reimbursed:   !!editing.reimbursed,
        reimbursed_amount: editing.reimbursed_amount ?? '',
      });
    } else {
      setForm({ ...empty, client_id: clientId || '' });
      setRows([makeEmptyRow()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, clientId]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Multi-row helpers (create-mode only) ─────────────────────────────────
  const setRow = (key, k, v) => setRows(prev => prev.map(r => (r._key === key ? { ...r, [k]: v } : r)));
  const addRow = () => setRows(prev => [...prev, makeEmptyRow()]);
  const duplicateRow = (key) => setRows(prev => {
    const idx = prev.findIndex(r => r._key === key);
    if (idx === -1) return prev;
    const copy = { ...prev[idx], _key: `row-${Date.now()}-${_rowSeq++}`, srn: '' };
    const next = [...prev];
    next.splice(idx + 1, 0, copy);
    return next;
  });
  const removeRow = (key) => setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r._key !== key)));

  // Running totals — this is the whole point: know exactly how much to collect
  const rowsTotalAmount     = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const rowsReimbursedTotal = rows.reduce((s, r) => s + (r.reimbursed ? (parseFloat(r.reimbursed_amount) || parseFloat(r.amount) || 0) : 0), 0);

  const handleClientCreated = (newClient) => {
    setClients(prev => {
      const already = prev.find(c => c.id === newClient.id);
      return already ? prev : [...prev, newClient];
    });
    set('client_id', newClient.id);
    setShowAddCli(false);
    toast.success(`"${newClient.name}" added and selected`);
  };

  const handleSave = async () => {
    if (!lockClient && !form.client_id) {
      toast.error('Please select a client');
      return;
    }

    // ── Edit mode: single record, unchanged behaviour ──────────────────────
    if (editing?.id) {
      if (!form.title.trim()) {
        toast.error('Title is required');
        return;
      }
      setSaving(true);
      try {
        const payload = {
          ...form,
          amount:            parseFloat(form.amount) || 0,
          due_date:          form.due_date     || null,
          payment_date:      form.payment_date || null,
          period_label:      form.period_label || null,
          fy_year:           form.fy_year      || null,
          srn:               form.srn          || null,
          notes:             form.notes        || null,
          reimbursed:        !!form.reimbursed,
          reimbursed_amount: form.reimbursed && form.reimbursed_amount !== '' ? parseFloat(form.reimbursed_amount) || 0 : null,
        };
        const res = await api.patch(`/compliance/standalone-govt-fees/${editing.id}`, payload);
        toast.success('Government fee updated');
        onSaved && onSaved(res.data);
        onOpenChange(false);
      } catch (e) {
        toast.error(e?.response?.data?.detail || 'Save failed');
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Create mode: save every row for the same client in one go ──────────
    const cleanRows = rows.filter(r => r.title.trim() || r.amount !== '' || r.srn.trim());
    if (cleanRows.length === 0) {
      toast.error('Add at least one payment / form');
      return;
    }
    for (const r of cleanRows) {
      if (!r.title.trim()) {
        toast.error('Title / Purpose is required for every payment');
        return;
      }
      if (!r.amount || parseFloat(r.amount) <= 0) {
        toast.error(`Amount is required for "${r.title.trim()}"`);
        return;
      }
    }

    setSaving(true);
    const clientIdToUse = lockClient ? clientId : form.client_id;
    const saved = [];
    const failed = [];
    try {
      for (const r of cleanRows) {
        const payload = {
          client_id:          clientIdToUse,
          title:              r.title.trim(),
          category:           r.category,
          period_label:       r.period_label || null,
          fy_year:            r.fy_year      || null,
          due_date:           r.due_date     || null,
          payment_date:       r.payment_date || null,
          amount:             parseFloat(r.amount) || 0,
          srn:                r.srn?.trim()  || null,
          notes:              r.notes?.trim() || null,
          status:             r.status,
          reimbursed:         !!r.reimbursed,
          reimbursed_amount:  r.reimbursed && r.reimbursed_amount !== '' ? parseFloat(r.reimbursed_amount) || 0 : null,
        };
        try {
          const res = await api.post('/compliance/standalone-govt-fees', payload);
          saved.push(res.data);
        } catch (e) {
          failed.push(r.title.trim());
        }
      }

      if (saved.length) {
        toast.success(
          saved.length === 1
            ? 'Government fee added'
            : `${saved.length} government fees added — ₹${rowsTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} total`
        );
      }
      if (failed.length) {
        toast.error(`Failed to save: ${failed.join(', ')}`);
      }
      if (saved.length) {
        onSaved && onSaved(saved);
      }
      if (!failed.length) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${editing ? 'max-w-3xl' : 'max-w-4xl'} w-full max-h-[90vh] flex flex-col overflow-hidden p-0`}>

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50">
            <IndianRupee className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-slate-800 leading-tight">
              {editing ? 'Edit Government Fee' : 'Add Government Fee'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-0">
              {editing
                ? 'Record a one-off government fee (not part of a recurring compliance).'
                : 'Add payments for multiple forms for this client in one go — the total below shows exactly how much to collect.'}
            </DialogDescription>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          <div className="grid grid-cols-4 gap-x-4 gap-y-3">

            {/* Client — full width when visible */}
            {!lockClient && (
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client *</label>

                {/* Custom dropdown with "New Client" option */}
                {!showAddCli && (
                  <ClientSelect
                    value={form.client_id}
                    onChange={v => set('client_id', v)}
                    clients={clients}
                    onNewClient={() => setShowAddCli(true)}
                  />
                )}

                {/* Inline Add-Client panel */}
                {showAddCli && (
                  <AddClientPanel
                    onClientCreated={handleClientCreated}
                    onCancel={() => setShowAddCli(false)}
                  />
                )}
              </div>
            )}

            {/* ─── Rest of form hidden while adding a client ─── */}
            {!showAddCli && editing && (<>

              {/* Title — full width */}
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title / Purpose *</label>
                <Input
                  className="mt-1 h-9"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. Increase in Authorised Capital — SH-7"
                />
              </div>

              {/* Category | FY Year | Period Label | Status — 4 columns */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
                <Select value={form.category} onValueChange={v => set('category', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">FY Year</label>
                <Input
                  className="mt-1 h-9"
                  value={form.fy_year}
                  onChange={e => set('fy_year', e.target.value)}
                  placeholder="2024-25"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period Label</label>
                <Input
                  className="mt-1 h-9"
                  value={form.period_label}
                  onChange={e => set('period_label', e.target.value)}
                  placeholder="Q1, May, One-time"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date | Payment Date | Amount | SRN */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</label>
                <Input className="mt-1 h-9" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Date</label>
                <Input className="mt-1 h-9" type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount (₹) *</label>
                <Input
                  className="mt-1 h-9"
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SRN</label>
                <Input
                  className="mt-1 h-9 font-mono"
                  value={form.srn}
                  onChange={e => set('srn', e.target.value)}
                  placeholder="SRN…"
                />
              </div>

              {/* Reimbursed — full width */}
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reimbursed by Client</label>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex rounded-lg overflow-hidden border border-slate-200">
                    {[{ v: true, l: 'Yes — Received' }, { v: false, l: 'No' }].map(opt => (
                      <button
                        key={String(opt.v)}
                        type="button"
                        onClick={() => set('reimbursed', opt.v)}
                        className="px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={{
                          backgroundColor: form.reimbursed === opt.v ? (opt.v ? '#10b981' : '#94a3b8') : 'transparent',
                          color: form.reimbursed === opt.v ? '#fff' : '#64748b',
                        }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  {form.reimbursed && (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">Amount (₹)</span>
                      <Input
                        className="h-9 flex-1"
                        type="number" min="0" step="0.01"
                        value={form.reimbursed_amount !== '' ? form.reimbursed_amount : (form.amount || '')}
                        onChange={e => set('reimbursed_amount', e.target.value)}
                        placeholder={form.amount || '0.00'}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Notes — full width */}
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={2}
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>

            </>)}

            {/* ─── Create mode: multiple payments / forms for the same client ─── */}
            {!showAddCli && !editing && (
              <div className="col-span-4 space-y-3">
                {rows.map((row, idx) => (
                  <GovtFeeRowCard
                    key={row._key}
                    row={row}
                    idx={idx}
                    canRemove={rows.length > 1}
                    onChange={(k, v) => setRow(row._key, k, v)}
                    onRemove={() => removeRow(row._key)}
                    onDuplicate={() => duplicateRow(row._key)}
                  />
                ))}

                <button
                  type="button"
                  onClick={addRow}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Another Payment / Form
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Running totals (create mode only) — exactly how much to collect ── */}
        {!showAddCli && !editing && (
          <div className="flex items-center justify-between gap-4 px-6 py-2.5 border-t border-slate-100 shrink-0 bg-blue-50/50 text-xs">
            <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
              <Receipt className="h-3.5 w-3.5" />
              {rows.length} payment{rows.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-5">
              <span className="text-slate-500">
                Total fees: <strong className="text-slate-800">₹{rowsTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </span>
              {rowsReimbursedTotal > 0 && (
                <span className="text-slate-500">
                  Reimbursed: <strong className="text-emerald-600">₹{rowsReimbursedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-slate-500">
                <Wallet className="h-3.5 w-3.5" />
                To collect from client:
                <strong className="text-blue-700 text-sm">
                  ₹{Math.max(0, rowsTotalAmount - rowsReimbursedTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        {!showAddCli && (
          <div className="flex justify-end gap-2 px-6 py-3 border-t border-slate-100 shrink-0 bg-slate-50/60">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'linear-gradient(135deg,#0D3B66,#1F6FB2)', color: '#fff' }}
            >
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                : <><SaveIcon className="h-3.5 w-3.5 mr-1.5" />
                    {editing ? 'Update' : rows.length > 1 ? `Save All (${rows.length})` : 'Save'}
                  </>}
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
