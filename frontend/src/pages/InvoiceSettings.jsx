/**
 * InvoiceSettings.jsx
 *
 * Universal per-company invoice configuration panel.
 * Place in: src/pages/InvoiceSettings.jsx
 *
 * ── FEATURES ────────────────────────────────────────────────────────────────
 *  • Per-company configuration (switch companies in left panel)
 *  • Numbering  — prefix, separator, FY format, padding, start number,
 *                 separate sequences per document type
 *  • Identity   — document titles, authorized signatory, show/hide fields
 *  • Defaults   — payment terms, notes, T&C, supply state, default GST rate
 *  • Bank / UPI — bank details shown on invoice footer
 *  • Design     — default template, theme/color per company
 *  • Live preview of generated invoice number
 *  • Settings stored in localStorage (JSON per company)
 *
 * ── INTEGRATION ──────────────────────────────────────────────────────────────
 *
 *  import InvoiceSettings, { getInvSettings, getNextInvoiceNumber } from './InvoiceSettings';
 *
 *  // State in Invoicing():
 *  const [settingsOpen, setSettingsOpen] = useState(false);
 *
 *  // Button in page header:
 *  <Button onClick={() => setSettingsOpen(true)}>
 *    <Settings className="h-4 w-4" /> Settings
 *  </Button>
 *
 *  // Dialog:
 *  <InvoiceSettings
 *    open={settingsOpen}
 *    onClose={() => setSettingsOpen(false)}
 *    companies={companies}
 *    isDark={isDark}
 *  />
 *
 *  // To get settings anywhere:
 *  const s = getInvSettings(company.id);
 *
 *  // To get next invoice number (in InvoiceForm):
 *  const nextNum = getNextInvoiceNumber(company.id, 'invoice');
 *  // → "INV/25-26/001"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Settings, Building2, Hash, FileText, CreditCard, Palette,
  X, Save, RefreshCw, ChevronRight, Eye, Check, Copy,
  Receipt, Tag, Landmark, QrCode, Shield, Pen, AlertCircle,
  BookOpen, StickyNote, Stamp,
} from 'lucide-react';
import { COLOR_THEMES, INVOICE_TEMPLATES } from './InvoiceTemplates';

// ─── Storage key ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'taskosphere_inv_settings';

// ─── Default settings per company ────────────────────────────────────────────
export const DEFAULT_INV_SETTINGS = {
  // ── Numbering ──────────────────────────────────────────────────────────────
  prefix:          'INV',
  separator:       '/',        // '/' | '-' | '_' | '.' | 'none'
  include_fy:      true,
  fy_format:       'short',        // 'short' = 25-26 | 'long' = 2025-2026
  include_month:   false,          // include month for monthly reset (e.g. 03)
  number_padding:  3,              // digits: 3 = 001, 4 = 0001
  current_number:  1,              // next invoice number
  auto_reset_fy:   true,           // reset counter on new financial year

  // Type-specific prefixes (leave '' to inherit main prefix)
  proforma_prefix:    'PRO',
  estimate_prefix:    'EST',
  credit_note_prefix: 'CN',
  debit_note_prefix:  'DN',

  // ── Identity ───────────────────────────────────────────────────────────────
  invoice_title:       'Tax Invoice',
  proforma_title:      'Proforma Invoice',
  estimate_title:      'Estimate / Quotation',
  credit_note_title:   'Credit Note',
  debit_note_title:    'Debit Note',
  footer_line:         'Thank you for your business!',
  signatory_name:      '',          // e.g. "Authorised Signatory"
  signatory_label:     'For [Company Name]',

  // Show / hide on printed invoice
  show_logo:           true,
  show_gstin:          true,
  show_bank_details:   true,
  show_signature_box:  true,
  show_seal:           false,
  show_qr_code:        false,
  show_due_date:       true,
  show_po_number:      true,
  show_hsn_column:     true,
  show_discount_column:true,

  // ── Defaults ───────────────────────────────────────────────────────────────
  default_payment_terms: 'Due within 30 days',
  default_due_days:      30,
  default_notes:         '',
  default_terms:         '',
  default_gst_rate:      18,
  supply_state:          '',        // for auto IGST detection

  // ── Bank & Payment ─────────────────────────────────────────────────────────
  bank_account_holder:  '',
  bank_name:            '',
  bank_account_no:      '',
  bank_ifsc:            '',
  bank_branch:          '',
  upi_id:               '',

  // ── Design ─────────────────────────────────────────────────────────────────
  template:      'classic',
  theme:         'ocean',
  custom_color:  '#0D3B66',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIndianFY(date = new Date()) {
  const m = date.getMonth(), y = date.getFullYear();
  return m >= 3 ? { start: y, end: y + 1 } : { start: y - 1, end: y };
}

/** Load ALL settings from localStorage */
function loadAllSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** Load settings for a single company (merged with defaults) */
export function getInvSettings(companyId) {
  const all = loadAllSettings();
  return { ...DEFAULT_INV_SETTINGS, ...(all[companyId] || {}) };
}

