/**
 * PartyLedger.jsx
 *
 * COMPLETE PARTY LEDGER FEATURE (updated March 2026)
 *
 * UPGRADES IMPLEMENTED:
 * 1. Excel export in EXACT "Ledger Reconciliation" format from attached files
 *    (Ledger Reconcilation Format-01.xlsx & Format-03.xlsx)
 *    → Title, Company/Party details, Phone/Email, To, Time Period, Created By
 *    → Precise column layout with spacing columns (Date, Description, [5 empty], Debit, [empty], Credit, [empty], Dr or Cr, [empty], Closing Balance)
 *    → Opening Balance, transaction rows, Closing Balance, Totals row
 *    → Dates formatted as real Excel dates (auto-formatted by XLSX)
 * 2. PDF export via enhanced browser print (user can "Save as PDF" from print dialog)
 *    → Clean, perfectly aligned printable HTML matching reconciliation style
 * 3. Full UI overhaul for perfect popup alignment
 *    → max-w-7xl dialog, fixed table layout, overflow-x-auto wrapper
 *    → No text/letter overflow (nowrap + precise column widths + responsive)
 *    → All existing features preserved + cleaner code
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO, differenceInDays, startOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  X,
  Search,
  BookOpen,
  Download,
  Printer,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Filter,
  Phone,
  Mail,
  Building2,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
} from 'lucide-react';

// ─── Constants ─────────────────────────────────────────────────────────────
const ENTRY_TYPE_META = {
  invoice: { label: 'Tax Invoice', side: 'Dr', color: '#1F6FB2', bg: '#EFF6FF', border: '#BFDBFE' },
  proforma: { label: 'Proforma Invoice', side: 'Dr', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  estimate: { label: 'Estimate', side: 'Dr', color: '#64748B', bg: '#F8FAFC', border: '#CBD5E1' },
  debit_note: { label: 'Debit Note', side: 'Dr', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  credit_note: { label: 'Credit Note', side: 'Cr', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  payment: { label: 'Payment Received', side: 'Cr', color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  opening: { label: 'Opening Balance', side: null, color: '#0D3B66', bg: '#EFF6FF', border: '#93C5FD' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmtN = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmtN(n)}`;

/** Indian Financial Year helpers */
function getIndianFY(date = new Date()) {
  const m = date.getMonth();
  const y = date.getFullYear();
  return m >= 3 ? { start: y, end: y + 1 } : { start: y - 1, end: y };
}

function fyDateRange(fy) {
  return {
    from: `${fy.start}-04-01`,
    to: `${fy.end}-03-31`,
    label: `FY ${fy.start}-${String(fy.end).slice(2)}`,
  };
}

const DATE_PRESETS = (() => {
  const today = new Date();
  const curFY = getIndianFY(today);
  const prevFY = { start: curFY.start - 1, end: curFY.end - 1 };
  const fmt = (d) => format(d, 'yyyy-MM-dd');

  const sub = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };
  return [
    { id: 'curFY', ...fyDateRange(curFY), label: `Current ${fyDateRange(curFY).label}` },
    { id: 'prevFY', ...fyDateRange(prevFY), label: `Prev ${fyDateRange(prevFY).label}` },
    { id: '3m', from: fmt(sub(90)), to: fmt(today), label: 'Last 3 months' },
    { id: '6m', from: fmt(sub(180)), to: fmt(today), label: 'Last 6 months' },
    { id: '1y', from: fmt(sub(365)), to: fmt(today), label: 'Last 1 year' },
    { id: 'all', from: '2000-01-01', to: fmt(today), label: 'All time' },
    { id: 'custom', from: '', to: '', label: 'Custom range' },
  ];
})();

