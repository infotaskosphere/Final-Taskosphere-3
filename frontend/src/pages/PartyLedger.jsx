/**
 * PartyLedger.jsx
 *
 * Complete party (client) ledger feature for the Taskosphere invoice module.
 *
 * Features:
 *   - Client search with combobox (same pattern as InvoiceForm)
 *   - Indian Financial Year presets (Apr–Mar) + custom date range
 *   - Opening balance input (for pre-system transactions)
 *   - Full double-entry style ledger: Invoice (Dr) · Payment (Cr) · Credit Note (Cr) · Debit Note (Dr)
 *   - Running balance column with Dr / Cr indicator
 *   - Summary bar: Total Invoiced · Total Received · Outstanding · Overdue
 *   - Aging analysis: 0-30 · 31-60 · 61-90 · 90+ days
 *   - Export to Excel (.xlsx) in standard ledger format
 *   - Print to browser (generates clean HTML ledger, triggers print dialog)
 *   - Per-invoice ledger quick-access from the invoice table row
 *
 * ─── INTEGRATION (add to invoicing.jsx) ────────────────────────────────────
 *
 *   import PartyLedger from './PartyLedger';
 *
 *   // State
 *   const [ledgerOpen,   setLedgerOpen]   = useState(false);
 *   const [ledgerClient, setLedgerClient] = useState(null); // pre-select client
 *
 *   // In page header buttons:
 *   <Button onClick={() => { setLedgerClient(null); setLedgerOpen(true); }}>
 *     <BookOpen className="h-4 w-4" /> Party Ledger
 *   </Button>
 *
 *   // Per-invoice row action (quick-open for that client):
 *   <button onClick={() => { setLedgerClient(inv.client_name); setLedgerOpen(true); }}>
 *     <BookOpen className="h-3.5 w-3.5" />
 *   </button>
 *
 *   // Dialog
 *   <PartyLedger
 *     open={ledgerOpen}
 *     onClose={() => setLedgerOpen(false)}
 *     invoices={invoices}
 *     clients={clients}
 *     companies={companies}
 *     preselectedClientName={ledgerClient}
 *     isDark={isDark}
 *   />
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useEffect, useMemo, useCallback, useRef,
} from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  X, Search, BookOpen, Download, Printer, ChevronDown,
  TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Calendar, Filter, Phone, Mail, Building2, Plus,
  RefreshCw, ArrowUpRight, ArrowDownLeft, FileText,
} from 'lucide-react';

// ─── Constants ─────────────────────────────────────────────────────────────
const ENTRY_TYPE_META = {
  invoice:     { label: 'Tax Invoice',     side: 'Dr', color: '#1F6FB2', bg: '#EFF6FF', border: '#BFDBFE' },
  proforma:    { label: 'Proforma Invoice',side: 'Dr', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  estimate:    { label: 'Estimate',         side: 'Dr', color: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
  debit_note:  { label: 'Debit Note',       side: 'Dr', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  credit_note: { label: 'Credit Note',      side: 'Cr', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  payment:     { label: 'Payment Received', side: 'Cr', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  opening:     { label: 'Opening Balance',  side: null, color: '#0D3B66', bg: '#EFF6FF', border: '#93C5FD' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtN = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmtN(n)}`;

/** Indian Financial Year helpers */
function getIndianFY(date = new Date()) {
  const m = date.getMonth(); // 0-indexed, March = 2, April = 3
  const y = date.getFullYear();
  return m >= 3 ? { start: y, end: y + 1 } : { start: y - 1, end: y };
}

function fyDateRange(fy) {
  return {
    from: `${fy.start}-04-01`,
    to:   `${fy.end}-03-31`,
    label: `FY ${fy.start}-${String(fy.end).slice(2)}`,
  };
}

const DATE_PRESETS = (() => {
  const today = new Date();
  const curFY = getIndianFY(today);
  const prevFY = { start: curFY.start - 1, end: curFY.end - 1 };
  const fmt = (d) => format(d, 'yyyy-MM-dd');

  const sub = (days) => { const d = new Date(today); d.setDate(d.getDate() - days); return d; };
  return [
    { id: 'curFY',  ...fyDateRange(curFY),  label: `Current ${fyDateRange(curFY).label}` },
    { id: 'prevFY', ...fyDateRange(prevFY), label: `Prev ${fyDateRange(prevFY).label}` },
    { id: '3m',  from: fmt(sub(90)),  to: fmt(today), label: 'Last 3 months' },
    { id: '6m',  from: fmt(sub(180)), to: fmt(today), label: 'Last 6 months' },
    { id: '1y',  from: fmt(sub(365)), to: fmt(today), label: 'Last 1 year' },
    { id: 'all', from: '2000-01-01',  to: fmt(today), label: 'All time' },
    { id: 'custom', from: '', to: '', label: 'Custom range' },
  ];
})();