/** Save settings for a single company */
function saveInvSettings(companyId, settings) {
  const all = loadAllSettings();
  all[companyId] = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Generate the next invoice number for a company+type.
 * Also increments the stored counter.
 */
export function getNextInvoiceNumber(companyId, type = 'invoice', increment = false) {
  const s = getInvSettings(companyId);
  const now = new Date();
  const fy  = getIndianFY(now);

  // Choose prefix by type
  const prefixMap = {
    invoice:     s.prefix,
    proforma:    s.proforma_prefix    || s.prefix,
    estimate:    s.estimate_prefix    || s.prefix,
    credit_note: s.credit_note_prefix || 'CN',
    debit_note:  s.debit_note_prefix  || 'DN',
  };
  const prefix = prefixMap[type] || s.prefix;

  // FY string
  const fyStr = s.fy_format === 'long'
    ? `${fy.start}-${fy.end}`
    : `${String(fy.start).slice(2)}-${String(fy.end).slice(2)}`;

  // Month string (optional)
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const num = String(s.current_number).padStart(s.number_padding, '0');
  const sep = (!s.separator || s.separator === 'none') ? '' : s.separator;

  const parts = [prefix];
  if (s.include_fy)    parts.push(fyStr);
  if (s.include_month) parts.push(month);
  parts.push(num);

  if (increment) {
    saveInvSettings(companyId, { ...s, current_number: s.current_number + 1 });
  }

  return parts.join(sep);
}

// ─── Live preview ─────────────────────────────────────────────────────────────
function previewNumber(s, type = 'invoice') {
  const now = new Date();
  const fy  = getIndianFY(now);
  const prefixMap = {
    invoice:     s.prefix,
    proforma:    s.proforma_prefix    || s.prefix,
    estimate:    s.estimate_prefix    || s.prefix,
    credit_note: s.credit_note_prefix || 'CN',
    debit_note:  s.debit_note_prefix  || 'DN',
  };
  const prefix = prefixMap[type] || s.prefix;
  const fyStr  = s.fy_format === 'long'
    ? `${fy.start}-${fy.end}`
    : `${String(fy.start).slice(2)}-${String(fy.end).slice(2)}`;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const num   = String(s.current_number || 1).padStart(s.number_padding || 3, '0');
  const sep   = (!s.separator || s.separator === 'none') ? '' : s.separator;
  const parts = [prefix];
  if (s.include_fy)    parts.push(fyStr);
  if (s.include_month) parts.push(month);
  parts.push(num);
  return parts.join(sep);
}

const AVATAR_GRADS = [
  ['#0D3B66','#1F6FB2'],['#064e3b','#059669'],['#7c2d12','#ea580c'],
  ['#4c1d95','#7c3aed'],['#881337','#e11d48'],['#134e4a','#0d9488'],
];
const avatarGrad = (name = '') => {
  const i = (name?.charCodeAt(0) || 0) % AVATAR_GRADS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADS[i][0]}, ${AVATAR_GRADS[i][1]})`;
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function InvoiceSettings({ open, onClose, companies = [], isDark }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [form, setForm]     = useState({ ...DEFAULT_INV_SETTINGS });
  const [tab,  setTab]      = useState('numbering');
  const [saved, setSaved]   = useState(false);

  // Load settings when company or modal opens
  useEffect(() => {
    if (open) {
      const cid = selectedCompanyId || companies[0]?.id || '';
      setSelectedCompanyId(cid);
      if (cid) setForm(getInvSettings(cid));
      setTab('numbering');
      setSaved(false);
    }
  }, [open]);

  // Load when switching company
  useEffect(() => {
    if (selectedCompanyId) setForm(getInvSettings(selectedCompanyId));
    setSaved(false);
  }, [selectedCompanyId]);

  const setField = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const handleSave = useCallback(() => {
    if (!selectedCompanyId) { toast.error('Select a company first'); return; }
    saveInvSettings(selectedCompanyId, form);
    setSaved(true);
    toast.success(`Settings saved for ${companies.find(c => c.id === selectedCompanyId)?.name || 'company'}`);
    setTimeout(() => setSaved(false), 2500);
  }, [selectedCompanyId, form, companies]);

  const handleReset = useCallback(() => {
    if (!window.confirm('Reset all settings for this company to defaults?')) return;
    setForm({ ...DEFAULT_INV_SETTINGS });
    if (selectedCompanyId) saveInvSettings(selectedCompanyId, { ...DEFAULT_INV_SETTINGS });
    toast.success('Reset to defaults');
  }, [selectedCompanyId]);

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  // Style helpers
  const lbl = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const inp = `h-10 rounded-xl text-sm border-slate-200 focus:border-blue-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white'}`;
  const cardCls = `border rounded-2xl p-5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`;
  const sectionTitle = (title, sub) => (
    <div className="mb-5">
      <h3 className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{title}</h3>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );

  const TABS = [
    { id: 'numbering', label: 'Numbering',   icon: Hash,      sub: 'Format & sequence' },
    { id: 'identity',  label: 'Identity',    icon: FileText,  sub: 'Titles & display' },
    { id: 'defaults',  label: 'Defaults',    icon: StickyNote,sub: 'Terms & notes' },
    { id: 'bank',      label: 'Bank / UPI',  icon: Landmark,  sub: 'Payment details' },
    { id: 'design',    label: 'Design',      icon: Palette,   sub: 'Template & theme' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-[92vw] w-[1100px] max-h-[95vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 [&>button.absolute]:hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Invoice Settings</DialogTitle>
        <DialogDescription className="sr-only">Configure per-company invoice settings</DialogDescription>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-7 py-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
          <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Invoice Settings</h2>
                <p className="text-blue-200 text-xs mt-0.5">Configure numbering, identity, defaults & design per company</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleReset}
                className="h-8 px-3 text-xs rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/25 border gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" onClick={handleSave}
                className={`h-8 px-4 text-xs rounded-xl font-semibold gap-1.5 transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 hover:bg-blue-50'}`}>
                {saved ? <><Check className="h-3.5 w-3.5" /> Saved!</> : <><Save className="h-3.5 w-3.5" /> Save Settings</>}
              </Button>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── Left: Company list ── */}
          <div className={`w-56 flex-shrink-0 border-r flex flex-col ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50/60'}`}>
            <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Companies</p>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {companies.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 px-4 text-center">
                  <Building2 className="h-7 w-7 opacity-25" />
                  <p className="text-xs text-slate-400">No companies found. Add a company profile first.</p>
                </div>
              ) : companies.map(c => (
                <button key={c.id} onClick={() => setSelectedCompanyId(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all group
                    ${c.id === selectedCompanyId
                      ? (isDark ? 'bg-blue-900/30 border-r-2 border-blue-500' : 'bg-blue-50 border-r-2 border-blue-500')
                      : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-white')}`}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: avatarGrad(c.name) }}>
                    {c.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'} ${c.id === selectedCompanyId ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                      {c.name}
                    </p>
                    {c.gstin && <p className="text-[9px] text-slate-400 font-mono truncate">{c.gstin}</p>}
                  </div>
                  {c.id === selectedCompanyId && <ChevronRight className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: Settings panel ── */}
          {!selectedCompanyId ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <Settings className="h-10 w-10 opacity-20" />
              <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Select a company to configure</p>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* Tab bar */}
              <div className={`flex border-b flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap
                      ${tab === t.id
                        ? `border-blue-500 ${isDark ? 'text-blue-400' : 'text-blue-600'}`
                        : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}`}>
                    <t.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {t.label}
                    <span className={`text-[9px] hidden sm:inline ${tab === t.id ? 'text-blue-400' : 'text-slate-400'}`}>{t.sub}</span>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* ══ NUMBERING ══════════════════════════════════════════════ */}
                {tab === 'numbering' && (
                  <>
                    {/* Live preview */}
                    <div className={`rounded-2xl p-5 border ${isDark ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>Live Preview</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {[
                          { type: 'invoice',     label: 'Tax Invoice' },
                          { type: 'proforma',    label: 'Proforma' },
                          { type: 'estimate',    label: 'Estimate' },
                          { type: 'credit_note', label: 'Credit Note' },
                          { type: 'debit_note',  label: 'Debit Note' },
                        ].map(({ type, label }) => (
                          <div key={type} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                            <span className="text-[10px] text-slate-400 font-medium">{label}:</span>
                            <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                              {previewNumber(form, type)}
                            </span>
                            <button onClick={() => navigator.clipboard.writeText(previewNumber(form, type))}
                              className="opacity-50 hover:opacity-100 transition-opacity">
                              <Copy className="h-3 w-3 text-slate-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className={cardCls}>
                        {sectionTitle('Main Invoice Number', 'Format applied to Tax Invoices')}
                        <div className="space-y-4">
                          <div>
                            <label className={lbl}>Prefix / Initials</label>
                            <Input className={inp} placeholder="INV" value={form.prefix}
                              onChange={e => setField('prefix', e.target.value.toUpperCase())} />
                            <p className="text-[10px] text-slate-400 mt-1">e.g. INV, TAX, GST, your initials</p>
                          </div>
                          <div>
                            <label className={lbl}>Separator</label>
                            <Select value={form.separator} onValueChange={v => setField('separator', v)}>
                              <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="/">Forward slash ( / )</SelectItem>
                                <SelectItem value="-">Hyphen ( - )</SelectItem>
                                <SelectItem value="_">Underscore ( _ )</SelectItem>
                                <SelectItem value=".">Dot ( . )</SelectItem>
                                <SelectItem value="none">No separator</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={lbl}>Number Padding</label>
                            <Select value={String(form.number_padding)} onValueChange={v => setField('number_padding', parseInt(v))}>
                              <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2">2 digits — 01, 02 …</SelectItem>
                                <SelectItem value="3">3 digits — 001, 002 …</SelectItem>
                                <SelectItem value="4">4 digits — 0001, 0002 …</SelectItem>
                                <SelectItem value="5">5 digits — 00001 …</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={lbl}>Starting / Current Number</label>
                            <Input type="number" min="1" className={inp} value={form.current_number}
                              onChange={e => setField('current_number', parseInt(e.target.value) || 1)} />
                            <p className="text-[10px] text-slate-400 mt-1">Next invoice will use this number</p>
                          </div>
                        </div>
                      </div>

                      <div className={cardCls}>
                        {sectionTitle('Financial Year & Month', 'Include FY or month in number')}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Include Financial Year</p>
                              <p className="text-xs text-slate-400">Adds FY to number e.g. 25-26</p>
                            </div>
                            <Switch checked={form.include_fy} onCheckedChange={v => setField('include_fy', v)} />
                          </div>
                          {form.include_fy && (
                            <div>
                              <label className={lbl}>FY Format</label>
                              <Select value={form.fy_format} onValueChange={v => setField('fy_format', v)}>
                                <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="short">Short — 25-26</SelectItem>
                                  <SelectItem value="long">Long — 2025-2026</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Include Month</p>
                              <p className="text-xs text-slate-400">e.g. INV/25-26/03/001</p>
                            </div>
                            <Switch checked={form.include_month} onCheckedChange={v => setField('include_month', v)} />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Auto-reset on new FY</p>
                              <p className="text-xs text-slate-400">Counter resets to 1 on Apr 1</p>
                            </div>
                            <Switch checked={form.auto_reset_fy} onCheckedChange={v => setField('auto_reset_fy', v)} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={cardCls}>
                      {sectionTitle('Document-Specific Prefixes', 'Separate prefix for each document type')}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { key: 'proforma_prefix',    label: 'Proforma Invoice', placeholder: 'PRO' },
                          { key: 'estimate_prefix',    label: 'Estimate / Quote',  placeholder: 'EST' },
                          { key: 'credit_note_prefix', label: 'Credit Note',       placeholder: 'CN' },
                          { key: 'debit_note_prefix',  label: 'Debit Note',        placeholder: 'DN' },
                        ].map(({ key, label, placeholder }) => (
                          <div key={key}>
                            <label className={lbl}>{label}</label>
                            <Input className={inp} placeholder={placeholder} value={form[key]}
                              onChange={e => setField(key, e.target.value.toUpperCase())} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3">Leave blank to use the main prefix for that document type.</p>
                    </div>
                  </>
                )}

                {/* ══ IDENTITY ═══════════════════════════════════════════════ */}
                {tab === 'identity' && (
                  <>
                    <div className={cardCls}>
                      {sectionTitle('Document Titles', 'Heading printed at the top of each document')}
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { key: 'invoice_title',    label: 'Tax Invoice Title',      placeholder: 'Tax Invoice' },
                          { key: 'proforma_title',   label: 'Proforma Invoice Title', placeholder: 'Proforma Invoice' },
                          { key: 'estimate_title',   label: 'Estimate / Quote Title', placeholder: 'Estimate / Quotation' },
                          { key: 'credit_note_title',label: 'Credit Note Title',      placeholder: 'Credit Note' },
                          { key: 'debit_note_title', label: 'Debit Note Title',       placeholder: 'Debit Note' },
                          { key: 'footer_line',      label: 'Footer Line',            placeholder: 'Thank you for your business!' },
                        ].map(({ key, label, placeholder }) => (
                          <div key={key}>
                            <label className={lbl}>{label}</label>
                            <Input className={inp} placeholder={placeholder} value={form[key]}
                              onChange={e => setField(key, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={cardCls}>
                      {sectionTitle('Authorised Signatory', 'Text shown in the signature/seal area')}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={lbl}>Signatory Name</label>
                          <Input className={inp} placeholder="e.g. Rahul Shah" value={form.signatory_name}
                            onChange={e => setField('signatory_name', e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Signatory Label</label>
                          <Input className={inp} placeholder="For [Company Name]" value={form.signatory_label}
                            onChange={e => setField('signatory_label', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className={cardCls}>
                      {sectionTitle('Show / Hide Sections', 'Toggle which sections appear on printed invoices')}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                          { key: 'show_logo',            label: 'Company Logo' },
                          { key: 'show_gstin',           label: 'GSTIN on Invoice' },
                          { key: 'show_bank_details',    label: 'Bank Details' },
                          { key: 'show_signature_box',   label: 'Signature Box' },
                          { key: 'show_seal',            label: 'Company Seal Placeholder' },
                          { key: 'show_qr_code',         label: 'QR Code (UPI)' },
                          { key: 'show_due_date',        label: 'Due Date' },
                          { key: 'show_po_number',       label: 'PO / Reference No.' },
                          { key: 'show_hsn_column',      label: 'HSN/SAC Column' },
                          { key: 'show_discount_column', label: 'Discount Column' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between">
                            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</p>
                            <Switch checked={!!form[key]} onCheckedChange={v => setField(key, v)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ══ DEFAULTS ═══════════════════════════════════════════════ */}
                {tab === 'defaults' && (
                  <>
                    <div className={cardCls}>
                      {sectionTitle('Payment & Tax Defaults', 'Pre-filled when creating a new invoice')}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <label className={lbl}>Default Payment Terms</label>
                          <Input className={inp} placeholder="Due within 30 days"
                            value={form.default_payment_terms}
                            onChange={e => setField('default_payment_terms', e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Default Due Days</label>
                          <Input type="number" min="0" className={inp} value={form.default_due_days}
                            onChange={e => setField('default_due_days', parseInt(e.target.value) || 30)} />
                          <p className="text-[10px] text-slate-400 mt-1">Added to invoice date</p>
                        </div>
                        <div>
                          <label className={lbl}>Default GST Rate (%)</label>
                          <Select value={String(form.default_gst_rate)} onValueChange={v => setField('default_gst_rate', parseFloat(v))}>
                            <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[0, 5, 12, 18, 28].map(r => (
                                <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-3">
                          <label className={lbl}>Supply State (Your State)</label>
                          <Input className={inp} placeholder="e.g. Gujarat" value={form.supply_state}
                            onChange={e => setField('supply_state', e.target.value)} />
                          <p className="text-[10px] text-slate-400 mt-1">Used to auto-detect IGST vs CGST+SGST</p>
                        </div>
                      </div>
                    </div>

                    <div className={cardCls}>
                      {sectionTitle('Default Notes & Terms', 'Shown on every new invoice — can be overridden per invoice')}
                      <div className="space-y-4">
                        <div>
                          <label className={lbl}>Default Notes (shown on invoice)</label>
                          <Textarea
                            className={`rounded-xl text-sm min-h-[80px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}
                            placeholder="e.g. All payments subject to clearance…"
                            value={form.default_notes}
                            onChange={e => setField('default_notes', e.target.value)} />
                        </div>
                        <div>
                          <label className={lbl}>Default Terms & Conditions</label>
                          <Textarea
                            className={`rounded-xl text-sm min-h-[100px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}
                            placeholder="e.g. Goods once sold will not be taken back…"
                            value={form.default_terms}
                            onChange={e => setField('default_terms', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ══ BANK & UPI ══════════════════════════════════════════════ */}
                {tab === 'bank' && (
                  <>
                    <div className={`rounded-2xl p-4 border flex items-start gap-3 ${isDark ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Bank details are printed on invoices to make it easy for clients to pay.
                        Make sure the account number and IFSC are accurate before enabling.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                      <div className={cardCls}>
                        {sectionTitle('Bank Account Details', 'Shown on invoice for direct bank transfers')}
                        <div className="space-y-4">
                          {[
                            { key: 'bank_account_holder', label: 'Account Holder Name', placeholder: 'As per bank records' },
                            { key: 'bank_name',           label: 'Bank Name',           placeholder: 'e.g. HDFC Bank' },
                            { key: 'bank_account_no',     label: 'Account Number',      placeholder: '0000000000000' },
                            { key: 'bank_ifsc',           label: 'IFSC Code',           placeholder: 'HDFC0001234' },
                            { key: 'bank_branch',         label: 'Branch',              placeholder: 'e.g. Surat Main Branch' },
                          ].map(({ key, label, placeholder }) => (
                            <div key={key}>
                              <label className={lbl}>{label}</label>
                              <Input className={inp} placeholder={placeholder} value={form[key]}
                                onChange={e => setField(key, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div className={cardCls}>
                          {sectionTitle('UPI / QR Payment', 'For digital payments via UPI')}
                          <div>
                            <label className={lbl}>UPI ID</label>
                            <Input className={inp} placeholder="yourname@bankname" value={form.upi_id}
                              onChange={e => setField('upi_id', e.target.value)} />
                            <p className="text-[10px] text-slate-400 mt-1.5">Used to generate QR code on invoice (when enabled)</p>
                          </div>
                          <div className="flex items-center justify-between mt-4">
                            <div>
                              <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Show QR Code</p>
                              <p className="text-xs text-slate-400">UPI QR printed on invoice</p>
                            </div>
                            <Switch checked={form.show_qr_code} onCheckedChange={v => setField('show_qr_code', v)} />
                          </div>
                        </div>

                        <div className={`rounded-2xl p-5 border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                          {sectionTitle('Preview', 'How bank details will appear on invoice')}
                          <div className={`rounded-xl p-4 border text-xs space-y-1 font-mono ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                            <p className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-2">Bank Details</p>
                            <p><span className="text-slate-400">Name:</span> {form.bank_account_holder || '—'}</p>
                            <p><span className="text-slate-400">Bank:</span> {form.bank_name || '—'}</p>
                            <p><span className="text-slate-400">A/C No:</span> {form.bank_account_no || '—'}</p>
                            <p><span className="text-slate-400">IFSC:</span> {form.bank_ifsc || '—'}</p>
                            {form.bank_branch && <p><span className="text-slate-400">Branch:</span> {form.bank_branch}</p>}
                            {form.upi_id && <p><span className="text-slate-400">UPI:</span> {form.upi_id}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ══ DESIGN ══════════════════════════════════════════════════ */}
                {tab === 'design' && (
                  <>
                    <div className={cardCls}>
                      {sectionTitle('Default Invoice Template', 'Used when printing invoices for this company')}
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                        {INVOICE_TEMPLATES.map(t => (
                          <button key={t.id} onClick={() => setField('template', t.id)}
                            className={`rounded-xl border-2 p-3 text-center transition-all flex flex-col items-center gap-2
                              ${form.template === t.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                : (isDark ? 'border-slate-600 hover:border-slate-500 bg-slate-700/40' : 'border-slate-200 hover:border-blue-300 bg-white')}`}>
                            <div className={`w-12 h-16 rounded-lg flex flex-col gap-1 p-1.5 flex-shrink-0 ${isDark ? 'bg-slate-600' : 'bg-slate-100'}`}>
                              <div className="h-3 rounded w-full" style={{ background: form.template === t.id ? '#1F6FB2' : '#cbd5e1' }} />
                              {[...Array(3)].map((_, i) => (
                                <div key={i} className={`h-1 rounded ${i < 2 ? 'w-full' : 'w-2/3'}`}
                                  style={{ background: isDark ? '#4b5563' : '#e2e8f0' }} />
                              ))}
                            </div>
                            <p className={`text-[10px] font-semibold leading-tight ${form.template === t.id ? 'text-blue-600 dark:text-blue-400' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>
                              {t.name}
                            </p>
                            {form.template === t.id && <Check className="h-3.5 w-3.5 text-blue-500" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={cardCls}>
                      {sectionTitle('Default Color Theme', 'Primary color used in the invoice template')}
                      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                        {COLOR_THEMES.map(t => (
                          <button key={t.id} onClick={() => setField('theme', t.id)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                              ${form.theme === t.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : (isDark ? 'border-slate-600 hover:border-slate-500 bg-slate-700/40' : 'border-slate-200 hover:border-blue-300 bg-white')}`}>
                            <div className="w-9 h-9 rounded-xl shadow-sm flex-shrink-0 relative overflow-hidden">
                              <div className="absolute inset-0" style={{ background: t.primary }} />
                              <div className="absolute right-0 bottom-0 w-4 h-4 rounded-tl-lg" style={{ background: t.secondary }} />
                            </div>
                            <p className={`text-[9px] font-semibold text-center leading-tight ${form.theme === t.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                              {t.name}
                            </p>
                            {form.theme === t.id && <Check className="h-3 w-3 text-blue-500" />}
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 flex items-center gap-4">
                        <div>
                          <label className={lbl}>Custom Brand Color</label>
                          <div className="flex items-center gap-3 mt-1">
                            <input type="color" value={form.custom_color}
                              onChange={e => { setField('custom_color', e.target.value); setField('theme', 'custom'); }}
                              className="w-10 h-10 rounded-lg cursor-pointer border-none p-0.5 bg-transparent" />
                            <Input className={`${inp} w-32 font-mono uppercase`} value={form.custom_color}
                              onChange={e => { setField('custom_color', e.target.value); setField('theme', 'custom'); }} />
                            {form.theme === 'custom' && (
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-1 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </div>

              {/* Save footer */}
              <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                <p className="text-xs text-slate-400">
                  Settings for: <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{selectedCompany?.name}</span>
                  {selectedCompany?.gstin && <span className="ml-2 font-mono text-slate-400">{selectedCompany.gstin}</span>}
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-sm rounded-xl text-slate-500">Close</Button>
                  <Button onClick={handleSave}
                    className={`h-9 px-6 text-sm rounded-xl font-semibold gap-2 transition-all ${saved ? 'bg-emerald-500 text-white' : 'text-white'}`}
                    style={saved ? {} : { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    {saved ? <><Check className="h-4 w-4" /> Saved!</> : <><Save className="h-4 w-4" /> Save Settings</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