/** Aging bucket */
function agingBucket(dueDateStr) {
  if (!dueDateStr) return null;
  const days = differenceInDays(startOfDay(new Date()), startOfDay(parseISO(dueDateStr)));
  if (days <= 0) return null;
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

// ─── Avatar helper ──────────────────────────────────────────────────────────
const AVATAR_GRADS = [
  ['#0D3B66', '#1F6FB2'],
  ['#064e3b', '#059669'],
  ['#7c2d12', '#ea580c'],
  ['#4c1d95', '#7c3aed'],
  ['#881337', '#e11d48'],
  ['#134e4a', '#0d9488'],
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
      <span className="bg-yellow-200 px-0.5 rounded">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// CLIENT COMBOBOX
// ════════════════════════════════════════════════════════════════════════════
function ClientCombobox({ clients, value, onChange, isDark }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocus] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find((c) => c.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 60);
    return clients
      .filter(
        (c) =>
          (c.company_name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q)
      )
      .slice(0, 40);
  }, [clients, query]);

  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (c) => {
    onChange(c?.id || null);
    setOpen(false);
    setQuery('');
    setFocus(-1);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 20);
        }}
        className={`w-full flex items-center gap-2.5 h-11 px-3 rounded-2xl border text-sm transition-all outline-none cursor-pointer
          ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 hover:border-slate-500' : 'bg-white border-slate-200 hover:border-blue-300'}
          ${open ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : ''}`}
      >
        {selected ? (
          <>
            <div
              className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-lg font-semibold flex-shrink-0"
              style={{ background: avatarGrad(selected.company_name) }}
            >
              {selected.company_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{selected.company_name}</div>
              <div className="text-xs text-slate-400 truncate">
                {selected.phone || selected.email || ''}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-500 text-slate-400 flex-shrink-0"
            >
              ✕
            </button>
          </>
        ) : (
          <div className="flex-1 flex items-center gap-2 text-slate-400">
            <Search className="w-4 h-4" />
            Search party / client…
          </div>
        )}
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </div>

      {open && (
        <div
          className={`absolute z-50 w-full mt-1 bg-white border rounded-3xl shadow-xl py-1 max-h-[320px] overflow-auto ${
            isDark ? 'bg-slate-800 border-slate-700' : ''
          }`}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFocus(-1);
            }}
            placeholder="Type name, phone or email…"
            className={`w-full mx-2 mb-2 px-3 h-9 text-sm outline-none rounded-2xl border ${
              isDark ? 'bg-slate-700 text-slate-100 border-slate-600' : 'bg-white border-slate-200'
            }`}
          />

          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-4 top-12 text-slate-300 hover:text-slate-500"
            >
              ✕
            </button>
          )}

          {filtered.length === 0 && query ? (
            <div className="px-4 py-6 text-center text-slate-400">No match for &quot;{query}&quot;</div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                onClick={() => pick(c)}
                onMouseEnter={() => setFocus(i)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b last:border-0 transition-all ${
                  isDark ? 'border-slate-700' : 'border-slate-100'
                } ${
                  i === focused
                    ? isDark
                      ? 'bg-blue-900/30'
                      : 'bg-blue-50'
                    : isDark
                    ? 'hover:bg-slate-700/40'
                    : 'hover:bg-slate-50'
                } ${c.id === value ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/70') : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-lg font-semibold flex-shrink-0"
                  style={{ background: avatarGrad(c.company_name) }}
                >
                  {c.company_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{c.company_name}</div>
                  <div className="text-xs text-slate-400 flex gap-3">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                </div>
                {c.id === value && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEDGER ENGINE
// ════════════════════════════════════════════════════════════════════════════
function buildLedger(invoices, paymentsMap, openingBalance, dateFrom, dateTo) {
  const entries = [];
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;

  const inRange = (dateStr) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Opening balance
  entries.push({
    id: 'opening',
    date: dateFrom || '2000-01-01',
    type: 'opening',
    ref: '',
    narration: 'Opening Balance',
    dr: openingBalance > 0 ? openingBalance : 0,
    cr: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    sourceId: null,
  });

  // Invoice & payment entries
  invoices.forEach((inv) => {
    if (!inRange(inv.invoice_date)) return;

    const meta = ENTRY_TYPE_META[inv.invoice_type] || ENTRY_TYPE_META.invoice;

    if (meta.side === 'Dr') {
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.invoice_date,
        type: inv.invoice_type,
        ref: inv.invoice_no || '—',
        narration: `${meta.label}${inv.reference_no ? ` | Ref: ${inv.reference_no}` : ''}`,
        dr: inv.grand_total || 0,
        cr: 0,
        sourceId: inv.id,
        dueDate: inv.due_date,
        status: inv.status,
      });
    }
    if (meta.side === 'Cr' && inv.invoice_type === 'credit_note') {
      entries.push({
        id: `cn-${inv.id}`,
        date: inv.invoice_date,
        type: 'credit_note',
        ref: inv.invoice_no || '—',
        narration: 'Credit Note',
        dr: 0,
        cr: inv.grand_total || 0,
        sourceId: inv.id,
      });
    }

    const pmts = paymentsMap[inv.id] || [];
    pmts.forEach((pmt) => {
      if (!inRange(pmt.payment_date)) return;
      entries.push({
        id: `pmt-${pmt.id}`,
        date: pmt.payment_date,
        type: 'payment',
        ref: pmt.reference_no || `PMT/${pmt.id?.slice(0, 6)?.toUpperCase() || '—'}`,
        narration: `Payment Received${pmt.payment_mode ? ` via ${pmt.payment_mode.toUpperCase()}` : ''}${pmt.notes ? ` | ${pmt.notes}` : ''}`,
        dr: 0,
        cr: pmt.amount || 0,
        sourceId: inv.id,
      });
    });
  });

  // Sort
  entries.sort((a, b) => {
    if (a.type === 'opening') return -1;
    if (b.type === 'opening') return 1;
    const da = new Date(a.date);
    const db = new Date(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    if (a.type === 'payment' && b.type !== 'payment') return 1;
    if (b.type === 'payment' && a.type !== 'payment') return -1;
    return 0;
  });

  // Running balance
  let balance = 0;
  return entries.map((entry) => {
    balance += entry.dr - entry.cr;
    return {
      ...entry,
      runningBalance: balance,
      balanceSide: balance >= 0 ? 'Dr' : 'Cr',
    };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PRINT LEDGER (also used for PDF – user saves as PDF from dialog)
// ════════════════════════════════════════════════════════════════════════════
function printLedger(rows, client, company, dateFrom, dateTo, openingBal) {
  const closingRow = rows[rows.length - 1];
  const closingBal = closingRow ? Math.abs(closingRow.runningBalance) : 0;
  const closingSide = closingRow?.balanceSide || 'Dr';
  const totalDr = rows.reduce((s, r) => s + r.dr, 0);
  const totalCr = rows.reduce((s, r) => s + r.cr, 0);
  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'dd-MMM-yyyy')} to ${format(new Date(dateTo), 'dd-MMM-yyyy')}`
    : 'All time';

  const rowsHtml = rows
    .map((r) => {
      const isOpening = r.type === 'opening';
      const meta = ENTRY_TYPE_META[r.type] || ENTRY_TYPE_META.invoice;
      return `
        <tr style="page-break-inside: avoid;">
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:left;">${isOpening ? '' : format(new Date(r.date), 'dd-MMM-yy')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:left;font-weight:500;">${r.narration}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:center;">${r.ref}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right;">${r.dr > 0 ? fmtN(r.dr) : '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right;">${r.cr > 0 ? fmtN(r.cr) : '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">${fmtN(Math.abs(r.runningBalance))}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:center;">${r.balanceSide}</td>
        </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Party Ledger</title>
  <style>
    @page { margin: 15mm; size: A4 landscape; }
    body { font-family: Arial, sans-serif; margin:0; padding:20px; }
    .header { text-align:center; margin-bottom:20px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#0D3B66; color:white; padding:10px; text-align:left; }
    td { padding:8px 12px; border-bottom:1px solid #ddd; }
    .total-row { background:#f1f5f9; font-weight:700; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;color:#0D3B66;">Ledger Reconciliation</h1>
    <p style="margin:5px 0;font-size:15px;"><strong>Party:</strong> ${client?.company_name || '—'}</p>
    <p style="margin:5px 0;font-size:13px;"><strong>Company:</strong> ${company?.name || ''} | Period: ${periodLabel}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Voucher No.</th>
        <th>Debit (₹)</th>
        <th>Credit (₹)</th>
        <th>Balance (₹)</th>
        <th>Dr/Cr</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right;font-weight:700;">CLOSING BALANCE</td>
        <td style="text-align:right;">${fmtN(totalDr)}</td>
        <td style="text-align:right;">${fmtN(totalCr)}</td>
        <td style="text-align:right;">${fmtN(closingBal)}</td>
        <td style="text-align:center;">${closingSide}</td>
      </tr>
    </tfoot>
  </table>
  <p style="text-align:center;margin-top:30px;font-size:11px;color:#666;">This is a computer-generated document.</p>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1300,height=900');
  if (!win) {
    toast.error('Please allow pop-ups');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

// ════════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT – EXACT MATCH TO ATTACHED FORMAT
// ════════════════════════════════════════════════════════════════════════════
function exportLedgerReconciliationExcel(rows, client, company, dateFrom, dateTo, openingBalance) {
  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom), 'dd-MMM-yyyy')} – ${format(new Date(dateTo), 'dd-MMM-yyyy')}`
    : 'All time';

  const closingRow = rows[rows.length - 1];
  const closingBal = closingRow ? Math.abs(closingRow.runningBalance) : 0;
  const closingSide = closingRow?.balanceSide || 'Dr';

  // Totals exclude opening balance
  const totalDr = rows.filter((r) => r.type !== 'opening').reduce((s, r) => s + r.dr, 0);
  const totalCr = rows.filter((r) => r.type !== 'opening').reduce((s, r) => s + r.cr, 0);

  const sheetData = [
    ['Ledger Reconciliation', '', '', '', '', '', '', '', '', '', '', ''],
    [],
    [`Company Name:`, company?.name || '', '', '', '', '', '', '', '', '', '', ''],
    [`Address:`, company?.address || '', '', '', '', '', '', '', '', '', '', ''],
    [],
    [`Phone No.:`, company?.phone || client?.phone || '', '', '', '', '', '', 'Email ID:', company?.email || client?.email || '', '', '', ''],
    [`To:`, client?.company_name || '', '', '', '', '', '', '', '', '', '', ''],
    [`Time Period:`, periodLabel, '', '', '', '', '', '', '', 'Created By:', 'System', '', ''],
    [],
    ['Date', 'Description', '', '', '', 'Debit', '', 'Credit', '', 'Dr or Cr', '', 'Closing Balance'],
    // Opening Balance
    ['', 'Opening Balance', '', '', '', '', '', '', '', '', '', openingBalance || 0],
  ];

  // Transaction rows
  rows.forEach((r) => {
    if (r.type === 'opening') return;
    const dateStr = r.date ? format(new Date(r.date), 'dd/MM/yyyy') : '';
    sheetData.push([
      dateStr,
      r.narration,
      '',
      '',
      '',
      r.dr > 0 ? r.dr : '',
      '',
      r.cr > 0 ? r.cr : '',
      '',
      r.balanceSide,
      '',
      Math.abs(r.runningBalance),
    ]);
  });

  // Closing & Total rows
  sheetData.push(['', 'Closing Balance', '', '', '', '', '', '', '', '', '', closingBal]);
  sheetData.push(['', 'Total', '', '', '', totalDr, '', totalCr, '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths to match attached file exactly
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 45 }, // Description
    { wch: 5 },
    { wch: 5 },
    { wch: 5 },
    { wch: 14 }, // Debit
    { wch: 5 },
    { wch: 14 }, // Credit
    { wch: 5 },
    { wch: 9 }, // Dr or Cr
    { wch: 5 },
    { wch: 16 }, // Closing Balance
  ];

  // Format date column as real date
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 10; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
    if (cell && cell.v && typeof cell.v === 'string' && cell.v.includes('/')) {
      cell.t = 'd';
      cell.z = 'dd/mm/yyyy';
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger');

  const clientName = (client?.company_name || 'party').replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `Ledger_Reconciliation_${clientName}_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);

  toast.success(`Ledger exported in Reconciliation format`);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function PartyLedger({
  open,
  onClose,
  invoices = [],
  clients = [],
  companies = [],
  preselectedClientName = null,
  isDark,
}) {
  const [clientId, setClientId] = useState(null);
  const [presetId, setPresetId] = useState('curFY');
  const [dateFrom, setDateFrom] = useState(DATE_PRESETS[0].from);
  const [dateTo, setDateTo] = useState(DATE_PRESETS[0].to);
  const [openingBal, setOpeningBal] = useState(0);
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loadingPmts, setLoadingPmts] = useState(false);

  // Pre-select client
  useEffect(() => {
    if (open && preselectedClientName) {
      const match = clients.find(
        (c) => c.company_name?.toLowerCase() === preselectedClientName.toLowerCase()
      );
      if (match) setClientId(match.id);
    }
    if (open && !preselectedClientName) setClientId(null);
  }, [open, preselectedClientName, clients]);

  const clientInvoices = useMemo(() => {
    if (!clientId) return [];
    const client = clients.find((c) => c.id === clientId);
    if (!client) return [];
    return invoices.filter(
      (inv) => inv.client_name === client.company_name || inv.client_id === clientId
    );
  }, [invoices, clientId, clients]);

  // Fetch payments
  useEffect(() => {
    if (!clientInvoices.length) {
      setPaymentsMap({});
      return;
    }
    setLoadingPmts(true);
    Promise.all(
      clientInvoices.map((inv) =>
        api
          .get('/payments', { params: { invoice_id: inv.id } })
          .then((r) => [inv.id, r.data || []])
          .catch(() => [inv.id, []])
      )
    ).then((results) => {
      const map = {};
      results.forEach(([id, pmts]) => {
        map[id] = pmts;
      });
      setPaymentsMap(map);
    }).finally(() => setLoadingPmts(false));
  }, [clientInvoices]);

  const handlePreset = useCallback((id) => {
    setPresetId(id);
    const p = DATE_PRESETS.find((d) => d.id === id);
    if (p && id !== 'custom') {
      setDateFrom(p.from);
      setDateTo(p.to);
    }
  }, []);

  const rows = useMemo(
    () => buildLedger(clientInvoices, paymentsMap, Number(openingBal) || 0, dateFrom, dateTo),
    [clientInvoices, paymentsMap, openingBal, dateFrom, dateTo]
  );

  const summary = useMemo(() => {
    const invoicedTotal = clientInvoices.reduce((s, i) => s + (i.invoice_type === 'credit_note' ? 0 : i.grand_total || 0), 0);
    const receivedTotal = clientInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
    const outstanding = clientInvoices.reduce((s, i) => s + (i.amount_due || 0), 0);
    const overdueAmt = clientInvoices
      .filter((i) => i.amount_due > 0 && i.due_date && differenceInDays(new Date(), parseISO(i.due_date)) > 0)
      .reduce((s, i) => s + i.amount_due, 0);

    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    clientInvoices.forEach((inv) => {
      if (inv.amount_due <= 0) return;
      const bucket = agingBucket(inv.due_date);
      if (bucket) aging[bucket] += inv.amount_due;
    });

    const closingRow = rows[rows.length - 1];
    const closingBal = closingRow ? Math.abs(closingRow.runningBalance) : 0;
    const closingSide = closingRow?.balanceSide || 'Dr';
    const totalDr = rows.reduce((s, r) => s + r.dr, 0);
    const totalCr = rows.reduce((s, r) => s + r.cr, 0);

    return { invoicedTotal, receivedTotal, outstanding, overdueAmt, aging, closingBal, closingSide, totalDr, totalCr };
  }, [rows, clientInvoices]);

  const selectedClient = clients.find((c) => c.id === clientId) || null;
  const selectedCompany = companies[0] || null;

  const handlePrint = () => printLedger(rows, selectedClient, selectedCompany, dateFrom, dateTo, openingBal);
  const handleExportExcel = () =>
    exportLedgerReconciliationExcel(rows, selectedClient, selectedCompany, dateFrom, dateTo, openingBal);

  const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block';
  const inputCls = `h-9 rounded-2xl text-sm border-slate-200 focus:border-blue-400 focus:ring-blue-200 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-7xl max-h-[95vh] p-0 overflow-hidden rounded-3xl border-0 shadow-2xl ${
          isDark ? 'bg-slate-900' : 'bg-white'
        }`}
      >
        <div className="px-8 pt-6 pb-4 border-b flex items-center justify-between">
          <div>
            <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
              <BookOpen className="w-6 h-6" />
              Party Ledger
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              Complete reconciliation • Invoice • Payment • Credit/Debit Note
            </DialogDescription>
          </div>

          {selectedClient && rows.length > 1 && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleExportExcel}
                variant="outline"
                className="gap-2 h-9"
              >
                <Download className="w-4 h-4" />
                Excel (Reconciliation Format)
              </Button>
              <Button
                onClick={handlePrint}
                variant="default"
                className="gap-2 h-9 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
              >
                <Printer className="w-4 h-4" />
                Print / Export PDF
              </Button>
              <Button onClick={onClose} variant="ghost" size="icon">
                <X className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>

        {/* FILTERS */}
        <div className="px-8 py-5 grid grid-cols-12 gap-6 border-b">
          {/* Client */}
          <div className="col-span-5">
            <span className={labelCls}>Party / Client</span>
            <ClientCombobox clients={clients} value={clientId} onChange={setClientId} isDark={isDark} />
          </div>

          {/* Period */}
          <div className="col-span-4">
            <span className={labelCls}>Period</span>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                <Button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  variant={presetId === p.id ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs font-medium ${presetId === p.id ? 'bg-blue-600 text-white' : ''}`}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom + Opening */}
          <div className="col-span-3">
            <span className={labelCls}>Custom Range / Opening Balance</span>
            <div className="flex items-center gap-3">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPresetId('custom');
                }}
                className={inputCls}
              />
              <span className="text-slate-400">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPresetId('custom');
                }}
                className={inputCls}
              />
              <div className="flex-1" />
              <div className="text-right">
                <span className={labelCls}>Opening (₹)</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                  <Input
                    type="number"
                    value={openingBal}
                    onChange={(e) => setOpeningBal(parseFloat(e.target.value) || 0)}
                    className={`${inputCls} pl-7`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        {!selectedClient ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Search className="w-12 h-12 mb-4" />
            <p className="text-lg">Select a party to view ledger</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Client header + summary */}
            <div className="px-8 py-4 bg-gradient-to-r from-blue-50 to-white flex items-center gap-6 border-b">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-3xl font-bold flex-shrink-0"
                style={{ background: avatarGrad(selectedClient.company_name) }}
              >
                {selectedClient.company_name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-xl">{selectedClient.company_name}</div>
                <div className="flex gap-6 text-sm text-slate-500">
                  {selectedClient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" /> {selectedClient.phone}
                    </span>
                  )}
                  {selectedClient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" /> {selectedClient.email}
                    </span>
                  )}
                  {selectedClient.client_gstin && <span>GSTIN: {selectedClient.client_gstin}</span>}
                </div>
              </div>

              {/* Summary cards */}
              <div className="flex gap-3">
                {[
                  { label: 'Total Invoiced', val: fmtC(summary.totalDr), color: '#1F6FB2' },
                  { label: 'Total Received', val: fmtC(summary.totalCr), color: '#059669' },
                  {
                    label: 'Outstanding',
                    val: `${fmtC(summary.closingBal)} ${summary.closingSide}`,
                    color: summary.closingSide === 'Dr' ? '#DC2626' : '#059669',
                  },
                  { label: 'Overdue', val: fmtC(summary.overdueAmt), color: '#D97706' },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="bg-white border rounded-2xl px-5 py-3 min-w-[160px] shadow-sm"
                  >
                    <div className="text-xs text-slate-400">{s.label}</div>
                    <div className="text-2xl font-semibold" style={{ color: s.color }}>
                      {s.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ledger Table – PERFECT ALIGNMENT */}
            <div className="flex-1 px-8 py-2 overflow-auto">
              {loadingPmts ? (
                <div className="flex items-center justify-center h-64 text-slate-400">
                  Loading payment records…
                </div>
              ) : rows.length <= 1 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  No transactions in selected period
                </div>
              ) : (
                <div className="overflow-x-auto rounded-3xl border">
                  <table className="w-full table-fixed border-collapse min-w-[1100px]">
                    <thead>
                      <tr className="bg-slate-100 text-xs font-medium text-slate-500">
                        <th className="w-24 px-4 py-3 text-left">Date</th>
                        <th className="w-96 px-4 py-3 text-left">Description</th>
                        <th className="w-32 px-4 py-3 text-center">Voucher No.</th>
                        <th className="w-28 px-4 py-3 text-right">Debit (₹)</th>
                        <th className="w-28 px-4 py-3 text-right">Credit (₹)</th>
                        <th className="w-28 px-4 py-3 text-right">Balance (₹)</th>
                        <th className="w-16 px-4 py-3 text-center">Dr/Cr</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {rows.map((row, idx) => {
                        const isOpening = row.type === 'opening';
                        const meta = ENTRY_TYPE_META[row.type] || ENTRY_TYPE_META.invoice;
                        return (
                          <tr
                            key={row.id}
                            className={`border-b last:border-0 transition-colors ${
                              isOpening
                                ? 'bg-blue-50 font-medium'
                                : idx % 2 === 0
                                ? 'bg-white'
                                : 'bg-slate-50'
                            }`}
                          >
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {isOpening ? '' : format(new Date(row.date), 'dd MMM yy')}
                            </td>
                            <td className="px-4 py-3 font-medium truncate">{row.narration}</td>
                            <td className="px-4 py-3 text-center text-slate-500">{row.ref}</td>
                            <td className="px-4 py-3 text-right font-medium text-blue-700">
                              {row.dr > 0 ? fmtN(row.dr) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-700">
                              {row.cr > 0 ? fmtN(row.cr) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {fmtN(Math.abs(row.runningBalance))}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-block px-3 py-0.5 text-xs font-bold rounded-full ${
                                  row.balanceSide === 'Dr'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {row.balanceSide}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-600 text-white text-sm font-medium">
                        <td colSpan={3} className="px-4 py-4 text-right">
                          CLOSING BALANCE
                        </td>
                        <td className="px-4 py-4 text-right">{fmtN(summary.totalDr)}</td>
                        <td className="px-4 py-4 text-right">{fmtN(summary.totalCr)}</td>
                        <td className="px-4 py-4 text-right font-bold">{fmtN(summary.closingBal)}</td>
                        <td className="px-4 py-4 text-center font-bold">{summary.closingSide}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Footer info */}
            {selectedClient && rows.length > 1 && (
              <div className="px-8 py-3 text-xs text-slate-400 flex justify-between border-t">
                <div>
                  {rows.length - 1} transaction{rows.length !== 2 ? 's' : ''} • Period:{' '}
                  {dateFrom ? format(new Date(dateFrom), 'dd-MMM-yyyy') : '—'} to{' '}
                  {dateTo ? format(new Date(dateTo), 'dd-MMM-yyyy') : '—'}
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="outline" onClick={handleExportExcel} className="h-8 text-xs">
                    Export Excel
                  </Button>
                  <Button onClick={handlePrint} className="h-8 text-xs bg-gradient-to-r from-blue-600 to-indigo-600">
                    Print / Save as PDF
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
