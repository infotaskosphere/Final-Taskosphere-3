/**
 * ITRClientDialog.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A dedicated ITR (Income Tax Return) client form dialog.
 * Seamlessly integrated with the existing client system — ITR clients are
 * stored as regular clients with is_itr_client=true and ITR-specific metadata.
 *
 * Features:
 *  - PAN-centric: PAN is the primary identifier for ITR clients
 *  - ITR type selector (ITR-1 through ITR-7)
 *  - Assessment Year tracking
 *  - Income details (salary, business, capital gains, other)
 *  - Filing status + remarks
 *  - Aadhaar number
 *  - Seamlessly saved as a regular client with ITR flag
 */

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  FileText, User, IndianRupee, Calendar, Shield,
  CheckCircle2, ChevronDown, Plus, X, Loader2
} from 'lucide-react';
import api from '@/lib/api';

// ── Constants ──────────────────────────────────────────────────────────────
const ITR_TYPES = [
  { value: 'ITR-1', label: 'ITR-1 (Sahaj)', desc: 'Salary, one house property, other sources' },
  { value: 'ITR-2', label: 'ITR-2', desc: 'Capital gains, multiple properties' },
  { value: 'ITR-3', label: 'ITR-3', desc: 'Business/profession income' },
  { value: 'ITR-4', label: 'ITR-4 (Sugam)', desc: 'Presumptive income (44AD/44ADA/44AE)' },
  { value: 'ITR-5', label: 'ITR-5', desc: 'Firms, LLPs, AOPs' },
  { value: 'ITR-6', label: 'ITR-6', desc: 'Companies' },
  { value: 'ITR-7', label: 'ITR-7', desc: 'Trusts, political parties, etc.' },
];

const FILING_STATUS = [
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
  { value: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'filed', label: 'Filed', color: '#10b981' },
  { value: 'defective', label: 'Defective', color: '#ef4444' },
  { value: 'revised', label: 'Revised', color: '#8b5cf6' },
];

const ASSESSMENT_YEARS = Array.from({ length: 6 }, (_, i) => {
  const y = 2024 + i;
  return { value: `${y}-${String(y + 1).slice(2)}`, label: `AY ${y}-${String(y + 1).slice(2)}` };
});

const INCOME_HEADS = [
  { key: 'salary', label: 'Salary / Pension' },
  { key: 'house_property', label: 'House Property' },
  { key: 'business', label: 'Business / Profession' },
  { key: 'capital_gains', label: 'Capital Gains' },
  { key: 'other_sources', label: 'Other Sources' },
];

const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block';
const fieldCls = 'h-11 rounded-xl text-sm border-slate-200 focus:border-blue-400 focus:ring-blue-50 transition-colors';

// ── Validate PAN ──────────────────────────────────────────────────────────
const validatePAN = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan?.toUpperCase() || '');

// ── Validate Aadhaar ──────────────────────────────────────────────────────
const validateAadhaar = (v) => {
  const digits = (v || '').replace(/\s/g, '');
  return digits.length === 12 && /^\d+$/.test(digits);
};