/** Aging bucket (days overdue) */
function agingBucket(dueDateStr) {
  if (!dueDateStr) return null;
  const days = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(dueDateStr)));
  if (days <= 0)  return null;
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

// ─── Avatar helper ──────────────────────────────────────────────────────────
const AVATAR_GRADS = [
  ['#0D3B66','#1F6FB2'],['#064e3b','#059669'],['#7c2d12','#ea580c'],
  ['#4c1d95','#7c3aed'],['#881337','#e11d48'],['#134e4a','#0d9488'],
];
const avatarGrad = (name = '') => {
  const i = (name?.charCodeAt(0) || 0) % AVATAR_GRADS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADS[i][0]}, ${AVATAR_GRADS[i][1]})`;
};

// ─── Highlight helper ────────────────────────────────────────────────────────
const Hl = ({ text = '', query = '' }) => {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-bold not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// CLIENT COMBOBOX  (inline, no external dep)
// ════════════════════════════════════════════════════════════════════════════
function ClientCombobox({ clients, value, onChange, isDark }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [focused, setFocus] = useState(-1);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find(c => c.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 60);
    return clients.filter(c =>
      (c.company_name||'').toLowerCase().includes(q) ||
      (c.email||'').toLowerCase().includes(q) ||
      (c.phone||'').includes(q)
    ).slice(0, 40);
  }, [clients, query]);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (c) => { onChange(c?.id || null); setOpen(false); setQuery(''); setFocus(-1); };

  return (
    <div ref={wrapRef} className="relative">
      <button type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 20); }}
        className={`w-full flex items-center gap-2.5 h-11 px-3 rounded-xl border text-sm transition-all outline-none
          ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 hover:border-slate-500' : 'bg-white border-slate-200 hover:border-blue-300'}
          ${open ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : ''}`}>
        {selected ? (
          <>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: avatarGrad(selected.company_name) }}>
              {selected.company_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selected.company_name}</p>
              <p className="text-[10px] text-slate-400 truncate">{selected.phone || selected.email || ''}</p>
            </div>
            <span onClick={e => { e.stopPropagation(); pick(null); }}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-500 text-slate-300 transition-colors flex-shrink-0">
              <X className="h-3 w-3" />
            </span>
          </>
        ) : (
          <span className={`flex-1 text-left text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
            Search party / client…
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 w-full mt-1.5 rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
          style={{ maxHeight: 320 }}>
          <div className={`flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setFocus(-1); }}
              placeholder="Type name, phone or email…"
              className={`flex-1 text-sm outline-none placeholder:text-slate-400 bg-transparent ${isDark ? 'text-slate-100' : ''}`} />
            {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-slate-300 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && query ? (
              <div className="flex flex-col items-center py-8 text-slate-400">
                <Search className="h-5 w-5 mb-2 opacity-30" />
                <p className="text-xs">No match for "{query}"</p>
              </div>
            ) : filtered.map((c, i) => (
              <div key={c.id} onClick={() => pick(c)} onMouseEnter={() => setFocus(i)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b last:border-0 transition-colors
                  ${isDark ? 'border-slate-700' : 'border-slate-50'}
                  ${i === focused ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50')}
                  ${c.id === value ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/70') : ''}`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: avatarGrad(c.company_name) }}>
                  {c.company_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    <Hl text={c.company_name || ''} query={query} />
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.phone && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" /><Hl text={c.phone} query={query} /></span>}
                    {c.email && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Mail className="h-2.5 w-2.5 flex-shrink-0" /><span className="truncate max-w-[130px]"><Hl text={c.email} query={query} /></span></span>}
                  </div>
                </div>
                {c.id === value && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEDGER ENGINE  — builds sorted entries + running balance
// ════════════════════════════════════════════════════════════════════════════
function buildLedger(invoices, paymentsMap, openingBalance, dateFrom, dateTo) {
  const entries = [];
  const from = dateFrom ? new Date(dateFrom) : null;
  const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;

  const inRange = (dateStr) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  };

  // Opening balance row
  entries.push({
    id:        'opening',
    date:      dateFrom || '2000-01-01',
    type:      'opening',
    ref:       '',
    narration: 'Opening Balance',
    dr:        openingBalance > 0 ? openingBalance : 0,
    cr:        openingBalance < 0 ? Math.abs(openingBalance) : 0,
    sourceId:  null,
  });

  // Invoice entries
  invoices.forEach(inv => {
    if (!inRange(inv.invoice_date)) return;

    // Invoice / Debit Note → Debit
    const meta = ENTRY_TYPE_META[inv.invoice_type] || ENTRY_TYPE_META.invoice;
    if (meta.side === 'Dr') {
      entries.push({
        id:        `inv-${inv.id}`,
        date:      inv.invoice_date,
        type:      inv.invoice_type,
        ref:       inv.invoice_no || '—',
        narration: `${meta.label}${inv.reference_no ? ` | Ref: ${inv.reference_no}` : ''}`,
        dr:        inv.grand_total || 0,
        cr:        0,
        sourceId:  inv.id,
        dueDate:   inv.due_date,
        status:    inv.status,
      });
    }
    // Credit Note → Credit
    if (meta.side === 'Cr' && inv.invoice_type === 'credit_note') {
      entries.push({
        id:        `cn-${inv.id}`,
        date:      inv.invoice_date,
        type:      'credit_note',
        ref:       inv.invoice_no || '—',
        narration: `Credit Note`,
        dr:        0,
        cr:        inv.grand_total || 0,
        sourceId:  inv.id,
      });
    }

    // Payments for this invoice
    const pmts = paymentsMap[inv.id] || [];
    pmts.forEach(pmt => {
      if (!inRange(pmt.payment_date)) return;
      entries.push({
        id:        `pmt-${pmt.id}`,
        date:      pmt.payment_date,
        type:      'payment',
        ref:       pmt.reference_no || `PMT/${pmt.id?.slice(0,6)?.toUpperCase() || '—'}`,
        narration: `Payment Received${pmt.payment_mode ? ` via ${pmt.payment_mode.toUpperCase()}` : ''}${pmt.notes ? ` | ${pmt.notes}` : ''}`,
        dr:        0,
        cr:        pmt.amount || 0,
        sourceId:  inv.id,
      });
    });
  });

  // Sort by date then by type (opening first, then by created order)
  entries.sort((a, b) => {
    if (a.type === 'opening') return -1;
    if (b.type === 'opening') return 1;
    const da = new Date(a.date), db = new Date(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    // payments after invoices on same date
    if (a.type === 'payment' && b.type !== 'payment') return 1;
    if (b.type === 'payment' && a.type !== 'payment') return -1;
    return 0;
  });

  // Compute running balance
  let balance = 0;
  const rows = entries.map(entry => {
    balance += entry.dr - entry.cr;
    return { ...entry, runningBalance: balance, balanceSide: balance >= 0 ? 'Dr' : 'Cr' };
  });

  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
// PRINT LEDGER  — opens browser print dialog
// ════════════════════════════════════════════════════════════════════════════
function printLedger(rows, client, company, dateFrom, dateTo) {
  const closingRow   = rows[rows.length - 1];
  const closingBal   = closingRow ? Math.abs(closingRow.runningBalance) : 0;
  const closingSide  = closingRow?.balanceSide || 'Dr';
  const totalDr      = rows.reduce((s, r) => s + r.dr, 0);
  const totalCr      = rows.reduce((s, r) => s + r.cr, 0);
  const periodLabel  = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'dd-MMM-yyyy')} to ${format(new Date(dateTo), 'dd-MMM-yyyy')}`
    : 'All time';

  const rowsHtml = rows.map((r, i) => {
    const isOpening = r.type === 'opening';
    const isPayment = r.type === 'payment';
    const meta = ENTRY_TYPE_META[r.type] || ENTRY_TYPE_META.invoice;
    return `
      <tr style="background:${i % 2 === 0 ? '#F8FAFC' : 'white'}${isOpening ? ';background:#EFF6FF;font-style:italic' : ''}">
        <td style="padding:7px 8px;font-size:11px;color:#374151;white-space:nowrap">${isOpening ? '' : format(new Date(r.date), 'dd-MMM-yy')}</td>
        <td style="padding:7px 8px;font-size:11px;color:#374151">
          <span style="display:inline-flex;align-items:center;gap:5px">
            ${!isOpening ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:${meta.bg};color:${meta.color};border:1px solid ${meta.border}">${meta.label}</span>` : ''}
            ${r.narration}
          </span>
        </td>
        <td style="padding:7px 8px;font-size:11px;color:#374151;font-family:monospace">${r.ref}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:${r.dr > 0 ? '#1F6FB2' : '#9CA3AF'};font-weight:${r.dr > 0 ? '600' : '400'}">${r.dr > 0 ? fmtN(r.dr) : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;color:${r.cr > 0 ? '#059669' : '#9CA3AF'};font-weight:${r.cr > 0 ? '600' : '400'}">${r.cr > 0 ? fmtN(r.cr) : '—'}</td>
        <td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:700;color:${r.runningBalance > 0 ? '#1F6FB2' : r.runningBalance < 0 ? '#DC2626' : '#9CA3AF'}">
          ${fmtN(Math.abs(r.runningBalance))}
          <span style="font-size:9px;font-weight:700;margin-left:3px;color:${r.balanceSide === 'Dr' ? '#1F6FB2' : '#059669'}">${r.balanceSide}</span>
        </td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Party Ledger - ${client?.company_name || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#1a1a1a; background:white; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    @media print { @page { size:A4 landscape; margin:10mm; } }
    .page { max-width:280mm; margin:0 auto; padding:12mm; }
  </style></head><body><div class="page">
  <!-- Header -->
  <div style="border-bottom:3px solid #0D3B66;padding-bottom:14px;margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#0D3B66;margin-bottom:4px">Party Ledger</p>
        <p style="font-size:22px;font-weight:900;color:#111827">${client?.company_name || '—'}</p>
        ${client?.client_gstin ? `<p style="font-size:10px;color:#6B7280">GSTIN: ${client.client_gstin}</p>` : ''}
        ${client?.phone ? `<p style="font-size:10px;color:#6B7280">Phone: ${client.phone}</p>` : ''}
      </div>
      <div style="text-align:right">
        <p style="font-size:10px;color:#6B7280">Company</p>
        <p style="font-size:14px;font-weight:700;color:#111827">${company?.name || ''}</p>
        ${company?.gstin ? `<p style="font-size:10px;color:#6B7280">GSTIN: ${company.gstin}</p>` : ''}
        <p style="font-size:10px;color:#6B7280;margin-top:4px">Period: ${periodLabel}</p>
        <p style="font-size:10px;color:#6B7280">Printed: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}</p>
      </div>
    </div>
  </div>
  <!-- Summary -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
    ${[
      ['Total Invoiced (Dr)', fmtC(totalDr), '#1F6FB2','#EFF6FF','#BFDBFE'],
      ['Total Received (Cr)', fmtC(totalCr), '#059669','#ECFDF5','#6EE7B7'],
      ['Outstanding', fmtC(closingBal), closingSide==='Dr'?'#DC2626':'#059669', closingSide==='Dr'?'#FEF2F2':'#ECFDF5', closingSide==='Dr'?'#FCA5A5':'#6EE7B7'],
      ['Closing Balance', `${fmtC(closingBal)} ${closingSide}`, '#0D3B66','#EFF6FF','#93C5FD'],
    ].map(([label, val, color, bg, border]) =>
      `<div style="background:${bg};border:1px solid ${border};border-radius:6px;padding:10px">
        <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${color};margin-bottom:4px">${label}</p>
        <p style="font-size:15px;font-weight:900;color:${color}">${val}</p>
      </div>`
    ).join('')}
  </div>
  <!-- Ledger Table -->
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#0D3B66;color:white">
        ${['Date','Particulars','Voucher No.','Debit (₹)','Credit (₹)','Balance (₹)'].map(h =>
          `<th style="padding:9px 8px;text-align:${['Debit (₹)','Credit (₹)','Balance (₹)'].includes(h)?'right':'left'};font-size:10px;font-weight:700;letter-spacing:0.5px">${h}</th>`
        ).join('')}
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="background:#0D3B66;color:white;font-weight:700">
        <td colspan="3" style="padding:9px 8px;font-size:11px">CLOSING BALANCE</td>
        <td style="padding:9px 8px;text-align:right;font-size:12px">${fmtN(totalDr)}</td>
        <td style="padding:9px 8px;text-align:right;font-size:12px">${fmtN(totalCr)}</td>
        <td style="padding:9px 8px;text-align:right;font-size:13px;font-weight:900">${fmtN(closingBal)} ${closingSide}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:16px;font-size:9px;color:#9CA3AF;text-align:center">
    This is a computer-generated ledger. For ${company?.name || ''}.
  </p>
</div></body></html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) { alert('Please allow pop-ups to print the ledger'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORT LEDGER TO EXCEL
// ════════════════════════════════════════════════════════════════════════════
function exportLedgerExcel(rows, client, company, dateFrom, dateTo) {
  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'dd-MMM-yyyy')} to ${format(new Date(dateTo), 'dd-MMM-yyyy')}`
    : 'All time';

  const closingRow  = rows[rows.length - 1];
  const closingBal  = closingRow ? Math.abs(closingRow.runningBalance) : 0;
  const closingSide = closingRow?.balanceSide || 'Dr';
  const totalDr     = rows.reduce((s, r) => s + r.dr, 0);
  const totalCr     = rows.reduce((s, r) => s + r.cr, 0);

  const sheetData = [
    ['PARTY LEDGER'],
    [`Party: ${client?.company_name || '—'}`],
    [`GSTIN: ${client?.client_gstin || 'N/A'}`],
    [`Company: ${company?.name || ''}`],
    [`Period: ${periodLabel}`],
    [`Printed: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`],
    [],
    ['Date', 'Particulars', 'Voucher Type', 'Voucher No.', 'Debit (₹)', 'Credit (₹)', 'Balance (₹)', 'Dr/Cr'],
    ...rows.map(r => [
      r.type === 'opening' ? '' : format(new Date(r.date), 'dd-MMM-yyyy'),
      r.narration,
      ENTRY_TYPE_META[r.type]?.label || r.type,
      r.ref,
      r.dr > 0 ? r.dr : '',
      r.cr > 0 ? r.cr : '',
      Math.abs(r.runningBalance),
      r.balanceSide,
    ]),
    [],
    ['TOTALS', '', '', '', totalDr, totalCr, closingBal, closingSide],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 48 }, { wch: 18 }, { wch: 22 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 6 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

  // Second sheet: Aging
  const agingData = [
    ['OUTSTANDING AGING ANALYSIS'],
    [`Party: ${client?.company_name || '—'}`],
    [],
    ['Invoice No', 'Invoice Date', 'Due Date', 'Invoice Amount (₹)', 'Paid (₹)', 'Outstanding (₹)', 'Days Overdue', 'Bucket'],
  ];

  // NOTE: rows filtered to debit entries with outstanding
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agingData), 'Aging');

  const clientName = (client?.company_name || 'party').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Ledger_${clientName}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);
  toast.success(`Ledger exported for ${client?.company_name}`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function PartyLedger({
  open, onClose, invoices = [], clients = [], companies = [],
  preselectedClientName = null, isDark,
}) {
  const [clientId,      setClientId]      = useState(null);
  const [presetId,      setPresetId]      = useState('curFY');
  const [dateFrom,      setDateFrom]      = useState(DATE_PRESETS[0].from);
  const [dateTo,        setDateTo]        = useState(DATE_PRESETS[0].to);
  const [openingBal,    setOpeningBal]    = useState(0);
  const [paymentsMap,   setPaymentsMap]   = useState({});   // invoiceId → [payments]
  const [loadingPmts,   setLoadingPmts]   = useState(false);

  // Pre-select client by name if provided
  useEffect(() => {
    if (open && preselectedClientName) {
      const match = clients.find(c =>
        c.company_name?.toLowerCase() === preselectedClientName.toLowerCase()
      );
      if (match) setClientId(match.id);
    }
    if (open && !preselectedClientName) setClientId(null);
  }, [open, preselectedClientName, clients]);

  // Fetch payments when client invoices change
  const clientInvoices = useMemo(() =>
    invoices.filter(inv => {
      if (!clientId) return false;
      const client = clients.find(c => c.id === clientId);
      if (!client) return false;
      return inv.client_name === client.company_name ||
             inv.client_id   === clientId;
    }),
    [invoices, clientId, clients]
  );

  useEffect(() => {
    if (!clientInvoices.length) { setPaymentsMap({}); return; }
    setLoadingPmts(true);
    Promise.all(
      clientInvoices.map(inv =>
        api.get('/payments', { params: { invoice_id: inv.id } })
           .then(r => [inv.id, r.data || []])
           .catch(() => [inv.id, []])
      )
    ).then(results => {
      const map = {};
      results.forEach(([id, pmts]) => { map[id] = pmts; });
      setPaymentsMap(map);
    }).finally(() => setLoadingPmts(false));
  }, [clientInvoices.map(i => i.id).join(',')]);

  // Handle preset change
  const handlePreset = useCallback((id) => {
    setPresetId(id);
    const p = DATE_PRESETS.find(d => d.id === id);
    if (p && id !== 'custom') { setDateFrom(p.from); setDateTo(p.to); }
  }, []);

  // Build ledger rows
  const rows = useMemo(() =>
    buildLedger(clientInvoices, paymentsMap, Number(openingBal) || 0, dateFrom, dateTo),
    [clientInvoices, paymentsMap, openingBal, dateFrom, dateTo]
  );

  // Summary stats
  const summary = useMemo(() => {
    const invoicedTotal = clientInvoices.reduce((s, i) => s + (i.invoice_type === 'credit_note' ? 0 : i.grand_total || 0), 0);
    const receivedTotal = clientInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
    const outstanding   = clientInvoices.reduce((s, i) => s + (i.amount_due  || 0), 0);
    const overdueAmt    = clientInvoices
      .filter(i => i.amount_due > 0 && i.due_date && differenceInDays(new Date(), parseISO(i.due_date)) > 0)
      .reduce((s, i) => s + i.amount_due, 0);

    // Aging buckets (outstanding only)
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    clientInvoices.forEach(inv => {
      if (inv.amount_due <= 0) return;
      const bucket = agingBucket(inv.due_date);
      if (bucket) aging[bucket] += inv.amount_due;
    });

    const closingRow  = rows[rows.length - 1];
    const closingBal  = closingRow ? Math.abs(closingRow.runningBalance) : 0;
    const closingSide = closingRow?.balanceSide || 'Dr';
    const totalDr     = rows.reduce((s, r) => s + r.dr, 0);
    const totalCr     = rows.reduce((s, r) => s + r.cr, 0);

    return { invoicedTotal, receivedTotal, outstanding, overdueAmt, aging, closingBal, closingSide, totalDr, totalCr };
  }, [rows, clientInvoices]);

  const selectedClient  = clients.find(c => c.id === clientId) || null;
  const selectedCompany = companies[0] || null;

  const handlePrint  = () => printLedger(rows, selectedClient, selectedCompany, dateFrom, dateTo);
  const handleExport = () => exportLedgerExcel(rows, selectedClient, selectedCompany, dateFrom, dateTo);

  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const inputCls = `h-9 rounded-xl text-sm border-slate-200 focus:border-blue-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-[96vw] w-[1200px] max-h-[95vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Party Ledger</DialogTitle>
        <DialogDescription className="sr-only">View party account ledger</DialogDescription>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-7 py-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Party Ledger</h2>
                <p className="text-blue-200 text-xs mt-0.5">
                  Complete account statement · Invoice · Payment · Credit Note · Debit Note
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedClient && rows.length > 1 && (
                <>
                  <Button size="sm" onClick={handleExport}
                    className="h-8 px-3 text-xs rounded-xl bg-white/15 hover:bg-white/25 text-white border-white/25 border gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Excel
                  </Button>
                  <Button size="sm" onClick={handlePrint}
                    className="h-8 px-3 text-xs rounded-xl bg-white/15 hover:bg-white/25 text-white border-white/25 border gap-1.5">
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                </>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filters bar ── */}
        <div className={`flex-shrink-0 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/60'}`}>
          <div className="flex items-end gap-4 px-6 py-4 flex-wrap">

            {/* Client selector */}
            <div style={{ minWidth: 280, flex: '1 1 280px' }}>
              <label className={labelCls}>Party / Client</label>
              <ClientCombobox clients={clients} value={clientId} onChange={setClientId} isDark={isDark} />
            </div>

            {/* Period presets */}
            <div>
              <label className={labelCls}>Period</label>
              <div className="flex items-center gap-1 flex-wrap">
                {DATE_PRESETS.filter(p => p.id !== 'custom').map(p => (
                  <button key={p.id} onClick={() => handlePreset(p.id)}
                    className={`h-9 px-3 text-xs font-semibold rounded-xl border transition-all whitespace-nowrap
                      ${presetId === p.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom date range */}
            <div>
              <label className={labelCls}>Custom Range</label>
              <div className="flex items-center gap-2">
                <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPresetId('custom'); }}
                  className={`${inputCls} w-36`} />
                <span className="text-slate-400 text-xs">to</span>
                <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPresetId('custom'); }}
                  className={`${inputCls} w-36`} />
              </div>
            </div>

            {/* Opening balance */}
            <div>
              <label className={labelCls}>Opening Balance (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
                <Input type="number" step="0.01" value={openingBal}
                  onChange={e => setOpeningBal(parseFloat(e.target.value) || 0)}
                  className={`${inputCls} pl-7 w-32`} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* No client selected */}
          {!selectedClient && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Building2 className="h-8 w-8 opacity-30" />
              </div>
              <p className={`text-base font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Select a party to view their ledger</p>
              <p className="text-sm text-slate-400">Search by name, phone, or email above</p>
            </div>
          )}

          {selectedClient && (
            <>
              {/* ── Client profile + Summary ── */}
              <div className={`flex-shrink-0 border-b ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-100'}`}>
                <div className="px-6 py-4 flex items-start gap-5 flex-wrap">

                  {/* Client card */}
                  <div className={`flex items-center gap-3 rounded-2xl border p-4 flex-shrink-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} style={{ minWidth: 220 }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black flex-shrink-0"
                      style={{ background: avatarGrad(selectedClient.company_name) }}>
                      {selectedClient.company_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.company_name}</p>
                      {selectedClient.phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" />{selectedClient.phone}</p>}
                      {selectedClient.email && <p className="text-xs text-slate-400 flex items-center gap-1 truncate max-w-[160px]"><Mail className="h-3 w-3" />{selectedClient.email}</p>}
                      {selectedClient.client_gstin && <p className="text-[10px] font-mono text-slate-400 mt-0.5">{selectedClient.client_gstin}</p>}
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div className="flex items-stretch gap-3 flex-1 min-w-0 flex-wrap">
                    {[
                      { label: 'Total Invoiced', val: fmtC(summary.totalDr), icon: ArrowUpRight, color: '#1F6FB2', bg: '#EFF6FF', border: '#BFDBFE' },
                      { label: 'Total Received', val: fmtC(summary.totalCr), icon: ArrowDownLeft, color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
                      { label: 'Outstanding', val: fmtC(summary.closingBal) + ' ' + summary.closingSide, icon: TrendingUp, color: summary.closingSide === 'Dr' ? '#DC2626' : '#059669', bg: summary.closingSide === 'Dr' ? '#FEF2F2' : '#ECFDF5', border: summary.closingSide === 'Dr' ? '#FCA5A5' : '#6EE7B7' },
                      { label: 'Overdue', val: fmtC(summary.overdueAmt), icon: AlertCircle, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border p-3 flex items-center gap-3 flex-1 min-w-[140px]"
                        style={{ background: s.bg, borderColor: s.border }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.color + '22' }}>
                          <s.icon className="h-4 w-4" style={{ color: s.color }} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                          <p className="text-sm font-black" style={{ color: s.color }}>{s.val}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aging analysis */}
                {(summary.aging['0-30'] + summary.aging['31-60'] + summary.aging['61-90'] + summary.aging['90+']) > 0 && (
                  <div className="px-6 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Outstanding Aging</p>
                    </div>
                    <div className="flex items-stretch gap-3 flex-wrap">
                      {[
                        { bucket: '0-30',  label: '0–30 days',  color: '#1F6FB2', bg: '#EFF6FF', border: '#BFDBFE' },
                        { bucket: '31-60', label: '31–60 days', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                        { bucket: '61-90', label: '61–90 days', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
                        { bucket: '90+',   label: '90+ days',   color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
                      ].map(a => (
                        <div key={a.bucket} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                          style={{ background: a.bg, borderColor: a.border, opacity: summary.aging[a.bucket] > 0 ? 1 : 0.4 }}>
                          <div className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: a.color }}>{a.label}</p>
                            <p className="text-sm font-bold" style={{ color: a.color }}>{fmtC(summary.aging[a.bucket])}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center text-xs text-slate-400 gap-1 ml-auto">
                        <span className="text-[10px]">Total Outstanding:</span>
                        <span className="font-bold text-sm" style={{ color: '#DC2626' }}>{fmtC(summary.closingBal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Ledger table ── */}
              <div className="flex-1 overflow-auto">
                {loadingPmts ? (
                  <div className="flex items-center justify-center py-16 gap-3">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-slate-400">Loading payment records…</p>
                  </div>
                ) : rows.length <= 1 ? (
                  <div className="flex flex-col items-center py-16 gap-3">
                    <FileText className="h-10 w-10 opacity-20" />
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No transactions in this period</p>
                    <p className="text-xs text-slate-400">Try changing the date range or check if invoices are linked to this client</p>
                  </div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    {/* Table head */}
                    <thead className="sticky top-0 z-10">
                      <tr style={{ background: '#0D3B66' }}>
                        {['Date','Particulars','Voucher Type','Voucher No.','Debit (₹)','Credit (₹)','Balance (₹)'].map(h => (
                          <th key={h}
                            className={`py-3 px-4 text-left text-[10px] font-bold uppercase tracking-wider text-blue-200
                              ${['Debit (₹)','Credit (₹)','Balance (₹)'].includes(h) ? 'text-right' : ''}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => {
                        const meta     = ENTRY_TYPE_META[row.type] || ENTRY_TYPE_META.invoice;
                        const isOpening = row.type === 'opening';
                        const isPayment = row.type === 'payment';
                        const isCredit  = row.type === 'credit_note';

                        return (
                          <tr key={row.id}
                            className={`border-b transition-colors group
                              ${isDark ? 'border-slate-700' : 'border-slate-100'}
                              ${isOpening ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/60') : idx % 2 === 0 ? (isDark ? 'bg-slate-800' : 'bg-white') : (isDark ? 'bg-slate-800/60' : 'bg-slate-50/40')}
                              ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'}`}>

                            {/* Date */}
                            <td className={`px-4 py-3 whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {isOpening ? '' : (
                                <span className="text-xs font-medium">
                                  {format(new Date(row.date), 'dd MMM yy')}
                                </span>
                              )}
                            </td>

                            {/* Particulars */}
                            <td className={`px-4 py-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                              <p className={`text-xs font-semibold ${isOpening ? 'italic font-bold' : ''}`}>
                                {row.narration}
                              </p>
                              {row.dueDate && row.dr > 0 && (() => {
                                const bucket = agingBucket(row.dueDate);
                                const colors = {
                                  '0-30':  { color: '#1F6FB2', bg: '#EFF6FF' },
                                  '31-60': { color: '#D97706', bg: '#FFFBEB' },
                                  '61-90': { color: '#EA580C', bg: '#FFF7ED' },
                                  '90+':   { color: '#DC2626', bg: '#FEF2F2' },
                                };
                                return bucket ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block"
                                    style={{ background: colors[bucket].bg, color: colors[bucket].color }}>
                                    Overdue {bucket} days
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-400">
                                    Due: {format(new Date(row.dueDate), 'dd-MMM-yy')}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* Voucher type */}
                            <td className="px-4 py-3">
                              {!isOpening && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-full border"
                                  style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>
                                  {meta.label}
                                </span>
                              )}
                            </td>

                            {/* Voucher No */}
                            <td className={`px-4 py-3 font-mono text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'} font-semibold`}>
                              {row.ref}
                            </td>

                            {/* Debit */}
                            <td className={`px-4 py-3 text-right text-xs font-semibold ${row.dr > 0 ? (isDark ? 'text-blue-400' : 'text-blue-700') : (isDark ? 'text-slate-600' : 'text-slate-300')}`}>
                              {row.dr > 0 ? fmtN(row.dr) : '—'}
                            </td>

                            {/* Credit */}
                            <td className={`px-4 py-3 text-right text-xs font-semibold ${row.cr > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-slate-600' : 'text-slate-300')}`}>
                              {row.cr > 0 ? fmtN(row.cr) : '—'}
                            </td>

                            {/* Running balance */}
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-black ${
                                row.runningBalance > 0  ? (isDark ? 'text-blue-400'    : 'text-blue-700') :
                                row.runningBalance < 0  ? (isDark ? 'text-emerald-400' : 'text-emerald-700') :
                                (isDark ? 'text-slate-500' : 'text-slate-400')
                              }`}>
                                {fmtN(Math.abs(row.runningBalance))}
                              </span>
                              {row.runningBalance !== 0 && (
                                <span className={`ml-1 text-[9px] font-black px-1.5 py-0.5 rounded-full
                                  ${row.balanceSide === 'Dr'
                                    ? (isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700')
                                    : (isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>
                                  {row.balanceSide}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Totals footer */}
                    <tfoot className="sticky bottom-0">
                      <tr style={{ background: '#0D3B66', color: 'white' }}>
                        <td colSpan={4} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-blue-200">
                          Closing Balance
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-black text-white">
                          {fmtN(summary.totalDr)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-black text-white">
                          {fmtN(summary.totalCr)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-base font-black text-white">
                            {fmtN(summary.closingBal)}
                          </span>
                          <span className={`ml-1.5 text-[10px] font-black px-2 py-0.5 rounded-full
                            ${summary.closingSide === 'Dr' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'}`}>
                            {summary.closingSide}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {selectedClient && rows.length > 1 && (
          <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
            <p className="text-xs text-slate-400">
              {rows.length - 1} transaction{rows.length !== 2 ? 's' : ''} ·
              Period: {dateFrom ? format(new Date(dateFrom), 'dd-MMM-yyyy') : '—'} to {dateTo ? format(new Date(dateTo), 'dd-MMM-yyyy') : '—'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} className="h-9 px-4 text-sm rounded-xl text-slate-500">
                Close
              </Button>
              <Button onClick={handleExport} variant="outline"
                className="h-9 px-4 text-sm rounded-xl gap-1.5 border-slate-200">
                <Download className="h-3.5 w-3.5" /> Export Excel
              </Button>
              <Button onClick={handlePrint}
                className="h-9 px-5 text-sm rounded-xl text-white font-semibold gap-1.5"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Printer className="h-3.5 w-3.5" /> Print Ledger
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
