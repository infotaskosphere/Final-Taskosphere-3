import Papa from 'papaparse/papaparse.js';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  Plus, Edit, Trash2, FileText, Search, Download, X, ChevronRight,
  CheckCircle2, Clock, AlertCircle, TrendingUp, DollarSign, BarChart3,
  Building2, Users, Receipt, CreditCard, RefreshCw, Eye, Send, Copy,
  Repeat, Package, Tag, ChevronDown, ChevronUp, Percent, Truck,
  ArrowUpRight, Activity, Zap, Shield, Star, Filter,
  IndianRupee, CalendarDays, FileCheck, ArrowRightLeft, Layers,
  Upload, Database, FileUp, CheckSquare, AlertTriangle, Phone, Mail,
  FileSpreadsheet, Briefcase, PieChart, Settings, Table, FileDown,
} from 'lucide-react';
import InvoiceSettings, { getInvSettings, getNextInvoiceNumber } from './InvoiceSettings';

// ─── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
  purple: '#7C3AED',
  teal: '#0D9488',
};

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['service','nos','kg','ltr','mtr','sqft','hr','day','month','year','set','lot','pcs','box'];
const PAY_MODES = ['cash','cheque','neft','rtgs','imps','upi','card','other'];
const INV_TYPES = [
  { value: 'tax_invoice', label: 'Tax Invoice' },
  { value: 'proforma', label: 'Proforma Invoice' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'credit_note', label: 'Credit Note' },
  { value: 'debit_note', label: 'Debit Note' },
];
const STATUS_META = {
  draft: { label: 'Draft', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400', hex: '#94A3B8' },
  sent: { label: 'Sent', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', hex: COLORS.mediumBlue },
  partially_paid: { label: 'Partial', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400', hex: COLORS.amber },
  paid: { label: 'Paid', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', hex: COLORS.emeraldGreen },
  overdue: { label: 'Overdue', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', hex: COLORS.coral },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400', hex: '#94A3B8' },
  credit_note: { label: 'Credit Note', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500', hex: COLORS.purple },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmt(n)}`;
const getStatusMeta = (inv) => {
  if (inv.status && STATUS_META[inv.status]) return STATUS_META[inv.status];
  if (inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0)
    return STATUS_META.overdue;
  return STATUS_META.draft;
};
const emptyItem = () => ({
  description: '', hsn_sac: '', quantity: 1, unit: 'service',
  unit_price: 0, discount_pct: 0, gst_rate: 18,
  taxable_value: 0, cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_amount: 0,
});
const computeItem = (item, isInter) => {
  const disc = item.unit_price * item.quantity * (item.discount_pct / 100);
  const taxable = Math.round((item.unit_price * item.quantity - disc) * 100) / 100;
  const g = item.gst_rate;
  if (isInter) {
    const igst = Math.round(taxable * g / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: 0, sgst_rate: 0, igst_rate: g,
      cgst_amount: 0, sgst_amount: 0, igst_amount: igst,
      total_amount: Math.round((taxable + igst) * 100) / 100 };
  } else {
    const half = g / 2;
    const cgst = Math.round(taxable * half / 100 * 100) / 100;
    const sgst = Math.round(taxable * half / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: half, sgst_rate: half, igst_rate: 0,
      cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0,
      total_amount: Math.round((taxable + cgst + sgst) * 100) / 100 };
  }
};
const computeTotals = (items, isInter, discAmt = 0, shipping = 0, other = 0) => {
  const comp = items.map(it => computeItem(it, isInter));
  const subtotal = comp.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totDisc = comp.reduce((s, i) => s + i.unit_price * i.quantity * i.discount_pct / 100, 0) + discAmt;
  const totTax = comp.reduce((s, i) => s + i.taxable_value, 0);
  const totCGST = comp.reduce((s, i) => s + i.cgst_amount, 0);
  const totSGST = comp.reduce((s, i) => s + i.sgst_amount, 0);
  const totIGST = comp.reduce((s, i) => s + i.igst_amount, 0);
  const totGST = Math.round((totCGST + totSGST + totIGST) * 100) / 100;
  const grand = Math.round((totTax + totGST + shipping + other - discAmt) * 100) / 100;
  return {
    items: comp,
    subtotal: Math.round(subtotal * 100) / 100,
    total_discount: Math.round(totDisc * 100) / 100,
    total_taxable: Math.round(totTax * 100) / 100,
    total_cgst: Math.round(totCGST * 100) / 100,
    total_sgst: Math.round(totSGST * 100) / 100,
    total_igst: Math.round(totIGST * 100) / 100,
    total_gst: totGST,
    grand_total: grand,
  };
};
const AVATAR_GRADS = [
  ['#0D3B66','#1F6FB2'],['#065f46','#059669'],['#7c2d12','#ea580c'],
  ['#4c1d95','#7c3aed'],['#831843','#db2777'],['#134e4a','#0d9488'],
];
const avatarGrad = (name = '') => {
  const i = (name.charCodeAt(0) || 0) % AVATAR_GRADS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADS[i][0]}, ${AVATAR_GRADS[i][1]})`;
};
const Hl = ({ text = '', query = '' }) => {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-bold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// CLIENT SEARCH COMBOBOX
// ════════════════════════════════════════════════════════════════════════════════
const ClientSearchCombobox = ({ clients = [], value, onSelect, onAddNew, isDark }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const selected = clients.find(c => c.id === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter(c =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.client_gstin || '').toLowerCase().includes(q)
    ).slice(0, 40);
  }, [clients, query]);
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery(''); setFocused(-1);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    if (focused >= 0 && listRef.current) {
      listRef.current.querySelector(`[data-idx="${focused}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);
  const openDrop = () => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 20); };
  const pick = (client) => { onSelect(client); setOpen(false); setQuery(''); setFocused(-1); };
  const clear = (e) => { e.stopPropagation(); onSelect(null); };
  const onKeyDown = (e) => {
    if (!open) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrop(); } return; }
    const total = filtered.length + 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, -1)); }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setFocused(-1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused === filtered.length) { setOpen(false); onAddNew?.(); return; }
      if (focused >= 0 && filtered[focused]) pick(filtered[focused]);
    }
  };
  const inputCls = `w-full flex items-center gap-2.5 h-11 px-3 rounded-xl border text-sm transition-all outline-none
    ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}
    ${open ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'hover:border-blue-300'}`;
  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button type="button" onClick={open ? () => { setOpen(false); setQuery(''); } : openDrop}
        className={inputCls} aria-haspopup="listbox" aria-expanded={open}>
        {selected ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: avatarGrad(selected.company_name) }}>
              {selected.company_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-sm font-semibold truncate leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {selected.company_name}
              </p>
              <p className={`text-[10px] truncate leading-tight ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                {selected.phone || selected.email || 'No contact info'}
              </p>
            </div>
          </div>
        ) : (
          <span className={`flex-1 text-left text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
            — Search or select client —
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <span onClick={clear} role="button" tabIndex={-1}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-500 text-slate-300 transition-colors">
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className={`absolute z-50 w-full mt-1.5 rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
          style={{ maxHeight: 340 }}>
          <div className={`flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100'}`}>
            <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setFocused(-1); }}
              placeholder="Type name, GSTIN, phone or email…"
              className={`flex-1 text-sm outline-none placeholder:text-slate-400 bg-transparent ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
              autoComplete="off" />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setFocused(-1); inputRef.current?.focus(); }}
                className="text-slate-300 hover:text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {filtered.length === 0 && query ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Search className="h-5 w-5 mb-2 opacity-30" />
                <p className="text-xs font-medium">No matches for "{query}"</p>
              </div>
            ) : filtered.map((c, i) => {
              const isActive = i === focused;
              const isSelected = c.id === value;
              return (
                <div key={c.id} data-idx={i} role="option" aria-selected={isSelected}
                  onClick={() => pick(c)} onMouseEnter={() => setFocused(i)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b last:border-0 transition-colors
                    ${isDark ? 'border-slate-700' : 'border-slate-50'}
                    ${isActive ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50')}
                    ${isSelected ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/60') : ''}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                    style={{ background: avatarGrad(c.company_name) }}>
                    {c.company_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                        <Hl text={c.company_name || ''} query={query} />
                      </p>
                      {isSelected && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">
                          ✓ Selected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.phone && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Phone className="h-2.5 w-2.5" /><Hl text={c.phone} query={query} />
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 max-w-[180px] truncate">
                          <Mail className="h-2.5 w-2.5 flex-shrink-0" /><Hl text={c.email} query={query} />
                        </span>
                      )}
                      {c.client_gstin && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          <Hl text={c.client_gstin} query={query} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={`flex-shrink-0 border-t ${isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-100 bg-slate-50/60'}`}>
            <button type="button" data-idx={filtered.length}
              onMouseEnter={() => setFocused(filtered.length)}
              onClick={() => { setOpen(false); onAddNew?.(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left
                ${focused === filtered.length ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-blue-50/60')}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Plus className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Add New Client</p>
                <p className="text-[10px] text-slate-400">Opens client form in a new tab</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// GST REPORTS MODAL
// ════════════════════════════════════════════════════════════════════════════════
const GSTReportsModal = ({ open, onClose, invoices = [], isDark }) => {
  const [tab, setTab] = useState('gstr1');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const monthInvoices = useMemo(() =>
    invoices.filter(inv =>
      inv.invoice_date?.startsWith(month) &&
      ['tax_invoice','credit_note','debit_note'].includes(inv.invoice_type) &&
      inv.status !== 'cancelled'
    ), [invoices, month]);
  const gstr1 = useMemo(() => {
    const b2b = []; const b2cL = []; const b2cS = []; const cdnr = []; const hsnMap = {};
    for (const inv of monthInvoices) {
      const hasGstin = !!(inv.client_gstin?.trim());
      const isCDN = inv.invoice_type === 'credit_note' || inv.invoice_type === 'debit_note';
      const grandTotal = inv.grand_total || 0;
      if (isCDN && hasGstin) cdnr.push(inv);
      else if (hasGstin) b2b.push(inv);
      else if (grandTotal > 250000) b2cL.push(inv);
      else b2cS.push(inv);
      for (const item of inv.items || []) {
        const hsn = item.hsn_sac || 'UNKNOWN';
        if (!hsnMap[hsn]) hsnMap[hsn] = { hsn_sac: hsn, description: item.description || '', quantity: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total_tax: 0 };
        hsnMap[hsn].quantity += item.quantity || 0;
        hsnMap[hsn].taxable += item.taxable_value || 0;
        hsnMap[hsn].igst += item.igst_amount || 0;
        hsnMap[hsn].cgst += item.cgst_amount || 0;
        hsnMap[hsn].sgst += item.sgst_amount || 0;
        hsnMap[hsn].total_tax += (item.igst_amount || 0) + (item.cgst_amount || 0) + (item.sgst_amount || 0);
      }
    }
    const b2cSTotal = b2cS.reduce((acc, inv) => ({
      taxable: acc.taxable + (inv.total_taxable || 0), igst: acc.igst + (inv.total_igst || 0),
      cgst: acc.cgst + (inv.total_cgst || 0), sgst: acc.sgst + (inv.total_sgst || 0),
    }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    return { b2b, b2cL, b2cS, b2cSTotal, cdnr, hsnSummary: Object.values(hsnMap) };
  }, [monthInvoices]);
  const gstr3b = useMemo(() => {
    const outward = monthInvoices.reduce((acc, inv) => {
      if (inv.invoice_type !== 'tax_invoice') return acc;
      return { taxable: acc.taxable + (inv.total_taxable || 0), igst: acc.igst + (inv.total_igst || 0), cgst: acc.cgst + (inv.total_cgst || 0), sgst: acc.sgst + (inv.total_sgst || 0), cess: 0 };
    }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const credits = monthInvoices.filter(i => i.invoice_type === 'credit_note').reduce((acc, inv) => ({
      taxable: acc.taxable + (inv.total_taxable || 0), igst: acc.igst + (inv.total_igst || 0), cgst: acc.cgst + (inv.total_cgst || 0), sgst: acc.sgst + (inv.total_sgst || 0),
    }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    const netIGST = outward.igst - credits.igst;
    const netCGST = outward.cgst - credits.cgst;
    const netSGST = outward.sgst - credits.sgst;
    return { outward, credits, netIGST, netCGST, netSGST, netTotal: netIGST + netCGST + netSGST };
  }, [monthInvoices]);
  const exportGSTR1 = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const [yr, mo] = month.split('-');
    const periodLabel = format(new Date(parseInt(yr), parseInt(mo) - 1, 1), 'MMM-yyyy');
    if (gstr1.b2b.length) {
      const rows = [['GSTR-1 B2B Invoices'], [`Period: ${periodLabel}`], [],
        ['GSTIN/UIN of Recipient','Receiver Name','Invoice No.','Invoice Date','Invoice Value (₹)','Place of Supply','Reverse Charge','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST/UTGST (₹)','Cess (₹)'],
        ...gstr1.b2b.map(inv => [inv.client_gstin||'',inv.client_name||'',inv.invoice_no||'',inv.invoice_date||'',inv.grand_total||0,inv.client_state||'','N',inv.total_taxable||0,inv.total_igst||0,inv.total_cgst||0,inv.total_sgst||0,0]),
        [],['TOTALS','','','',gstr1.b2b.reduce((s,i)=>s+(i.grand_total||0),0),'','',gstr1.b2b.reduce((s,i)=>s+(i.total_taxable||0),0),gstr1.b2b.reduce((s,i)=>s+(i.total_igst||0),0),gstr1.b2b.reduce((s,i)=>s+(i.total_cgst||0),0),gstr1.b2b.reduce((s,i)=>s+(i.total_sgst||0),0),0],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'B2B');
    }
    if (gstr1.b2cL.length) {
      const rows = [['GSTR-1 B2C Large (>₹2.5L)'], [`Period: ${periodLabel}`], [],
        ['Type','Place of Supply','Applicable % of Tax Rate','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST/UTGST (₹)','Cess (₹)','Client Name','Invoice No','Invoice Date','Invoice Value'],
        ...gstr1.b2cL.map(inv => ['OE',inv.client_state||'','',inv.total_taxable||0,inv.total_igst||0,inv.total_cgst||0,inv.total_sgst||0,0,inv.client_name||'',inv.invoice_no||'',inv.invoice_date||'',inv.grand_total||0]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'B2CL');
    }
    {
      const rows = [['GSTR-1 B2C Small (≤₹2.5L) — Aggregate'], [`Period: ${periodLabel}`], [],
        ['Type','Place of Supply','Supply Type','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST/UTGST (₹)','Cess (₹)'],
        ['OE','Aggregate','Intra/Inter',gstr1.b2cSTotal.taxable,gstr1.b2cSTotal.igst,gstr1.b2cSTotal.cgst,gstr1.b2cSTotal.sgst,0],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'B2CS');
    }
    if (gstr1.cdnr.length) {
      const rows = [['GSTR-1 Credit/Debit Notes (Registered)'], [`Period: ${periodLabel}`], [],
        ['GSTIN/UIN of Recipient','Receiver Name','Note No.','Note Date','Note Type','Place of Supply','Reverse Charge','Note Supply Type','Note Value (₹)','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST (₹)','Cess (₹)'],
        ...gstr1.cdnr.map(inv => [inv.client_gstin||'',inv.client_name||'',inv.invoice_no||'',inv.invoice_date||'',inv.invoice_type==='credit_note'?'C':'D',inv.client_state||'','N','Regular',inv.grand_total||0,inv.total_taxable||0,inv.total_igst||0,inv.total_cgst||0,inv.total_sgst||0,0]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'CDNR');
    }
    if (gstr1.hsnSummary.length) {
      const rows = [['GSTR-1 HSN/SAC Summary'], [`Period: ${periodLabel}`], [],
        ['HSN/SAC','Description','UQC','Total Quantity','Total Value (₹)','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST/UTGST (₹)','Cess (₹)'],
        ...gstr1.hsnSummary.map(h => [h.hsn_sac,h.description,'NOS',Math.round(h.quantity*100)/100,Math.round((h.taxable+h.total_tax)*100)/100,Math.round(h.taxable*100)/100,Math.round(h.igst*100)/100,Math.round(h.cgst*100)/100,Math.round(h.sgst*100)/100,0]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'HSN');
    }
    XLSX.writeFile(wb, `GSTR1_${periodLabel}.xlsx`);
    toast.success(`GSTR-1 exported for ${periodLabel}`);
  }, [gstr1, month]);
  const exportGSTR3B = useCallback(() => {
    const [yr, mo] = month.split('-');
    const periodLabel = format(new Date(parseInt(yr), parseInt(mo) - 1, 1), 'MMM-yyyy');
    const rows = [
      [`GSTR-3B Return — ${periodLabel}`], [],
      ['3.1 DETAILS OF OUTWARD SUPPLIES AND INWARD SUPPLIES LIABLE TO REVERSE CHARGE'], [],
      ['Nature of Supplies','Total Taxable Value (₹)','Integrated Tax (₹)','Central Tax (₹)','State/UT Tax (₹)','Cess (₹)'],
      ['(a) Outward taxable supplies (other than zero rated, nil and exempted)',fmt(gstr3b.outward.taxable),fmt(gstr3b.outward.igst),fmt(gstr3b.outward.cgst),fmt(gstr3b.outward.sgst),'0.00'],
      ['(b) Outward taxable supplies (zero rated)','0.00','0.00','0.00','0.00','0.00'],
      ['(c) Other outward supplies (Nil rated, exempted)','0.00','0.00','0.00','0.00','0.00'],
      ['(d) Inward supplies (liable to reverse charge)','0.00','0.00','0.00','0.00','0.00'],
      ['(e) Non-GST outward supplies','0.00','','','',''], [],
      ['NET TAX PAYABLE',fmt(gstr3b.netTotal),'','','',fmt(gstr3b.netTotal)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B');
    XLSX.writeFile(wb, `GSTR3B_${periodLabel}.xlsx`);
    toast.success(`GSTR-3B exported for ${periodLabel}`);
  }, [gstr3b, month]);
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const rowCls = (isDark ? 'border-slate-700' : 'border-slate-100') + ' border-b last:border-0';
  const cellCls = `px-4 py-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
  const numCls = `px-4 py-3 text-sm font-semibold text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`;
  const thCls = `px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400 bg-slate-700/50' : 'text-slate-400 bg-slate-50'}`;
  const TABS = [
    { id: 'gstr1', label: 'GSTR-1', sub: 'Outward Supplies', icon: FileSpreadsheet },
    { id: 'gstr3b', label: 'GSTR-3B', sub: 'Summary Return', icon: BarChart3 },
    { id: 'gstr2b', label: 'GSTR-2B', sub: 'ITC Statement', icon: ArrowRightLeft },
  ];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 [&>button.absolute]:hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">GST Returns</DialogTitle>
        <DialogDescription className="sr-only">Generate GSTR-1, GSTR-3B, GSTR-2B reports</DialogDescription>
        <div className="px-7 py-5 relative overflow-hidden flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)' }}>
          <div className="absolute right-0 top-0 w-52 h-52 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">GST Returns</h2>
                <p className="text-emerald-200 text-xs mt-0.5">Generate & export GSTR-1 · GSTR-3B · GSTR-2B</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] text-white/50 uppercase tracking-widest mb-1">Return Period</p>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="h-9 px-3 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-semibold outline-none focus:bg-white/25 transition-colors" />
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
          <div className="relative mt-5 flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all
                  ${tab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                <t.icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
                <span className={`text-[9px] ${tab === t.id ? 'text-emerald-600' : 'text-white/40'}`}>{t.sub}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${monthInvoices.length > 0 ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'}`}>
                {monthInvoices.length} invoice{monthInvoices.length !== 1 ? 's' : ''} this period
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === 'gstr1' && (
            <div className="p-6 space-y-5">
              {monthInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <FileSpreadsheet className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No invoices for this period</p>
                  <p className="text-xs mt-1">Change the month selector above</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'B2B Invoices', val: gstr1.b2b.length, sub: fmtC(gstr1.b2b.reduce((s,i)=>s+(i.grand_total||0),0)), color: COLORS.mediumBlue },
                      { label: 'B2C Large', val: gstr1.b2cL.length, sub: fmtC(gstr1.b2cL.reduce((s,i)=>s+(i.grand_total||0),0)), color: COLORS.amber },
                      { label: 'B2C Small', val: gstr1.b2cS.length, sub: fmtC(gstr1.b2cSTotal.taxable), color: COLORS.teal },
                      { label: 'Credit / Debit', val: gstr1.cdnr.length, sub: 'Registered parties', color: COLORS.purple },
                    ].map(c => (
                      <div key={c.label} className={`rounded-xl border p-4 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-2xl font-black" style={{ color: c.color }}>{c.val}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                      </div>
                    ))}
                  </div>
                  {gstr1.b2b.length > 0 && (
                    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                      <div className={`px-5 py-3 border-b flex items-center justify-between ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <p className={labelCls}>B2B — Registered Recipients ({gstr1.b2b.length})</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr>{['GSTIN','Client','Invoice No','Date','Value','Taxable','IGST','CGST','SGST'].map(h => (<th key={h} className={thCls}>{h}</th>))}</tr></thead>
                          <tbody>
                            {gstr1.b2b.map(inv => (
                              <tr key={inv.id} className={rowCls}>
                                <td className={`${cellCls} font-mono text-xs`}>{inv.client_gstin}</td>
                                <td className={cellCls}>{inv.client_name}</td>
                                <td className={`${cellCls} font-mono font-bold text-blue-600 dark:text-blue-400`}>{inv.invoice_no}</td>
                                <td className={cellCls}>{inv.invoice_date}</td>
                                <td className={numCls}>{fmtC(inv.grand_total)}</td>
                                <td className={numCls}>{fmtC(inv.total_taxable)}</td>
                                <td className={numCls}>{fmtC(inv.total_igst)}</td>
                                <td className={numCls}>{fmtC(inv.total_cgst)}</td>
                                <td className={numCls}>{fmtC(inv.total_sgst)}</td>
                              </tr>
                            ))}
                            <tr className={`font-bold border-t-2 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-slate-50'}`}>
                              <td colSpan={4} className={`${cellCls} font-bold`}>TOTAL</td>
                              <td className={numCls}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.grand_total||0),0))}</td>
                              <td className={numCls}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_taxable||0),0))}</td>
                              <td className={numCls}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_igst||0),0))}</td>
                              <td className={numCls}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_cgst||0),0))}</td>
                              <td className={numCls}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_sgst||0),0))}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {gstr1.hsnSummary.length > 0 && (
                    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                      <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <p className={labelCls}>HSN / SAC Summary ({gstr1.hsnSummary.length} codes)</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr>{['HSN/SAC','Description','Qty','Taxable Value','IGST','CGST','SGST','Total Tax'].map(h => (<th key={h} className={thCls}>{h}</th>))}</tr></thead>
                          <tbody>
                            {gstr1.hsnSummary.map(h => (
                              <tr key={h.hsn_sac} className={rowCls}>
                                <td className={`${cellCls} font-mono font-bold`}>{h.hsn_sac}</td>
                                <td className={`${cellCls} max-w-[160px] truncate`}>{h.description}</td>
                                <td className={numCls}>{Math.round(h.quantity * 100) / 100}</td>
                                <td className={numCls}>{fmtC(h.taxable)}</td>
                                <td className={numCls}>{fmtC(h.igst)}</td>
                                <td className={numCls}>{fmtC(h.cgst)}</td>
                                <td className={numCls}>{fmtC(h.sgst)}</td>
                                <td className={`${numCls} font-bold`} style={{ color: COLORS.mediumBlue }}>{fmtC(h.total_tax)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {tab === 'gstr3b' && (
            <div className="p-6 space-y-5">
              {monthInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No data for this period</p>
                </div>
              ) : (
                <>
                  <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className={`px-5 py-3.5 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-emerald-50 border-emerald-100'}`}>
                      <p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>3.1 — Outward Supplies</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr>{['Nature of Supplies','Taxable Value','IGST','CGST','SGST/UTGST','Cess'].map(h => (<th key={h} className={thCls}>{h}</th>))}</tr></thead>
                      <tbody>
                        {[['(a) Outward taxable supplies',gstr3b.outward.taxable,gstr3b.outward.igst,gstr3b.outward.cgst,gstr3b.outward.sgst,0],['(b) Zero rated',0,0,0,0,0],['(c) Nil / Exempt',0,0,0,0,0]].map(([label,...vals])=>(
                          <tr key={label} className={rowCls}><td className={cellCls}>{label}</td>{vals.map((v,i)=>(<td key={i} className={numCls}>{fmtC(v)}</td>))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Taxable Value', val: gstr3b.outward.taxable, color: COLORS.deepBlue },
                      { label: 'IGST Payable', val: gstr3b.netIGST, color: COLORS.mediumBlue },
                      { label: 'CGST Payable', val: gstr3b.netCGST, color: COLORS.teal },
                      { label: 'SGST Payable', val: gstr3b.netSGST, color: COLORS.purple },
                    ].map(c => (
                      <div key={c.label} className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.label}</p>
                        <p className="text-xl font-black" style={{ color: c.color }}>{fmtC(c.val)}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`rounded-2xl p-5 border ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDark ? 'text-slate-400' : 'text-emerald-600'}`}>Net Tax Payable in Cash Ledger</p>
                    <p className={`text-3xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>{fmtC(gstr3b.netTotal)}</p>
                    <p className="text-xs text-slate-500 mt-1">IGST {fmtC(gstr3b.netIGST)} + CGST {fmtC(gstr3b.netCGST)} + SGST {fmtC(gstr3b.netSGST)}</p>
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'gstr2b' && (
            <div className="p-6 flex flex-col items-center justify-center py-16 gap-5 text-center">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-blue-50'}`}>
                <ArrowRightLeft className="h-8 w-8 text-blue-500" />
              </div>
              <div>
                <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>GSTR-2B — Auto-Drafted ITC Statement</p>
                <p className="text-sm text-slate-400 mt-2 max-w-md">GSTR-2B is auto-generated by the GST portal based on your suppliers' filings. It cannot be filed or edited manually.</p>
              </div>
              <Button onClick={() => window.open('https://gst.gov.in', '_blank')}
                className="h-10 px-6 rounded-xl text-white font-semibold gap-2"
                style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                <ArrowUpRight className="h-4 w-4" /> Open GST Portal
              </Button>
            </div>
          )}
        </div>
        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <p className="text-xs text-slate-400">
              Based on <span className="font-semibold">{monthInvoices.length}</span> invoices · Period: <span className="font-semibold">{format(new Date(month + '-01'), 'MMMM yyyy')}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-sm rounded-xl text-slate-500">Close</Button>
            {tab === 'gstr1' && (
              <Button onClick={exportGSTR1} disabled={monthInvoices.length === 0}
                className="h-9 px-5 text-sm rounded-xl text-white font-semibold gap-2"
                style={{ background: monthInvoices.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                <Download className="h-4 w-4" /> Export GSTR-1 (.xlsx)
              </Button>
            )}
            {tab === 'gstr3b' && (
              <Button onClick={exportGSTR3B} disabled={monthInvoices.length === 0}
                className="h-9 px-5 text-sm rounded-xl text-white font-semibold gap-2"
                style={{ background: monthInvoices.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                <Download className="h-4 w-4" /> Export GSTR-3B (.xlsx)
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// EXCEL IMPORT — parse Excel/CSV invoice template
// ════════════════════════════════════════════════════════════════════════════════
function parseExcelInvoices(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        // Map Excel columns → invoice format
        const invoices = rows
          .filter(row => row['Client Name'] || row['client_name'])
          .map(row => {
            const clientName = row['Client Name'] || row['client_name'] || '';
            const desc = row['Description'] || row['description'] || row['Item Description'] || 'Service';
            const qty = parseFloat(row['Quantity'] || row['quantity'] || row['Qty'] || 1) || 1;
            const rate = parseFloat(row['Rate'] || row['rate'] || row['Unit Price'] || row['unit_price'] || 0) || 0;
            const gstRate = parseFloat(row['GST Rate'] || row['gst_rate'] || row['GST%'] || 18) || 18;
            const taxable = qty * rate;
            const half = gstRate / 2;
            const cgst = Math.round(taxable * half / 100 * 100) / 100;
            const sgst = Math.round(taxable * half / 100 * 100) / 100;
            return {
              invoice_type: 'tax_invoice',
              client_name: clientName,
              client_email: row['Email'] || row['client_email'] || '',
              client_phone: row['Phone'] || row['client_phone'] || '',
              client_gstin: row['GSTIN'] || row['client_gstin'] || '',
              client_address: row['Address'] || row['client_address'] || '',
              client_state: row['State'] || row['client_state'] || '',
              invoice_date: row['Invoice Date'] || row['invoice_date'] || format(new Date(), 'yyyy-MM-dd'),
              due_date: row['Due Date'] || row['due_date'] || format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
              reference_no: row['Reference No'] || row['reference_no'] || '',
              notes: row['Notes'] || row['notes'] || '',
              is_interstate: false,
              items: [{
                description: desc,
                hsn_sac: row['HSN/SAC'] || row['hsn_sac'] || '',
                quantity: qty,
                unit: row['Unit'] || row['unit'] || 'service',
                unit_price: rate,
                discount_pct: parseFloat(row['Discount%'] || row['discount_pct'] || 0) || 0,
                gst_rate: gstRate,
                taxable_value: taxable,
                cgst_rate: half, sgst_rate: half, igst_rate: 0,
                cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0,
                total_amount: Math.round((taxable + cgst + sgst) * 100) / 100,
              }],
              subtotal: taxable,
              total_taxable: taxable,
              total_cgst: cgst,
              total_sgst: sgst,
              total_igst: 0,
              total_gst: cgst + sgst,
              grand_total: Math.round((taxable + cgst + sgst) * 100) / 100,
              amount_paid: 0,
              amount_due: Math.round((taxable + cgst + sgst) * 100) / 100,
              status: 'draft',
              payment_terms: 'Due on receipt',
            };
          });
        resolve(invoices);
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Download ready-made Excel template
function downloadInvoiceTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = [
    'Client Name', 'Email', 'Phone', 'GSTIN', 'Address', 'State',
    'Invoice Date', 'Due Date', 'Reference No',
    'Description', 'HSN/SAC', 'Quantity', 'Unit', 'Rate', 'Discount%', 'GST Rate',
    'Notes',
  ];
  const sampleRows = [
    ['Acme Corp Pvt Ltd', 'billing@acme.com', '9876543210', '24AAAAA0000A1Z5', '123 Main Street, Surat', 'Gujarat',
      format(new Date(), 'yyyy-MM-dd'), format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), 'PO-2025-001',
      'Website Development Services', '998314', '1', 'service', '50000', '0', '18',
      'Net 30 payment terms'],
    ['Global Traders', 'accounts@globaltraders.in', '9123456780', '', '456 Ring Road, Ahmedabad', 'Gujarat',
      format(new Date(), 'yyyy-MM-dd'), format(new Date(Date.now() + 15 * 86400000), 'yyyy-MM-dd'), '',
      'Annual Maintenance Contract', '998313', '12', 'month', '5000', '0', '18',
      ''],
    ['Tech Solutions Ltd', 'finance@techsol.com', '8899001122', '27BBBBB0000B1Z3', 'Mumbai, Maharashtra', 'Maharashtra',
      format(new Date(), 'yyyy-MM-dd'), format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'), 'REF-001',
      'Cloud Hosting Services', '998315', '3', 'month', '15000', '5', '18',
      'Hosting for Q1 2025'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
  // Column widths
  ws['!cols'] = headers.map((h, i) => ({ wch: [25,28,14,20,35,14,14,14,14,35,10,10,10,12,10,10,35][i] || 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  // Instructions sheet
  const instrWs = XLSX.utils.aoa_to_sheet([
    ['INVOICE IMPORT TEMPLATE — INSTRUCTIONS'],
    [],
    ['Column', 'Required', 'Format / Example', 'Notes'],
    ['Client Name', 'YES', 'Acme Corp Pvt Ltd', 'Full legal name of the client'],
    ['Email', 'No', 'billing@client.com', 'Used for email invoices'],
    ['Phone', 'No', '9876543210', '10-digit mobile number'],
    ['GSTIN', 'No', '24AAAAA0000A1Z5', '15-character GST number'],
    ['Address', 'No', '123 Main Street, Surat', 'Full billing address'],
    ['State', 'No', 'Gujarat', 'State name for GST calculation'],
    ['Invoice Date', 'No', 'YYYY-MM-DD (2025-01-15)', 'Defaults to today if blank'],
    ['Due Date', 'No', 'YYYY-MM-DD (2025-02-15)', 'Defaults to +30 days if blank'],
    ['Reference No', 'No', 'PO-2025-001', 'Purchase order or reference number'],
    ['Description', 'YES', 'Website Development Services', 'Item/service description'],
    ['HSN/SAC', 'No', '998314', '6-digit HSN or SAC code'],
    ['Quantity', 'No', '1 or 12.5', 'Numeric value, defaults to 1'],
    ['Unit', 'No', 'service / nos / hr / kg', 'Unit of measurement'],
    ['Rate', 'YES', '50000', 'Price per unit in ₹'],
    ['Discount%', 'No', '0 or 5', 'Discount percentage (0-100)'],
    ['GST Rate', 'No', '0 / 5 / 12 / 18 / 28', 'GST % — defaults to 18 if blank'],
    ['Notes', 'No', 'Payment terms, remarks', 'Any additional notes'],
    [],
    ['TIPS:'],
    ['• One row = One invoice with one line item'],
    ['• For multiple items per invoice, create duplicate rows with same Client Name'],
    ['• GSTIN format: 2-digit state code + 10-char PAN + 1-char entity + Z + 1-char checksum'],
    ['• Dates must be in YYYY-MM-DD format'],
    ['• Supported GST rates: 0, 5, 12, 18, 28'],
    ['• Delete sample rows before importing, keep the header row'],
  ]);
  instrWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, instrWs, 'Instructions');
  XLSX.writeFile(wb, 'Invoice_Import_Template.xlsx');
  toast.success('Template downloaded! Fill it and import back.');
}

// ════════════════════════════════════════════════════════════════════════════════
// UNIFIED IMPORT MODAL — .vyp KhataBook + Excel/CSV
// ════════════════════════════════════════════════════════════════════════════════
const KB_PAY_STATUS = { 1: 'sent', 2: 'partially_paid', 3: 'paid' };

const ImportModal = ({ open, onClose, isDark, companies, onImportComplete }) => {
  const [step, setStep] = useState('choose'); // choose | upload | preview | importing | done
  const [importMode, setImportMode] = useState(''); // 'vyp' | 'excel'
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ imported: 0, clients: 0, skipped: 0, errors: [] });
  const [selectedFirm, setSelectedFirm] = useState('__none__');
  const [importClients, setImportClients] = useState(true);
  const [importInvoices, setImportInvoices] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState('__none__');
  const dropRef = useRef(null);

  const reset = () => {
    setStep('choose'); setImportMode(''); setFile(null); setParsed(null);
    setError(''); setLoading(false); setProgress(0);
    setResults({ imported: 0, clients: 0, skipped: 0, errors: [] });
    setSelectedFirm('__none__'); setSelectedCompanyId('__none__');
  };
  const handleClose = () => { reset(); onClose(); };

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    if (importMode === 'vyp' && !name.endsWith('.vyp') && !name.endsWith('.db')) {
      setError('Please upload a KhataBook .vyp backup file'); return;
    }
    if (importMode === 'excel' && !name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setError('Please upload an Excel (.xlsx/.xls) or CSV file'); return;
    }
    setFile(f); setError('');
  }, [importMode]);

  // ── VYP Parse via server-side API ──────────────────────────────────────────
  const parseVypViaAPI = async (f) => {
    const formData = new FormData();
    formData.append('file', f);
    try {
      const resp = await api.post('/invoices/parse-vyp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return resp.data;
    } catch (err) {
      throw new Error(err.response?.data?.detail || 'Server could not parse .vyp file');
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      if (importMode === 'vyp') {
        const data = await parseVypViaAPI(file);
        setParsed({ ...data, mode: 'vyp' });
        if (data.firms?.length > 0) setSelectedFirm(String(data.firms[0].firm_id));
      } else {
        const invoices = await parseExcelInvoices(file);
        if (!invoices.length) throw new Error('No valid invoice rows found. Check the template format.');
        setParsed({ invoices, firms: [], clients: [], mode: 'excel' });
      }
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setStep('importing'); setProgress(0);
    const res = { imported: 0, clients: 0, skipped: 0, errors: [] };
    const companyId = selectedCompanyId === '__none__' ? '' : selectedCompanyId;

    // Import clients (VYP only)
    if (parsed.mode === 'vyp' && importClients && parsed.clients?.length > 0) {
      const clientsToImport = parsed.clients.slice(0, 500);
      let done = 0;
      for (const c of clientsToImport) {
        try {
          await api.post('/clients', {
            company_name: c.full_name || 'Unknown',
            email: c.email || null,
            phone: c.phone_number || null,
            address: c.address || '',
            notes: `Imported from KhataBook. GSTIN: ${c.name_gstin_number || 'N/A'}`,
            client_type: 'other', status: 'active', assigned_to: null,
          });
          res.clients++;
        } catch { res.skipped++; }
        done++;
        setProgress(Math.round((done / clientsToImport.length) * 40));
      }
    }

    // Import invoices
    const invToImport = parsed.mode === 'excel'
      ? parsed.invoices
      : (selectedFirm === '__none__' ? parsed.invoices : parsed.invoices.filter(i => String(i.company_id) === selectedFirm));

    let done = 0;
    for (const inv of (invToImport || [])) {
      try {
        const payload = {
          ...inv,
          company_id: companyId,
          invoice_type: 'tax_invoice',
          items: inv.items?.length > 0 ? inv.items : [{ ...emptyItem(), description: 'Imported service', unit_price: inv.grand_total || 0 }],
        };
        delete payload._kb_id;
        await api.post('/invoices', payload);
        res.imported++;
      } catch { res.skipped++; }
      done++;
      const base = parsed.mode === 'vyp' && importClients ? 40 : 0;
      setProgress(base + Math.round((done / (invToImport?.length || 1)) * (100 - base)));
    }

    setProgress(100); setResults(res); setStep('done');
    onImportComplete?.();
  };

  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`w-full max-w-xl rounded-2xl border shadow-2xl p-0 overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
        style={{ maxHeight: '90vh' }}>
        <DialogTitle className="sr-only">Import Invoices</DialogTitle>
        <DialogDescription className="sr-only">Import invoices from KhataBook .vyp or Excel file</DialogDescription>

        {/* ── Header ── */}
        <div className="px-6 py-5 relative overflow-hidden flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
          <div className="absolute right-0 top-0 w-40 h-40 rounded-full -mr-12 -mt-12 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">Import Invoices</h2>
                <p className="text-emerald-200 text-xs mt-0.5">KhataBook .vyp · Excel · CSV</p>
              </div>
            </div>
            <button onClick={handleClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all flex-shrink-0">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          {/* Step indicator */}
          {step !== 'choose' && (
            <div className="relative mt-4 flex items-center gap-1">
              {['upload', 'preview', 'importing', 'done'].map((s, i) => {
                const stepKeys = ['upload', 'preview', 'importing', 'done'];
                const current = stepKeys.indexOf(step);
                const isActive = i === current;
                const isDoneStep = i < current;
                return (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${isActive ? 'bg-white text-emerald-700' : isDoneStep ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'}`}>
                      {isDoneStep ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 h-3 flex items-center justify-center">{i + 1}</span>}
                      {['Upload', 'Preview', 'Import', 'Done'][i]}
                    </div>
                    {i < 3 && <div className={`flex-1 h-px ${isDoneStep ? 'bg-white/60' : 'bg-white/20'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* CHOOSE MODE */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className={`text-sm font-medium text-center mb-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Choose your import source
              </p>
              {/* Download Template */}
              <div className={`rounded-xl border-2 border-dashed p-4 ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <FileDown className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      Download Excel Template
                    </p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Get a ready-made template with sample data & instructions
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={downloadInvoiceTemplate}
                    className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 flex-shrink-0 text-white"
                    style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
              {/* Mode Cards */}
              <div className="grid grid-cols-1 gap-3">
                {[
                  {
                    mode: 'vyp',
                    icon: Database,
                    title: 'KhataBook Backup (.vyp)',
                    desc: 'Import clients & invoices from KhataBook .vyp backup file',
                    color: 'from-emerald-600 to-emerald-700',
                    badge: 'Recommended',
                  },
                  {
                    mode: 'excel',
                    icon: Table,
                    title: 'Excel / CSV File (.xlsx, .csv)',
                    desc: 'Import invoices from our template or your own spreadsheet',
                    color: 'from-blue-600 to-blue-700',
                    badge: 'Template available',
                  },
                ].map(opt => (
                  <button key={opt.mode} type="button"
                    onClick={() => { setImportMode(opt.mode); setStep('upload'); setError(''); setFile(null); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:shadow-md
                      ${isDark ? 'border-slate-600 hover:border-emerald-500 bg-slate-700/40' : 'border-slate-200 hover:border-emerald-400 bg-white'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br ${opt.color}`}>
                      <opt.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{opt.title}</p>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{opt.badge}</span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{opt.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-4">
              <button type="button" onClick={() => setStep('choose')}
                className={`flex items-center gap-1 text-xs font-semibold ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                ← Back to source selection
              </button>
              {/* Drop zone */}
              <div ref={dropRef} onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                  ${file ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : (isDark ? 'border-slate-600 hover:border-emerald-500 bg-slate-700/40' : 'border-slate-200 hover:border-emerald-400 bg-slate-50')}`}>
                <input type="file"
                  accept={importMode === 'vyp' ? '.vyp,.db' : '.xlsx,.xls,.csv'}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={handleFileDrop} />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                      <Database className="h-7 w-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400 break-all text-sm px-2">{file.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-xs text-red-500 hover:text-red-700">Remove file</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-white'} shadow-sm border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                      <FileUp className="h-7 w-7 text-slate-400" />
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        {importMode === 'vyp' ? 'Drop your .vyp file here' : 'Drop your Excel or CSV file here'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {importMode === 'vyp' ? 'KhataBook .vyp backup files only' : '.xlsx, .xls, .csv files'}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                      <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                      <span>Your data stays private and secure</span>
                    </div>
                  </div>
                )}
              </div>
              {importMode === 'excel' && (
                <div className={`rounded-xl border p-3 flex items-start gap-2.5 ${isDark ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}>
                  <FileDown className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className={`text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Need a template?</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <button type="button" onClick={downloadInvoiceTemplate} className="text-blue-500 underline">Download our Excel template</button> with sample data and instructions
                    </p>
                  </div>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={handleClose} className="flex-1 h-10 rounded-xl">Cancel</Button>
                <Button onClick={handleParse} disabled={!file || loading}
                  className="flex-1 h-10 rounded-xl text-white font-semibold"
                  style={{ background: !file ? '#94a3b8' : 'linear-gradient(135deg, #065f46, #059669)' }}>
                  {loading ? 'Parsing…' : 'Parse File →'}
                </Button>
              </div>
            </div>
          )}

          {/* PREVIEW */}
          {step === 'preview' && parsed && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Firms', val: parsed.firms?.length || 1, icon: Building2, color: COLORS.deepBlue },
                  { label: 'Clients', val: parsed.clients?.length || 0, icon: Users, color: COLORS.emeraldGreen },
                  { label: 'Invoices', val: parsed.invoices?.length || 0, icon: Receipt, color: COLORS.mediumBlue },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-4 border text-center ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <s.icon className="h-5 w-5 mx-auto mb-1" style={{ color: s.color }} />
                    <p className={`text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{s.val}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
              {parsed.mode === 'vyp' && parsed.firms?.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Filter by Firm</label>
                  <Select value={selectedFirm} onValueChange={setSelectedFirm}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">All Firms</SelectItem>
                      {parsed.firms.map(f => <SelectItem key={f.firm_id} value={String(f.firm_id)}>{f.firm_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Map to Company Profile</label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select company…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Skip —</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {parsed.mode === 'vyp' && (
                <div className={`space-y-3 p-4 rounded-xl border ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                  {[
                    { label: 'Import Clients', sub: `${parsed.clients?.length || 0} contacts`, val: importClients, set: setImportClients },
                    { label: 'Import Invoices', sub: `${parsed.invoices?.length || 0} sale transactions`, val: importInvoices, set: setImportInvoices },
                  ].map(opt => (
                    <div key={opt.label} className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{opt.label}</p>
                        <p className="text-xs text-slate-400">{opt.sub}</p>
                      </div>
                      <Switch checked={opt.val} onCheckedChange={opt.set} />
                    </div>
                  ))}
                </div>
              )}
              {parsed.mode === 'excel' && parsed.invoices?.length > 0 && (
                <div className={`rounded-xl border p-3 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-blue-50 border-blue-200'}`}>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Preview (first 3 rows)</p>
                  <div className="space-y-1.5">
                    {parsed.invoices.slice(0, 3).map((inv, i) => (
                      <div key={i} className={`flex items-center justify-between text-xs px-2 py-1.5 rounded-lg ${isDark ? 'bg-slate-700' : 'bg-white'}`}>
                        <span className={`font-medium truncate flex-1 mr-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{inv.client_name}</span>
                        <span className="text-slate-400 text-[10px] flex-shrink-0">{inv.invoice_date}</span>
                        <span className="font-bold text-emerald-600 ml-2 flex-shrink-0">{fmtC(inv.grand_total)}</span>
                      </div>
                    ))}
                    {parsed.invoices.length > 3 && (
                      <p className="text-[10px] text-slate-400 text-center">+ {parsed.invoices.length - 3} more rows</p>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep('upload')} className="h-10 px-5 rounded-xl">← Back</Button>
                <Button onClick={handleImport} className="flex-1 h-10 rounded-xl text-white font-semibold"
                  style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                  Start Import →
                </Button>
              </div>
            </div>
          )}

          {/* IMPORTING */}
          {step === 'importing' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Database className="h-8 w-8 text-emerald-600 animate-pulse" />
              </div>
              <div className="text-center">
                <p className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Importing data…</p>
                <p className="text-slate-400 text-sm mt-1">Please wait, do not close this window</p>
              </div>
              <div className="w-full max-w-sm">
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #065f46, #059669)' }} />
                </div>
                <p className="text-center text-xs text-slate-400 mt-2">{progress}% complete</p>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div className="py-6 flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className={`font-bold text-xl ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Import Complete!</p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[
                  { label: 'Invoices Imported', val: results.imported, color: COLORS.mediumBlue },
                  { label: 'Clients Added', val: results.clients, color: COLORS.emeraldGreen },
                  { label: 'Skipped', val: results.skipped, color: COLORS.coral },
                ].map(r => (
                  <div key={r.label} className={`rounded-xl p-4 text-center border ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-2xl font-black" style={{ color: r.color }}>{r.val}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{r.label}</p>
                  </div>
                ))}
              </div>
              <Button onClick={handleClose} className="w-full h-11 rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STATUS PILL
// ════════════════════════════════════════════════════════════════════════════════
const StatusPill = ({ inv }) => {
  const m = getStatusMeta(inv);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${m.bg} ${m.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STAT CARD
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

// ════════════════════════════════════════════════════════════════════════════════
// MINI REVENUE CHART
// ════════════════════════════════════════════════════════════════════════════════
const RevenueChart = ({ trend = [], isDark }) => {
  if (!trend.length) return null;
  const W = 700, H = 130, pad = { t: 16, b: 28, l: 56, r: 16 };
  const maxVal = Math.max(...trend.map(d => d.revenue), 1);
  const xStep = (W - pad.l - pad.r) / Math.max(trend.length - 1, 1);
  const yScale = (v) => H - pad.b - (v / maxVal) * (H - pad.t - pad.b);
  const pts = trend.map((d, i) => [pad.l + i * xStep, yScale(d.revenue)]);
  const area = `M${pts[0][0]},${H - pad.b} L${pts.map(p => `${p[0]},${p[1]}`).join(' L')} L${pts[pts.length - 1][0]},${H - pad.b} Z`;
  const line = `M${pts.map(p => `${p[0]},${p[1]}`).join(' L')}`;
  const colPts = trend.map((d, i) => [pad.l + i * xStep, yScale(d.collected)]);
  const cline = `M${colPts.map(p => `${p[0]},${p[1]}`).join(' L')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity="0.25" /><stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#rg)" />
      <path d={line} fill="none" stroke={COLORS.mediumBlue} strokeWidth="2" strokeLinecap="round" />
      <path d={cline} fill="none" stroke={COLORS.emeraldGreen} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
      {pts.map(([x, y], i) => (<g key={i}><circle cx={x} cy={y} r="3.5" fill={COLORS.mediumBlue} /><text x={x} y={H - 6} textAnchor="middle" fontSize="9" fill={isDark ? '#64748b' : '#94a3b8'} fontFamily="monospace">{trend[i].label}</text></g>))}
    </svg>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PAYMENT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const PaymentModal = ({ invoice, open, onClose, onSuccess, isDark }) => {
  const [form, setForm] = useState({ amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), payment_mode: 'neft', reference_no: '', notes: '' });
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open && invoice) setForm(p => ({ ...p, amount: invoice.amount_due?.toFixed(2) || '' })); }, [open, invoice]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post('/payments', { invoice_id: invoice.id, amount: parseFloat(form.amount), payment_date: form.payment_date, payment_mode: form.payment_mode, reference_no: form.reference_no, notes: form.notes });
      toast.success('Payment recorded!'); onSuccess?.(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record payment'); }
    finally { setLoading(false); }
  };
  if (!invoice) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Record Payment</DialogTitle>
        <DialogDescription className="sr-only">Record payment</DialogDescription>
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><IndianRupee className="h-5 w-5 text-white" /></div>
            <div><p className="text-white/60 text-[10px] uppercase tracking-widest">Record Payment</p><h2 className="text-white font-bold text-lg">{invoice.invoice_no}</h2></div>
          </div>
          <div className="mt-4 flex gap-4">
            {[['Invoice Total', invoice.grand_total, 'text-white'], ['Paid So Far', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([l, v, cls]) => (
              <div key={l} className="flex-1 bg-white/10 rounded-xl px-3 py-2"><p className="text-white/50 text-[9px] uppercase tracking-wider">{l}</p><p className={`font-bold text-sm ${cls}`}>{fmtC(v)}</p></div>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Amount (₹) *</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span><Input type="number" step="0.01" min="0.01" className="pl-8 h-11 rounded-xl" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required /></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Date *</label><Input type="date" className="h-11 rounded-xl" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} required /></div>
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Mode</label><Select value={form.payment_mode} onValueChange={v => setForm(p => ({ ...p, payment_mode: v }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{PAY_MODES.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Reference / UTR No.</label><Input className="h-11 rounded-xl" placeholder="Transaction / cheque reference" value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} /></div>
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Notes</label><Textarea className="rounded-xl text-sm min-h-[70px] resize-none" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <div className="flex gap-3 pt-2"><Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-11 rounded-xl">Cancel</Button><Button type="submit" disabled={loading} className="flex-1 h-11 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>{loading ? 'Recording…' : '✓ Record Payment'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE FORM
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceForm = ({ open, onClose, editingInv, companies, clients, leads, onSuccess, isDark }) => {
  const navigate = useNavigate();
  const defaultForm = {
    invoice_type: 'tax_invoice', company_id: '', client_id: '', lead_id: '',
    client_name: '', client_address: '', client_email: '', client_phone: '', client_gstin: '', client_state: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
    supply_state: '', is_interstate: false,
    items: [emptyItem()],
    gst_rate: 18, discount_amount: 0, shipping_charges: 0, other_charges: 0,
    payment_terms: 'Due on receipt', notes: '', terms_conditions: '', reference_no: '',
    is_recurring: false, recurrence_pattern: 'monthly', status: 'draft',
  };
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [products, setProducts] = useState([]);
  useEffect(() => { if (open) { if (editingInv) setForm({ ...defaultForm, ...editingInv }); else setForm(defaultForm); setActiveTab('details'); } }, [open, editingInv]);
  useEffect(() => { api.get('/products').then(r => setProducts(r.data || [])).catch(() => {}); }, []);
  const totals = useMemo(() => computeTotals(form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges), [form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges]);
  const setField = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);
  const updateItem = useCallback((idx, k, val) => setForm(p => ({ ...p, items: p.items.map((it, i) => i !== idx ? it : { ...it, [k]: val }) })), []);
  const addItem = useCallback(() => setForm(p => ({ ...p, items: [...p.items, emptyItem()] })), []);
  const removeItem = useCallback((idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) })), []);
  const handleClientSelect = useCallback((client) => {
    if (!client) { setForm(p => ({ ...p, client_id: '', client_name: '', client_email: '', client_phone: '', client_address: '', client_state: '', client_gstin: '' })); return; }
    const addressParts = [client.address, client.city, client.state].filter(Boolean).join(', ');
    setForm(p => ({
      ...p, client_id: client.id, client_name: client.company_name || '',
      client_email: client.email || '', client_phone: client.phone || '',
      client_address: addressParts, client_state: client.state || '',
      client_gstin: client.client_gstin || client.gstin || '',
      is_interstate: p.supply_state ? (p.supply_state.toLowerCase() !== (client.state || '').toLowerCase()) : p.is_interstate,
    }));
    toast.success(`Auto-filled from "${client.company_name}"`, { duration: 1500 });
  }, []);
  const fillFromProduct = useCallback((idx, productId) => {
    if (productId === '__none__') return;
    const prod = products.find(x => x.id === productId);
    if (!prod) return;
    setForm(p => ({ ...p, items: p.items.map((it, i) => i !== idx ? it : { ...it, product_id: productId, description: prod.name, hsn_sac: prod.hsn_sac || '', unit: prod.unit || 'service', unit_price: prod.unit_price || 0, gst_rate: prod.gst_rate || 18 }) }));
  }, [products]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_id) { toast.error('Please select a company profile'); return; }
    if (!form.client_name?.trim()) { toast.error('Client name is required'); return; }
    if (!form.items.some(it => it.description?.trim())) { toast.error('Add at least one item'); return; }
    setLoading(true);
    try {
      const payload = { ...form, ...totals };
      if (editingInv) await api.put(`/invoices/${editingInv.id}`, payload);
      else await api.post('/invoices', payload);
      toast.success(editingInv ? 'Invoice updated!' : 'Invoice created!');
      onSuccess?.(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save invoice'); }
    finally { setLoading(false); }
  };
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const inputCls = `h-11 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;
  const sectionCls = `border rounded-2xl p-5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`;
  const tabs = [{ id: 'details', label: 'Details', icon: FileText }, { id: 'items', label: 'Items', icon: Package }, { id: 'totals', label: 'Totals', icon: IndianRupee }, { id: 'settings', label: 'Settings', icon: Layers }];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[96vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">{editingInv ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
        <DialogDescription className="sr-only">Invoice form</DialogDescription>
        <div className="sticky top-0 z-20 flex-shrink-0">
          <div className="px-7 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            <div className="absolute right-0 top-0 w-56 h-56 rounded-full -mr-20 -mt-20 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Receipt className="h-5 w-5 text-white" /></div>
                <div><p className="text-white/50 text-[10px] uppercase tracking-widest">{editingInv ? `Edit · ${editingInv.invoice_no}` : 'New Document'}</p><h2 className="text-white font-bold text-xl">{editingInv ? 'Edit Invoice' : 'Create Invoice / Estimate'}</h2></div>
              </div>
              <Select value={form.invoice_type} onValueChange={v => setField('invoice_type', v)}>
                <SelectTrigger className="w-44 h-9 rounded-xl border-white/20 bg-white/10 text-white text-xs font-semibold"><SelectValue /></SelectTrigger>
                <SelectContent>{INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className={`flex border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all ${activeTab === tab.id ? `border-blue-500 ${isDark ? 'text-blue-400' : 'text-blue-600'}` : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}`}>
                <tab.icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 px-4">
              <span className={`text-xs font-bold ${totals.grand_total > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>Total: {fmtC(totals.grand_total)}</span>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Building2 className="h-4 w-4" /></div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Company & Client</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Company Profile *</label>
                      <Select value={form.company_id || '__none__'} onValueChange={v => setField('company_id', v === '__none__' ? '' : v)}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="Select company profile" /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">— Select company —</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Select Client (auto-fill){form.client_id && <span className="ml-2 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal font-normal">✓ auto-populated</span>}</label>
                      <ClientSearchCombobox clients={clients} value={form.client_id} onSelect={handleClientSelect} onAddNew={() => { onClose(); window.open('/clients?openAddClient=true', '_blank'); }} isDark={isDark} />
                    </div>
                    <div><label className={labelCls}>Client Name *</label><Input className={inputCls} value={form.client_name} onChange={e => setField('client_name', e.target.value)} required /></div>
                    <div><label className={labelCls}>Client GSTIN</label><Input className={inputCls} placeholder="22AAAAA0000A1Z5" value={form.client_gstin} onChange={e => setField('client_gstin', e.target.value)} /></div>
                    <div><label className={labelCls}>Email</label><Input type="email" className={inputCls} value={form.client_email} onChange={e => setField('client_email', e.target.value)} /></div>
                    <div><label className={labelCls}>Phone</label><Input className={inputCls} value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} /></div>
                    <div className="md:col-span-2"><label className={labelCls}>Address</label><Input className={inputCls} value={form.client_address} onChange={e => setField('client_address', e.target.value)} /></div>
                    <div><label className={labelCls}>Client State</label><Input className={inputCls} placeholder="e.g. Gujarat" value={form.client_state} onChange={e => setField('client_state', e.target.value)} /></div>
                    <div><label className={labelCls}>Supply State (Your State)</label><Input className={inputCls} placeholder="e.g. Gujarat" value={form.supply_state} onChange={e => setField('supply_state', e.target.value)} /></div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <Switch checked={form.is_interstate} onCheckedChange={v => setField('is_interstate', v)} />
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Interstate Supply (IGST)</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">{form.is_interstate ? 'IGST will be applied' : 'CGST + SGST will be applied'}</p>
                    </div>
                  </div>
                </div>
                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><CalendarDays className="h-4 w-4" /></div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Invoice Details</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div><label className={labelCls}>Invoice Date *</label><Input type="date" className={inputCls} value={form.invoice_date} onChange={e => setField('invoice_date', e.target.value)} required /></div>
                    <div><label className={labelCls}>Due Date</label><Input type="date" className={inputCls} value={form.due_date} onChange={e => setField('due_date', e.target.value)} /></div>
                    <div><label className={labelCls}>Reference / PO No.</label><Input className={inputCls} placeholder="Optional" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} /></div>
                    <div><label className={labelCls}>Payment Terms</label><Input className={inputCls} value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)} /></div>
                    <div><label className={labelCls}>Linked Lead</label><Select value={form.lead_id || '__none__'} onValueChange={v => setField('lead_id', v === '__none__' ? null : v)}><SelectTrigger className={inputCls}><SelectValue placeholder="Link to lead…" /></SelectTrigger><SelectContent><SelectItem value="__none__">— No Lead —</SelectItem>{leads.map(l => <SelectItem key={l.id} value={l.id}>{l.company_name}</SelectItem>)}</SelectContent></Select></div>
                    <div><label className={labelCls}>Status</label><Select value={form.status} onValueChange={v => setField('status', v)}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{['draft','sent','partially_paid','paid','overdue','cancelled'].map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'items' && (
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Package className="h-4 w-4" /></div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Line Items</h3>
                  </div>
                  <Button type="button" size="sm" onClick={addItem} variant="outline" className="h-8 px-3 text-xs rounded-xl"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
                </div>
                <div className="space-y-4">
                  {form.items.map((item, idx) => {
                    const comp = computeItem(item, form.is_interstate);
                    return (
                      <div key={idx} className={`border rounded-xl p-4 relative ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                            <Select value={item.product_id || '__none__'} onValueChange={v => fillFromProduct(idx, v)}>
                              <SelectTrigger className="h-7 w-44 text-xs rounded-lg border-slate-200"><SelectValue placeholder="Pick from catalog…" /></SelectTrigger>
                              <SelectContent><SelectItem value="__none__">— Manual Entry —</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          {form.items.length > 1 && (<button type="button" onClick={() => removeItem(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>)}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2"><label className={labelCls}>Description *</label><Input className={inputCls} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} /></div>
                          <div><label className={labelCls}>HSN / SAC</label><Input className={inputCls} placeholder="e.g. 9983" value={item.hsn_sac} onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} /></div>
                          <div><label className={labelCls}>Unit</label><Select value={item.unit} onValueChange={v => updateItem(idx, 'unit', v)}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
                          <div><label className={labelCls}>Quantity</label><Input type="number" min="0" step="0.01" className={inputCls} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                          <div><label className={labelCls}>Unit Price (₹)</label><Input type="number" min="0" step="0.01" className={inputCls} value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} /></div>
                          <div><label className={labelCls}>Discount %</label><Input type="number" min="0" max="100" step="0.01" className={inputCls} value={item.discount_pct} onChange={e => updateItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)} /></div>
                          <div><label className={labelCls}>GST Rate %</label><Select value={String(item.gst_rate)} onValueChange={v => updateItem(idx, 'gst_rate', parseFloat(v))}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent></Select></div>
                        </div>
                        <div className={`mt-3 flex flex-wrap gap-3 text-[10px] px-3 py-2 rounded-lg ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                          <span>Taxable: <strong className={isDark ? 'text-slate-200' : 'text-slate-700'}>{fmtC(comp.taxable_value)}</strong></span>
                          {form.is_interstate ? <span>IGST ({comp.igst_rate}%): <strong className="text-amber-600">{fmtC(comp.igst_amount)}</strong></span> : <><span>CGST ({comp.cgst_rate}%): <strong className="text-amber-600">{fmtC(comp.cgst_amount)}</strong></span><span>SGST ({comp.sgst_rate}%): <strong className="text-amber-600">{fmtC(comp.sgst_amount)}</strong></span></>}
                          <span className="ml-auto font-bold" style={{ color: COLORS.mediumBlue }}>Total: {fmtC(comp.total_amount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {activeTab === 'totals' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Charges & Discounts</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[['Extra Discount (₹)', 'discount_amount'], ['Shipping Charges (₹)', 'shipping_charges'], ['Other Charges (₹)', 'other_charges']].map(([label, key]) => (
                      <div key={key}><label className={labelCls}>{label}</label><Input type="number" min="0" step="0.01" className={inputCls} value={form[key]} onChange={e => setField(key, parseFloat(e.target.value) || 0)} /></div>
                    ))}
                  </div>
                </div>
                <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  {[['Subtotal', totals.subtotal, false, false], ['Total Discount', totals.total_discount, false, true], ['Taxable Value', totals.total_taxable, false, false], form.is_interstate ? ['IGST', totals.total_igst, false, false] : null, !form.is_interstate ? ['CGST', totals.total_cgst, false, false] : null, !form.is_interstate ? ['SGST', totals.total_sgst, false, false] : null, form.shipping_charges > 0 ? ['Shipping', form.shipping_charges, false, false] : null, form.other_charges > 0 ? ['Other', form.other_charges, false, false] : null, ['GRAND TOTAL', totals.grand_total, true, false]].filter(Boolean).map(([label, val, bold, neg]) => (
                    <div key={label} className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${bold ? (isDark ? 'bg-slate-700' : 'bg-slate-50') : ''} ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
                      <span className={`text-sm ${bold ? 'text-xl font-black' : 'font-semibold'} ${neg ? 'text-red-500' : ''}`} style={bold ? { color: COLORS.mediumBlue } : {}}>{neg && val > 0 ? '- ' : ''}{fmtC(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Notes & Terms</h3>
                  <div className="space-y-4">
                    {[['Notes (shown on invoice)', 'notes'], ['Terms & Conditions', 'terms_conditions']].map(([label, key]) => (
                      <div key={key}><label className={labelCls}>{label}</label><Textarea className={`rounded-xl text-sm min-h-[80px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={form[key]} onChange={e => setField(key, e.target.value)} /></div>
                    ))}
                  </div>
                </div>
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Recurring Settings</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <Switch checked={form.is_recurring} onCheckedChange={v => setField('is_recurring', v)} />
                    <div><p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Enable Recurring Invoice</p><p className="text-xs text-slate-400">Auto-generate new invoice on schedule</p></div>
                  </div>
                  {form.is_recurring && (
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className={labelCls}>Recurrence Pattern</label><Select value={form.recurrence_pattern} onValueChange={v => setField('recurrence_pattern', v)}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select></div>
                      <div><label className={labelCls}>Recurrence End Date</label><Input type="date" className={inputCls} value={form.recurrence_end || ''} onChange={e => setField('recurrence_end', e.target.value)} /></div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-5 text-sm rounded-xl text-slate-500">Cancel</Button>
          <div className="flex items-center gap-3">
            {totals.grand_total > 0 && (<span className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Total: <span style={{ color: COLORS.mediumBlue }}>{fmtC(totals.grand_total)}</span></span>)}
            <Button type="button" onClick={handleSubmit} disabled={loading}
              className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm"
              style={{ background: loading ? '#94a3b8' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              {loading ? 'Saving…' : editingInv ? '✓ Update Invoice' : '✓ Create Invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PANEL
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceDetailPanel = ({ invoice, open, onClose, onPayment, onEdit, onDelete, onDownloadPdf, onSendEmail, isDark }) => {
  const [payments, setPayments] = useState([]);
  useEffect(() => { if (open && invoice) { api.get('/payments', { params: { invoice_id: invoice.id } }).then(r => setPayments(r.data || [])).catch(() => setPayments([])); } }, [open, invoice?.id]);
  if (!invoice) return null;
  const meta = getStatusMeta(invoice); const isInterstate = invoice.is_interstate;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Invoice Detail</DialogTitle>
        <DialogDescription className="sr-only">Invoice details</DialogDescription>
        <div className="px-7 py-5 relative overflow-hidden flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0"><Receipt className="h-5 w-5 text-white" /></div>
              <div>
                <div className="flex items-center gap-2 mb-0.5"><p className="text-white font-bold text-lg leading-tight">{invoice.invoice_no}</p><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span></div>
                <p className="text-white/60 text-sm">{invoice.client_name}</p>
                <p className="text-white/40 text-xs mt-0.5">{invoice.invoice_date} · {INV_TYPES.find(t => t.value === invoice.invoice_type)?.label || 'Tax Invoice'}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"><X className="w-4 h-4 text-white" /></button>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-3">
            {[['Invoice Total', invoice.grand_total, 'text-white'], ['Amount Paid', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([label, val, cls]) => (
              <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5"><p className="text-white/50 text-[9px] uppercase tracking-wider mb-1">{label}</p><p className={`font-bold text-base ${cls}`}>{fmtC(val)}</p></div>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">
            <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}><p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Line Items ({invoice.items?.length || 0})</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>{['#', 'Description', 'HSN', 'Qty', 'Rate', 'Taxable', isInterstate ? 'IGST' : 'CGST+SGST', 'Total'].map(h => (<th key={h} className={`px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{h}</th>))}</tr></thead>
                  <tbody>{(invoice.items || []).map((it, i) => (<tr key={i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/20' : 'border-slate-100 hover:bg-slate-50'}`}><td className={`px-3 py-2.5 font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{i + 1}</td><td className={`px-3 py-2.5 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{it.description}</td><td className={`px-3 py-2.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{it.hsn_sac || '—'}</td><td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{it.quantity} {it.unit}</td><td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{fmtC(it.unit_price)}</td><td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{fmtC(it.taxable_value)}</td><td className="px-3 py-2.5 text-amber-600 font-medium">{isInterstate ? fmtC(it.igst_amount) : fmtC((it.cgst_amount || 0) + (it.sgst_amount || 0))}</td><td className={`px-3 py-2.5 font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(it.total_amount)}</td></tr>))}</tbody>
                </table>
              </div>
              <div className={`px-5 py-3 space-y-1.5 border-t ${isDark ? 'border-slate-700 bg-slate-700/20' : 'border-slate-100 bg-slate-50/50'}`}>
                {[['Taxable Value', invoice.total_taxable], isInterstate ? ['IGST', invoice.total_igst] : null, !isInterstate ? ['CGST', invoice.total_cgst] : null, !isInterstate ? ['SGST', invoice.total_sgst] : null, invoice.shipping_charges > 0 ? ['Shipping', invoice.shipping_charges] : null].filter(Boolean).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between text-xs"><span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span><span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{fmtC(val)}</span></div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600"><span className="text-sm font-bold" style={{ color: COLORS.deepBlue }}>Grand Total</span><span className="text-lg font-black" style={{ color: COLORS.mediumBlue }}>{fmtC(invoice.grand_total)}</span></div>
              </div>
            </div>
            {payments.length > 0 && (
              <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}><p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Payment History ({payments.length})</p></div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {payments.map(p => (<div key={p.id} className={`flex items-center justify-between px-5 py-3 ${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div><div><p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(p.amount)}</p><p className="text-xs text-slate-400">{p.payment_date} · {p.payment_mode.toUpperCase()}{p.reference_no && ` · ${p.reference_no}`}</p></div></div></div>))}
                </div>
              </div>
            )}
            {(invoice.notes || invoice.terms_conditions) && (
              <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                {invoice.notes && <><p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Notes</p><p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{invoice.notes}</p></>}
                {invoice.terms_conditions && <><p className={`text-[10px] font-bold uppercase tracking-widest mt-3 mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>T&C</p><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{invoice.terms_conditions}</p></>}
              </div>
            )}
          </div>
        </div>
        <div className={`flex-shrink-0 flex items-center gap-2 px-7 py-4 border-t flex-wrap ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit?.(invoice); }} className="rounded-xl text-xs h-9 gap-1.5"><Edit className="h-3.5 w-3.5" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={() => onDownloadPdf?.(invoice)} className="rounded-xl text-xs h-9 gap-1.5"><Download className="h-3.5 w-3.5" /> PDF</Button>
          {invoice.client_email && (<Button size="sm" onClick={() => { onClose(); onSendEmail?.(invoice); }} className="rounded-xl text-xs h-9 gap-1.5 bg-blue-600 text-white"><Send className="h-3.5 w-3.5" /> Send Email</Button>)}
          {invoice.amount_due > 0 && (<Button size="sm" onClick={() => { onClose(); onPayment?.(invoice); }} className="rounded-xl text-xs h-9 gap-1.5 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}><IndianRupee className="h-3.5 w-3.5" /> Record Payment</Button>)}
          <Button variant="ghost" size="sm" onClick={() => onDelete?.(invoice)} className="rounded-xl text-xs h-9 gap-1.5 text-red-500 hover:bg-red-50 ml-auto"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PRODUCT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const ProductModal = ({ open, onClose, isDark, onSaved }) => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) api.get('/products').then(r => setProducts(r.data || [])).catch(() => {}); }, [open]);
  const handleSave = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editing) await api.put(`/products/${editing.id}`, form);
      else await api.post('/products', form);
      toast.success(editing ? 'Product updated!' : 'Product created!');
      const r = await api.get('/products'); setProducts(r.data || []);
      setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
      setEditing(null); onSaved?.();
    } catch { toast.error('Failed to save product'); }
    finally { setLoading(false); }
  };
  const handleDelete = async (id) => {
    try { await api.delete(`/products/${id}`); setProducts(p => p.filter(x => x.id !== id)); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };
  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
        <DialogTitle className="sr-only">Product Catalog</DialogTitle>
        <DialogDescription className="sr-only">Manage products and services</DialogDescription>
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Package className="h-5 w-5" /></div>
            <div><h2 className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Product / Service Catalog</h2><p className="text-xs text-slate-400">Reusable items for quick invoice creation</p></div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className={`w-72 flex-shrink-0 p-5 border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/40'}`}>
            <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{editing ? 'Edit Item' : 'New Item'}</h4>
            <form onSubmit={handleSave} className="space-y-3">
              <Input className={inputCls} placeholder="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <Input className={inputCls} placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input className={inputCls} placeholder="HSN/SAC" value={form.hsn_sac} onChange={e => setForm(p => ({ ...p, hsn_sac: e.target.value }))} />
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" className={inputCls} placeholder="Unit Price" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} />
                <Select value={String(form.gst_rate)} onValueChange={v => setForm(p => ({ ...p, gst_rate: parseFloat(v) }))}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}% GST</SelectItem>)}</SelectContent></Select>
              </div>
              <Input className={inputCls} placeholder="Category (optional)" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} size="sm" className="flex-1 h-9 rounded-xl text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Item'}</Button>
                {editing && <Button type="button" variant="ghost" size="sm" className="h-9 rounded-xl text-xs" onClick={() => { setEditing(null); setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true }); }}>Cancel</Button>}
              </div>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400"><Package className="h-10 w-10 mb-3 opacity-30" /><p className="text-sm">No products yet — add one!</p></div>
            ) : products.map(p => (
              <div key={p.id} className={`flex items-center gap-3 px-5 py-3.5 border-b group transition-colors ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ background: p.is_service ? `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` : 'linear-gradient(135deg, #065f46, #059669)' }}>{p.is_service ? 'S' : 'P'}</div>
                <div className="flex-1 min-w-0"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p><p className="text-xs text-slate-400">{p.unit} · {fmtC(p.unit_price)} · GST {p.gst_rate}%{p.hsn_sac && ` · HSN ${p.hsn_sac}`}</p></div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(p); setForm({ name: p.name, description: p.description || '', hsn_sac: p.hsn_sac || '', unit: p.unit || 'service', unit_price: p.unit_price || 0, gst_rate: p.gst_rate || 18, category: p.category || '', is_service: p.is_service !== false }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
export default function Invoicing() {
  const { user } = useAuth();
  const isDark = useDark();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInv, setEditingInv] = useState(null);
  const [detailInv, setDetailInv] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payInv, setPayInv] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [gstOpen, setGstOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !formOpen && !detailOpen && !payOpen && !gstOpen && document.activeElement.tagName === 'BODY') setFormOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [formOpen, detailOpen, payOpen, gstOpen]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, compR, clientR, leadR, statR] = await Promise.all([
        api.get('/invoices'), api.get('/companies'), api.get('/clients'), api.get('/leads'), api.get('/invoices/stats')
      ]);
      setInvoices(invR.data || []); setCompanies(compR.data || []); setClients(clientR.data || []);
      setLeads(leadR.data || []); setStats(statR.data || null);
    } catch { toast.error('Failed to load invoicing data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const availableYears = useMemo(() => {
    const years = new Set(invoices.map(i => i.invoice_date?.slice(0, 4)).filter(Boolean));
    return Array.from(years).sort().reverse();
  }, [invoices]);

  const fyRange = (year) => {
    if (!year || year === 'all') return null;
    const y = parseInt(year);
    return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
  };

  const localStats = useMemo(() => {
    const now = new Date();
    const curMonth = format(now, 'yyyy-MM');
    const fy = fyRange(yearFilter === 'all' ? null : yearFilter);
    const base = invoices.filter(inv => {
      if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false;
      if (fy && (inv.invoice_date < fy.from || inv.invoice_date > fy.to)) return false;
      return true;
    });
    const total_revenue = base.reduce((s, i) => s + (i.grand_total || 0), 0);
    const total_outstanding = base.reduce((s, i) => s + (i.amount_due || 0), 0);
    const total_gst = base.reduce((s, i) => s + (i.total_gst || 0), 0);
    const total_invoices = base.length;
    const month_revenue = base.filter(i => i.invoice_date?.startsWith(curMonth)).reduce((s, i) => s + (i.grand_total || 0), 0);
    const month_invoices = base.filter(i => i.invoice_date?.startsWith(curMonth)).length;
    const overdue_count = base.filter(i => i.amount_due > 0 && i.due_date && differenceInDays(parseISO(i.due_date), now) < 0).length;
    const paid_count = base.filter(i => i.status === 'paid').length;
    const draft_count = base.filter(i => i.status === 'draft').length;
    const monthly_trend = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i);
      const key = format(d, 'yyyy-MM');
      const monthInvs = base.filter(inv => inv.invoice_date?.startsWith(key));
      return { label: format(d, 'MMM yy'), revenue: monthInvs.reduce((s, inv) => s + (inv.grand_total || 0), 0), collected: monthInvs.reduce((s, inv) => s + (inv.amount_paid || 0), 0) };
    });
    const clientMap = {};
    base.forEach(inv => { if (!inv.client_name) return; clientMap[inv.client_name] = (clientMap[inv.client_name] || 0) + (inv.grand_total || 0); });
    const top_clients = Object.entries(clientMap).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return { total_revenue, total_outstanding, total_gst, total_invoices, month_revenue, month_invoices, overdue_count, paid_count, draft_count, monthly_trend, top_clients };
  }, [invoices, companyFilter, yearFilter]);

  const filtered = useMemo(() => {
    const fy = fyRange(yearFilter === 'all' ? null : yearFilter);
    return invoices.filter(inv => {
      if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false;
      if (fy && (inv.invoice_date < fy.from || inv.invoice_date > fy.to)) return false;
      if (searchTerm && !inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) && !inv.client_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) return false;
      if (fromDate && inv.invoice_date < fromDate) return false;
      if (toDate && inv.invoice_date > toDate) return false;
      return true;
    });
  }, [invoices, companyFilter, yearFilter, searchTerm, statusFilter, typeFilter, fromDate, toDate]);

  const enrichedFiltered = useMemo(() => filtered.map(inv => {
    if (inv.status === 'sent' && inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0) return { ...inv, status: 'overdue' };
    return inv;
  }), [filtered]);

  const handleEdit = useCallback((inv) => { setEditingInv(inv); setFormOpen(true); }, []);
  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_no}?`)) return;
    try { await api.delete(`/invoices/${inv.id}`); toast.success('Invoice deleted'); fetchAll(); setDetailOpen(false); }
    catch { toast.error('Failed to delete'); }
  }, [fetchAll]);
  const handleDownloadPdf = useCallback(async (inv) => {
    try {
      const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const link = document.createElement('a');
      link.href = url; link.download = `invoice_${inv.invoice_no?.replace('/', '_')}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { toast.error('PDF generation failed'); }
  }, []);
  const handleMarkSent = useCallback(async (inv) => {
    try { await api.post(`/invoices/${inv.id}/mark-sent`); fetchAll(); toast.success('Marked as sent'); }
    catch { toast.error('Failed'); }
  }, [fetchAll]);
  const handleSendEmail = useCallback(async (inv) => {
    if (!inv.client_email) { toast.error('Client email address is missing'); return; }
    if (!window.confirm(`Send invoice ${inv.invoice_no} to ${inv.client_email}?`)) return;
    try { await api.post(`/invoices/${inv.id}/send-email`); toast.success(`Email queued for ${inv.invoice_no}`); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to queue email'); }
  }, [fetchAll]);
  const handleExport = useCallback(() => {
    if (!enrichedFiltered.length) { toast.error('No invoices to export'); return; }
    const rows = [['Invoice No', 'Type', 'Client', 'Date', 'Due Date', 'Taxable', 'GST', 'Total', 'Paid', 'Balance', 'Status'],
      ...enrichedFiltered.map(inv => [inv.invoice_no, INV_TYPES.find(t => t.value === inv.invoice_type)?.label || inv.invoice_type, inv.client_name, inv.invoice_date, inv.due_date, inv.total_taxable, inv.total_gst, inv.grand_total, inv.amount_paid, inv.amount_due, inv.status])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);
    toast.success(`Exported ${enrichedFiltered.length} invoices`);
  }, [enrichedFiltered]);

  return (
    <div className={`min-h-screen p-5 md:p-7 space-y-5 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* PAGE HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)` }}>
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 px-7 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0"><Receipt className="h-6 w-6 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Invoicing & Billing</h1>
              <p className="text-sm text-blue-200 mt-0.5">
                GST-compliant · Smart client search · GSTR reports · Email invoices ·&nbsp;
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">Ctrl+K</kbd> ·&nbsp;
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">N</kbd> new
                {companyFilter !== 'all' && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">📋 {companies.find(c => c.id === companyFilter)?.name}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGstOpen(true)}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4" /> GST Returns
            </Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <Settings className="h-4 w-4" /> Settings
            </Button>
            {/* UNIFIED IMPORT BUTTON */}
            <Button variant="outline" onClick={() => setImportOpen(true)}
              className="h-9 px-4 text-sm bg-emerald-500/20 border-emerald-300/40 text-white hover:bg-emerald-500/30 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <Database className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" onClick={downloadInvoiceTemplate}
              className="h-9 px-4 text-sm bg-amber-500/20 border-amber-300/40 text-white hover:bg-amber-500/30 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <FileDown className="h-4 w-4" /> Template
            </Button>
            <Button variant="outline" onClick={() => setCatOpen(true)}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <Package className="h-4 w-4" /> Catalog
            </Button>
            <Button variant="outline" onClick={handleExport}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => { setEditingInv(null); setFormOpen(true); }}
              className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0">
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* STATS */}
      {(localStats.total_invoices > 0 || invoices.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={fmtC(localStats.total_revenue)} sub={`${localStats.total_invoices} invoices`} icon={IndianRupee} color={COLORS.mediumBlue} bg={`${COLORS.mediumBlue}12`} isDark={isDark} onClick={() => setStatusFilter('all')} />
          <StatCard label="Outstanding" value={fmtC(localStats.total_outstanding)} sub={`${localStats.overdue_count} overdue`} icon={AlertCircle} color={COLORS.coral} bg={`${COLORS.coral}15`} isDark={isDark} onClick={() => setStatusFilter('overdue')} />
          <StatCard label="This Month" value={fmtC(localStats.month_revenue)} sub={`${localStats.month_invoices} invoices`} icon={TrendingUp} color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} isDark={isDark} />
          <StatCard label="Total GST" value={fmtC(localStats.total_gst)} sub={`${localStats.paid_count} paid · ${localStats.draft_count} draft`} icon={Shield} color={COLORS.amber} bg={`${COLORS.amber}12`} isDark={isDark} onClick={() => setGstOpen(true)} />
        </div>
      )}

      {localStats.monthly_trend?.some(d => d.revenue > 0) && (
        <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40"><BarChart3 className="h-4 w-4 text-blue-500" /></div>
              <div><h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Revenue Trend</h3><p className="text-xs text-slate-400">Last 12 months{companyFilter !== 'all' ? ` · ${companies.find(c => c.id === companyFilter)?.name || ''}` : ''}</p></div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded" style={{ background: COLORS.mediumBlue }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-px inline-block rounded border-t-2 border-dashed" style={{ borderColor: COLORS.emeraldGreen }} /> Collected</span>
            </div>
          </div>
          <RevenueChart trend={localStats.monthly_trend} isDark={isDark} />
        </div>
      )}

      {/* FILTERS */}
      <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input ref={searchRef} placeholder="Search invoice no. or client… (Ctrl+K)"
              className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100 placeholder:text-slate-400' : 'bg-slate-50'}`}
              value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {enrichedFiltered.length} <span className="ml-1 font-normal text-slate-400">invoices</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto scrollbar-none flex-wrap">
          {companies.length > 1 && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className={`h-9 w-[160px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-blue-50 text-blue-700'}`}>
                <Building2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}>
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(y => <SelectItem key={y} value={y}>FY {y}-{String(parseInt(y) + 1).slice(2)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className={`h-9 w-[145px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <Input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span className="text-slate-400 text-xs">to</span>
            <Input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          {(companyFilter !== 'all' || yearFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate || searchInput) && (
            <button onClick={() => { setCompanyFilter('all'); setYearFilter('all'); setStatusFilter('all'); setTypeFilter('all'); setFromDate(''); setToDate(''); setSearchInput(''); }}
              className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-xl hover:bg-red-50 transition-colors">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* INVOICE TABLE */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
        <div className={`grid border-b px-5 py-3 ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}
          style={{ gridTemplateColumns: '1fr 1fr 110px 100px 100px 100px 100px 160px' }}>
          {['Invoice No', 'Client', 'Date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
            <div key={h} className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</div>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : enrichedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}><Receipt className="h-7 w-7 opacity-30" /></div>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No invoices found</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setEditingInv(null); setFormOpen(true); }} className="rounded-xl text-white text-xs" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Plus className="h-3.5 w-3.5 mr-1" /> Create Invoice</Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="rounded-xl text-xs gap-1.5"><Database className="h-3.5 w-3.5" /> Import</Button>
            </div>
          </div>
        ) : (
          <div>
            {enrichedFiltered.map(inv => {
              const meta = getStatusMeta(inv); const isOverdue = inv.status === 'overdue';
              return (
                <div key={inv.id}
                  className={`grid items-center px-5 py-3.5 border-b cursor-pointer group transition-colors last:border-0 ${isOverdue ? (isDark ? 'bg-red-900/10 border-red-900/20' : 'bg-red-50/30 border-red-100') : ''} ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50/60'}`}
                  style={{ gridTemplateColumns: '1fr 1fr 110px 100px 100px 100px 100px 160px' }}
                  onClick={() => { setDetailInv(inv); setDetailOpen(true); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: meta.hex }} />
                    <div><p className={`text-sm font-bold font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{inv.invoice_no}</p><p className="text-[10px] text-slate-400">{INV_TYPES.find(t => t.value === inv.invoice_type)?.label || 'Tax Invoice'}</p></div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{inv.client_name?.charAt(0).toUpperCase() || '?'}</div>
                    <div className="min-w-0"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{inv.client_name}</p>{inv.client_gstin && <p className="text-[10px] text-slate-400 font-mono truncate">{inv.client_gstin}</p>}</div>
                  </div>
                  <div><p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{inv.invoice_date}</p><p className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>Due: {inv.due_date}</p></div>
                  <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(inv.grand_total)}</p>
                  <p className={`text-sm font-semibold ${inv.amount_paid > 0 ? 'text-emerald-600' : (isDark ? 'text-slate-500' : 'text-slate-300')}`}>{fmtC(inv.amount_paid)}</p>
                  <p className={`text-sm font-semibold ${inv.amount_due > 0 ? (isOverdue ? 'text-red-500' : 'text-amber-600') : 'text-slate-300'}`}>{fmtC(inv.amount_due)}</p>
                  <StatusPill inv={inv} />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDownloadPdf(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="PDF"><Download className="h-3.5 w-3.5" /></button>
                    {inv.client_email && (<button onClick={(e) => { e.stopPropagation(); handleSendEmail(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Send Email"><Send className="h-3.5 w-3.5" /></button>)}
                    {inv.amount_due > 0 && (<button onClick={(e) => { e.stopPropagation(); setPayInv(inv); setPayOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors" title="Payment"><IndianRupee className="h-3.5 w-3.5" /></button>)}
                    {inv.status === 'draft' && (<button onClick={(e) => { e.stopPropagation(); handleMarkSent(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Mark Sent"><Send className="h-3.5 w-3.5" /></button>)}
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit"><Edit className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {enrichedFiltered.length > 0 && (
          <div className={`flex items-center justify-between px-5 py-3 border-t ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
            <div className="flex items-center gap-6 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Showing <span className="font-bold">{enrichedFiltered.length}</span> invoices</span>
              <span className="font-semibold text-emerald-600">Total: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.grand_total || 0), 0))}</span>
              <span className="font-semibold text-amber-600">Outstanding: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.amount_due || 0), 0))}</span>
              <span className="font-semibold" style={{ color: COLORS.mediumBlue }}>GST: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.total_gst || 0), 0))}</span>
            </div>
            <button onClick={() => setGstOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Generate GST Returns
            </button>
          </div>
        )}
      </div>

      {/* TOP CLIENTS */}
      {localStats?.top_clients?.length > 0 && (
        <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/40"><Star className="h-4 w-4 text-yellow-500" /></div>
            <div><h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Top Clients by Revenue</h3><p className="text-xs text-slate-400">Based on {yearFilter !== 'all' ? `FY ${yearFilter}-${String(parseInt(yearFilter) + 1).slice(2)}` : 'all invoices'}</p></div>
          </div>
          <div className="space-y-3">
            {localStats.top_clients.map((c, i) => {
              const pct = localStats.total_revenue > 0 ? (c.revenue / localStats.total_revenue) * 100 : 0;
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: i === 0 ? 'linear-gradient(135deg, #b45309, #d97706)' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{c.name}</p><p className="text-sm font-bold flex-shrink-0 ml-3" style={{ color: COLORS.mediumBlue }}>{fmtC(c.revenue)}</p></div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DIALOGS ─────────────────────────────────────────────────────────── */}
      <InvoiceForm open={formOpen} onClose={() => { setFormOpen(false); setEditingInv(null); }}
        editingInv={editingInv} companies={companies} clients={clients} leads={leads}
        onSuccess={fetchAll} isDark={isDark} />
      <InvoiceDetailPanel
        invoice={detailInv} open={detailOpen} onClose={() => setDetailOpen(false)}
        onPayment={(inv) => { setPayInv(inv); setPayOpen(true); }}
        onEdit={handleEdit} onDelete={handleDelete}
        onDownloadPdf={handleDownloadPdf} onSendEmail={handleSendEmail}
        isDark={isDark} />
      <PaymentModal invoice={payInv} open={payOpen} onClose={() => { setPayOpen(false); setPayInv(null); }}
        onSuccess={fetchAll} isDark={isDark} />
      <ProductModal open={catOpen} onClose={() => setCatOpen(false)} isDark={isDark} onSaved={() => {}} />
      {/* UNIFIED IMPORT MODAL — replaces VypImportModal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)}
        isDark={isDark} companies={companies} onImportComplete={fetchAll} />
      <GSTReportsModal open={gstOpen} onClose={() => setGstOpen(false)}
        invoices={invoices} isDark={isDark} />
      <InvoiceSettings
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        companies={companies} isDark={isDark} />
    </div>
  );
}