// ─────────────────────────────────────────────────────────────────────────────
export default function ITRClientDialog({
  open,
  onClose,
  onSaved,
  editingClient = null,
  isDark = false,
}) {
  const isEdit = !!editingClient;

  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('basic');

  const [form, setForm] = useState(() => getDefaultForm(editingClient));

  // Reset when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setForm(getDefaultForm(editingClient));
      setActiveSection('basic');
    }
  }, [open, editingClient]);

  function getDefaultForm(client) {
    if (client) {
      const itr = client.itr_data || {};
      return {
        // Basic
        company_name: client.company_name || '',
        pan: client.pan || '',
        aadhaar: itr.aadhaar || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        status: client.status || 'active',
        // ITR Specific
        itr_type: itr.itr_type || 'ITR-1',
        assessment_year: itr.assessment_year || ASSESSMENT_YEARS[0].value,
        filing_status: itr.filing_status || 'pending',
        filing_date: itr.filing_date || '',
        acknowledgement_no: itr.acknowledgement_no || '',
        refund_amount: itr.refund_amount || '',
        tax_payable: itr.tax_payable || '',
        remarks: itr.remarks || '',
        // Income heads
        income_salary: itr.income_salary || '',
        income_house_property: itr.income_house_property || '',
        income_business: itr.income_business || '',
        income_capital_gains: itr.income_capital_gains || '',
        income_other_sources: itr.income_other_sources || '',
        // Portal access
        it_portal_user: itr.it_portal_user || '',
        it_portal_password: itr.it_portal_password || '',
      };
    }
    return {
      company_name: '', pan: '', aadhaar: '', email: '', phone: '',
      address: '', city: '', state: '', status: 'active',
      itr_type: 'ITR-1', assessment_year: ASSESSMENT_YEARS[0].value,
      filing_status: 'pending', filing_date: '', acknowledgement_no: '',
      refund_amount: '', tax_payable: '', remarks: '',
      income_salary: '', income_house_property: '', income_business: '',
      income_capital_gains: '', income_other_sources: '',
      it_portal_user: '', it_portal_password: '',
    };
  }

  const set = useCallback((field, value) => setForm(p => ({ ...p, [field]: value })), []);

  // ── Validate ────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState({});

  const validate = useCallback(() => {
    const e = {};
    if (!form.company_name?.trim() || form.company_name.trim().length < 2) {
      e.company_name = 'Name required (min 2 chars)';
    }
    if (!form.pan?.trim()) {
      e.pan = 'PAN is required for ITR clients';
    } else if (!validatePAN(form.pan)) {
      e.pan = 'Invalid PAN format (e.g. ABCDE1234F)';
    }
    if (form.aadhaar && !validateAadhaar(form.aadhaar)) {
      e.aadhaar = 'Aadhaar must be 12 digits';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Invalid email format';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) {
      toast.error('Please fix the highlighted errors');
      return;
    }
    setLoading(true);

    try {
      // ITR-specific metadata stored in a JSON field `itr_data`
      const itr_data = {
        itr_type: form.itr_type,
        assessment_year: form.assessment_year,
        filing_status: form.filing_status,
        filing_date: form.filing_date || null,
        acknowledgement_no: form.acknowledgement_no || null,
        refund_amount: form.refund_amount ? parseFloat(form.refund_amount) : null,
        tax_payable: form.tax_payable ? parseFloat(form.tax_payable) : null,
        remarks: form.remarks || null,
        aadhaar: form.aadhaar || null,
        income_salary: form.income_salary ? parseFloat(form.income_salary) : null,
        income_house_property: form.income_house_property ? parseFloat(form.income_house_property) : null,
        income_business: form.income_business ? parseFloat(form.income_business) : null,
        income_capital_gains: form.income_capital_gains ? parseFloat(form.income_capital_gains) : null,
        income_other_sources: form.income_other_sources ? parseFloat(form.income_other_sources) : null,
        it_portal_user: form.it_portal_user || null,
        it_portal_password: form.it_portal_password || null,
      };

      const payload = {
        company_name: form.company_name.trim(),
        client_type: 'proprietor', // ITR clients are always individual/proprietor
        email: form.email?.trim() || null,
        phone: form.phone?.replace(/\D/g, '') || null,
        pan: form.pan?.trim().toUpperCase() || null,
        address: form.address?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state?.trim() || null,
        status: form.status,
        services: ['Income Tax'],
        is_itr_client: true,
        itr_data,
        notes: form.remarks || null,
        dsc_details: [],
        assignments: [],
        contact_persons: [],
      };

      if (isEdit) {
        await api.put(`/clients/${editingClient.id}`, payload);
        toast.success('ITR client updated!');
      } else {
        await api.post('/clients', payload);
        toast.success('ITR client created!');
      }

      onSaved?.();
      onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) toast.error(detail.map(e => e.msg).join(' | '));
      else toast.error(detail || 'Failed to save ITR client');
    } finally {
      setLoading(false);
    }
  }, [form, validate, isEdit, editingClient, onSaved, onClose]);

  // ── Section nav ────────────────────────────────────────────────────────
  const SECTIONS = [
    { key: 'basic',    label: 'Personal',  icon: <User className="h-3.5 w-3.5" /> },
    { key: 'itr',      label: 'ITR Info',  icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'income',   label: 'Income',    icon: <IndianRupee className="h-3.5 w-3.5" /> },
    { key: 'portal',   label: 'IT Portal', icon: <Shield className="h-3.5 w-3.5" /> },
  ];

  const totalIncome = [
    form.income_salary, form.income_house_property, form.income_business,
    form.income_capital_gains, form.income_other_sources,
  ].reduce((s, v) => s + (parseFloat(v) || 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0"
        style={{ background: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#1e3a5f' : '#e2e8f0' }}
      >
        <DialogTitle className="sr-only">ITR Client</DialogTitle>
        <DialogDescription className="sr-only">Income Tax Return client form</DialogDescription>

        {/* ── Header ── */}
        <div
          className="flex-shrink-0 px-7 py-5 border-b"
          style={{ background: 'linear-gradient(135deg, #0f3460 0%, #16213e 60%, #0d7377 100%)', borderColor: 'transparent' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">
                {isEdit ? `Edit ITR Client — ${editingClient.company_name}` : 'New ITR Client'}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Income Tax Return filing client · PAN-based identity
              </p>
            </div>
            {/* Status toggle */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Active</span>
              <Switch
                checked={form.status === 'active'}
                onCheckedChange={v => set('status', v ? 'active' : 'inactive')}
              />
            </div>
          </div>

          {/* Section nav */}
          <div className="flex gap-1 mt-4">
            {SECTIONS.map(sec => (
              <button
                key={sec.key}
                onClick={() => setActiveSection(sec.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={activeSection === sec.key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.55)' }
                }
              >
                {sec.icon}
                {sec.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-7 space-y-5">

          {/* ════ PERSONAL DETAILS ════ */}
          {activeSection === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="col-span-2">
                  <label className={labelCls}>
                    Full Name / Assessee Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className={`${fieldCls} ${errors.company_name ? 'border-red-400' : ''}`}
                    placeholder="As per PAN card"
                    value={form.company_name}
                    onChange={e => set('company_name', e.target.value)}
                  />
                  {errors.company_name && <p className="text-red-500 text-xs mt-1">{errors.company_name}</p>}
                </div>

                {/* PAN */}
                <div>
                  <label className={labelCls}>
                    PAN Number <span className="text-red-400">*</span>
                  </label>
                  <Input
                    className={`${fieldCls} font-mono uppercase ${errors.pan ? 'border-red-400' : form.pan && validatePAN(form.pan) ? 'border-emerald-400' : ''}`}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    value={form.pan}
                    onChange={e => set('pan', e.target.value.toUpperCase())}
                  />
                  {errors.pan
                    ? <p className="text-red-500 text-xs mt-1">{errors.pan}</p>
                    : form.pan && validatePAN(form.pan) && (
                      <p className="text-emerald-600 text-xs mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Valid PAN
                      </p>
                    )
                  }
                </div>

                {/* Aadhaar */}
                <div>
                  <label className={labelCls}>Aadhaar Number</label>
                  <Input
                    className={`${fieldCls} font-mono ${errors.aadhaar ? 'border-red-400' : form.aadhaar && validateAadhaar(form.aadhaar) ? 'border-emerald-400' : ''}`}
                    placeholder="XXXX XXXX XXXX"
                    maxLength={14}
                    value={form.aadhaar}
                    onChange={e => set('aadhaar', e.target.value.replace(/[^\d\s]/g, ''))}
                  />
                  {errors.aadhaar && <p className="text-red-500 text-xs mt-1">{errors.aadhaar}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className={labelCls}>Email Address</label>
                  <Input
                    className={`${fieldCls} ${errors.email ? 'border-red-400' : ''}`}
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <Input
                    className={fieldCls}
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                  />
                </div>

                {/* Address */}
                <div className="col-span-2">
                  <label className={labelCls}>Address</label>
                  <Input className={fieldCls} value={form.address} onChange={e => set('address', e.target.value)} />
                </div>

                <div>
                  <label className={labelCls}>City</label>
                  <Input className={fieldCls} value={form.city} onChange={e => set('city', e.target.value)} />
                </div>

                <div>
                  <label className={labelCls}>State</label>
                  <Input className={fieldCls} value={form.state} onChange={e => set('state', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ════ ITR INFO ════ */}
          {activeSection === 'itr' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">

                {/* ITR Type */}
                <div className="col-span-2">
                  <label className={labelCls}>ITR Form Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ITR_TYPES.slice(0, 4).map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => set('itr_type', t.value)}
                        className="p-3 rounded-xl border text-left transition-all"
                        style={form.itr_type === t.value
                          ? { background: '#eff6ff', borderColor: '#3b82f6', color: '#1e40af' }
                          : { background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }
                        }
                      >
                        <p className="text-xs font-bold">{t.value}</p>
                        <p className="text-[10px] mt-0.5 leading-tight opacity-70">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {ITR_TYPES.slice(4).map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => set('itr_type', t.value)}
                        className="p-3 rounded-xl border text-left transition-all"
                        style={form.itr_type === t.value
                          ? { background: '#eff6ff', borderColor: '#3b82f6', color: '#1e40af' }
                          : { background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }
                        }
                      >
                        <p className="text-xs font-bold">{t.value}</p>
                        <p className="text-[10px] mt-0.5 leading-tight opacity-70">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assessment Year */}
                <div>
                  <label className={labelCls}>Assessment Year</label>
                  <Select value={form.assessment_year} onValueChange={v => set('assessment_year', v)}>
                    <SelectTrigger className="h-11 rounded-xl text-sm border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_YEARS.map(y => (
                        <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filing Status */}
                <div>
                  <label className={labelCls}>Filing Status</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FILING_STATUS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => set('filing_status', s.value)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                        style={form.filing_status === s.value
                          ? { background: s.color + '20', borderColor: s.color, color: s.color }
                          : { background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filing Date */}
                <div>
                  <label className={labelCls}>Filing Date</label>
                  <Input
                    className={fieldCls}
                    type="date"
                    value={form.filing_date}
                    onChange={e => set('filing_date', e.target.value)}
                  />
                </div>

                {/* Acknowledgement No */}
                <div>
                  <label className={labelCls}>Acknowledgement Number</label>
                  <Input
                    className={`${fieldCls} font-mono`}
                    placeholder="15-digit ACK no."
                    value={form.acknowledgement_no}
                    onChange={e => set('acknowledgement_no', e.target.value)}
                  />
                </div>

                {/* Refund Amount */}
                <div>
                  <label className={labelCls}>Refund Amount (₹)</label>
                  <Input
                    className={fieldCls}
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={form.refund_amount}
                    onChange={e => set('refund_amount', e.target.value)}
                  />
                </div>

                {/* Tax Payable */}
                <div>
                  <label className={labelCls}>Tax Payable / Demand (₹)</label>
                  <Input
                    className={fieldCls}
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={form.tax_payable}
                    onChange={e => set('tax_payable', e.target.value)}
                  />
                </div>

                {/* Remarks */}
                <div className="col-span-2">
                  <label className={labelCls}>Remarks / Notes</label>
                  <textarea
                    className="w-full min-h-[80px] rounded-xl border text-sm px-3.5 py-2.5 resize-none outline-none transition-all border-slate-200 focus:border-blue-400"
                    style={{ background: isDark ? '#1e293b' : '#f8fafc', color: isDark ? '#e2e8f0' : '#0f172a' }}
                    placeholder="Documents collected, pending items, notes…"
                    value={form.remarks}
                    onChange={e => set('remarks', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ════ INCOME DETAILS ════ */}
          {activeSection === 'income' && (
            <div className="space-y-4">
              {/* Total income summary */}
              {totalIncome > 0 && (
                <div className="rounded-2xl p-4 border" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <p className="text-xs font-bold text-emerald-700 mb-1">Gross Total Income</p>
                  <p className="text-2xl font-bold text-emerald-800">
                    ₹{totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {INCOME_HEADS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-4">
                    <label className="text-sm font-medium w-44 flex-shrink-0"
                      style={{ color: isDark ? '#94a3b8' : '#64748b' }}>
                      {label}
                    </label>
                    <div className="flex-1 relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                      <Input
                        className="pl-8 h-11 rounded-xl border-slate-200 focus:border-blue-400 text-sm"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={form[`income_${key}`]}
                        onChange={e => set(`income_${key}`, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {totalIncome > 0 && (
                <div className="rounded-xl p-3 border" style={{ background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <div className="space-y-1">
                    {INCOME_HEADS.map(({ key, label }) =>
                      form[`income_${key}`] ? (
                        <div key={key} className="flex justify-between text-xs">
                          <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>{label}</span>
                          <span className="font-semibold" style={{ color: isDark ? '#e2e8f0' : '#0f172a' }}>
                            ₹{parseFloat(form[`income_${key}`]).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ) : null
                    )}
                    <div className="flex justify-between text-xs font-bold pt-2 border-t" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                      <span style={{ color: isDark ? '#94a3b8' : '#475569' }}>Gross Total</span>
                      <span className="text-emerald-600">₹{totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ IT PORTAL ════ */}
          {activeSection === 'portal' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 border" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Credentials are stored securely in PassVault
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  These are auto-synced with PassVault on save. Access via the Passwords module.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>IT Portal User ID (PAN / Email)</label>
                  <Input
                    className={`${fieldCls} font-mono`}
                    placeholder="PAN or registered email"
                    value={form.it_portal_user}
                    onChange={e => set('it_portal_user', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>IT Portal Password</label>
                  <Input
                    className={`${fieldCls} font-mono`}
                    type="password"
                    placeholder="••••••••"
                    value={form.it_portal_password}
                    onChange={e => set('it_portal_password', e.target.value)}
                  />
                </div>
              </div>

              {/* Quick info card */}
              <div className="rounded-xl border p-4 space-y-2"
                style={{ background: isDark ? '#1e293b' : '#f0f9ff', borderColor: isDark ? '#1e3a5f' : '#bae6fd' }}>
                <p className="text-xs font-bold" style={{ color: isDark ? '#93c5fd' : '#0369a1' }}>
                  Income Tax Portal — incometax.gov.in
                </p>
                <p className="text-xs" style={{ color: isDark ? '#60a5fa' : '#0284c7' }}>
                  Login with PAN as User ID. New portal requires Aadhaar-linked mobile OTP for first login.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t"
          style={{ borderColor: isDark ? '#1e2d3d' : '#f1f5f9', background: isDark ? '#0a1220' : '#fff' }}
        >
          <Button type="button" variant="ghost" onClick={onClose}
            className="h-10 px-4 text-sm rounded-xl"
            style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
            Cancel
          </Button>

          {/* Section nav shortcuts */}
          <div className="flex gap-1">
            {SECTIONS.map(sec => (
              <button key={sec.key} onClick={() => setActiveSection(sec.key)}
                className="w-2 h-2 rounded-full transition-all"
                style={{ background: activeSection === sec.key ? '#3b82f6' : (isDark ? '#334155' : '#e2e8f0') }} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {activeSection !== 'portal' && (
              <Button type="button"
                onClick={() => {
                  const idx = SECTIONS.findIndex(s => s.key === activeSection);
                  if (idx < SECTIONS.length - 1) setActiveSection(SECTIONS[idx + 1].key);
                }}
                variant="outline"
                className="h-10 px-4 text-sm rounded-xl border-slate-200">
                Next →
              </Button>
            )}
            <button
              disabled={loading}
              onClick={handleSubmit}
              className="flex items-center gap-2 h-10 px-6 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0f3460, #0d7377)' }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="h-4 w-4" /> {isEdit ? 'Update ITR Client' : 'Save ITR Client'}</>
              }
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
