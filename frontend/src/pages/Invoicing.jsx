import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  format,
  parseISO,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

// Root Component Wrapper (since earlier HTML used #root)
function InvoicingApp() {
  return (
    <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Your existing components/code will continue below this */}
    </div>
  );
}

export default InvoicingApp;

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
            item_details: '',
        });

        // ─── Item Memory (localStorage) ───────────────────────────────────────────────
        const getItemMemory = () => {
            try { return JSON.parse(localStorage.getItem('inv_item_memory') || '{}'); }
            catch { return {}; }
        };
        const saveItemMemory = (items = []) => {
            try {
                const mem = getItemMemory();
                items.forEach(it => {
                    const key = (it.description || '').trim().toLowerCase();
                    if (key) mem[key] = { description: it.description, unit_price: it.unit_price, gst_rate: it.gst_rate, unit: it.unit, hsn_sac: it.hsn_sac };
                });
                localStorage.setItem('inv_item_memory', JSON.stringify(mem));
            } catch {}
        };

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

        // ─── DriveUploadBtn component ─────────────────────────────────────────
        const DriveUploadBtn = ({ invoiceId, invoiceNo }) => {
            const [loading, setLoading] = React.useState(false);
            const handleDriveUpload = async () => {
                setLoading(true);
                try {
                    // Mock API call for demo
                    await new Promise(r => setTimeout(r, 800));
                    const drive_link = 'https://drive.google.com/file/d/1demo';
                    if (drive_link) {
                        alert('Saved to Google Drive ✅');
                        if (window.confirm('Open in Google Drive?')) {
                            window.open(drive_link, '_blank');
                        }
                    }
                } catch (err) {
                    alert('Drive upload failed');
                } finally {
                    setLoading(false);
                }
            };
            return (
                <button
                    onClick={handleDriveUpload}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                    {loading ? (
                        <span className="w-3.5 h-3.5 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <i className="fas fa-external-link-alt text-xs"></i>
                    )}
                    {loading ? 'Uploading…' : 'Save to Drive'}
                </button>
            );
        };

        // CLIENT SEARCH COMBOBOX
        const ClientSearchCombobox = ({ clients = [], value, onSelect, onAddNew, isDark }) => {
            const [open, setOpen] = React.useState(false);
            const [query, setQuery] = React.useState('');
            const [focused, setFocused] = React.useState(-1);
            const wrapRef = React.useRef(null);
            const inputRef = React.useRef(null);
            const listRef = React.useRef(null);
            const selected = clients.find(c => c.id === value) || null;
            const filtered = React.useMemo(() => {
                const q = query.trim().toLowerCase();
                if (!q) return clients.slice(0, 50);
                return clients.filter(c =>
                    (c.company_name || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q) ||
                    (c.phone || '').includes(q) ||
                    (c.client_gstin || '').toLowerCase().includes(q)
                ).slice(0, 40);
            }, [clients, query]);

            React.useEffect(() => {
                const h = (e) => {
                    if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                        setOpen(false); setQuery(''); setFocused(-1);
                    }
                };
                document.addEventListener('mousedown', h);
                return () => document.removeEventListener('mousedown', h);
            }, []);

            React.useEffect(() => {
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
                                    <i className="fas fa-times text-xs"></i>
                                </span>
                            )}
                            <i className={`fas fa-chevron-down text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}></i>
                        </div>
                    </button>
                    {open && (
                        <div className={`absolute z-50 w-full mt-1.5 rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
                            style={{ maxHeight: 340 }}>
                            <div className={`flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100'}`}>
                                <i className="fas fa-search text-slate-400"></i>
                                <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setFocused(-1); }}
                                    placeholder="Type name, GSTIN, phone or email…"
                                    className={`flex-1 text-sm outline-none placeholder:text-slate-400 bg-transparent ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
                                    autoComplete="off" />
                                {query && (
                                    <button type="button" onClick={() => { setQuery(''); setFocused(-1); inputRef.current?.focus(); }}
                                        className="text-slate-300 hover:text-slate-500">
                                        <i className="fas fa-times text-xs"></i>
                                    </button>
                                )}
                            </div>
                            <div ref={listRef} className="overflow-y-auto flex-1">
                                {filtered.length === 0 && query ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                                        <i className="fas fa-search text-2xl opacity-30 mb-2"></i>
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
                                                            <i className="fas fa-phone text-xs"></i><Hl text={c.phone} query={query} />
                                                        </span>
                                                    )}
                                                    {c.email && (
                                                        <span className="flex items-center gap-1 text-[10px] text-slate-400 max-w-[180px] truncate">
                                                            <i className="fas fa-envelope text-xs"></i><Hl text={c.email} query={query} />
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
                                        <i className="fas fa-plus text-white text-xs"></i>
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

        // GST REPORTS MODAL
        const GSTReportsModal = ({ open, onClose, invoices = [], isDark }) => {
            const [tab, setTab] = React.useState('gstr1');
            const [month, setMonth] = React.useState(format(new Date(), 'yyyy-MM'));
            const monthInvoices = React.useMemo(() =>
                invoices.filter(inv =>
                    inv.invoice_date?.startsWith(month) &&
                    ['tax_invoice','credit_note','debit_note'].includes(inv.invoice_type) &&
                    inv.status !== 'cancelled'
                ), [invoices, month]);

            const gstr1 = React.useMemo(() => {
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

            const gstr3b = React.useMemo(() => {
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
                if (gstr1.hsnSummary.length) {
                    const rows = [['GSTR-1 HSN/SAC Summary'], [`Period: ${periodLabel}`], [],
                        ['HSN/SAC','Description','UQC','Total Quantity','Total Value (₹)','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST/UTGST (₹)','Cess (₹)'],
                        ...gstr1.hsnSummary.map(h => [h.hsn_sac,h.description,'NOS',Math.round(h.quantity*100)/100,Math.round((h.taxable+h.total_tax)*100)/100,Math.round(h.taxable*100)/100,Math.round(h.igst*100)/100,Math.round(h.cgst*100)/100,Math.round(h.sgst*100)/100,0]),
                    ];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'HSN');
                }
                XLSX.writeFile(wb, `GSTR1_${periodLabel}.xlsx`);
                alert(`GSTR-1 exported for ${periodLabel}`);
            }, [gstr1, month]);

            const exportGSTR3B = useCallback(() => {
                const [yr, mo] = month.split('-');
                const periodLabel = format(new Date(parseInt(yr), parseInt(mo) - 1, 1), 'MMM-yyyy');
                const rows = [
                    [`GSTR-3B Return — ${periodLabel}`], [],
                    ['3.1 DETAILS OF OUTWARD SUPPLIES AND INWARD SUPPLIES LIABLE TO REVERSE CHARGE'], [],
                    ['Nature of Supplies','Total Taxable Value (₹)','Integrated Tax (₹)','Central Tax (₹)','State/UT Tax (₹)','Cess (₹)'],
                    ['(a) Outward taxable supplies',fmt(gstr3b.outward.taxable),fmt(gstr3b.outward.igst),fmt(gstr3b.outward.cgst),fmt(gstr3b.outward.sgst),'0.00'],
                    [], ['NET TAX PAYABLE',fmt(gstr3b.netTotal),'','','',fmt(gstr3b.netTotal)],
                ];
                const ws = XLSX.utils.aoa_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B');
                XLSX.writeFile(wb, `GSTR3B_${periodLabel}.xlsx`);
                alert(`GSTR-3B exported for ${periodLabel}`);
            }, [gstr3b, month]);

            const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400";
            const rowCls = (isDark ? 'border-slate-700' : 'border-slate-100') + ' border-b last:border-0';
            const cellCls = `px-4 py-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
            const numCls = `px-4 py-3 text-sm font-semibold text-right ${isDark ? 'text-slate-200' : 'text-slate-800'}`;
            const thCls = `px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400 bg-slate-700/50' : 'text-slate-400 bg-slate-50'}`;
            const TABS = [
                { id: 'gstr1', label: 'GSTR-1', sub: 'Outward Supplies', icon: 'fas fa-file-spreadsheet' },
                { id: 'gstr3b', label: 'GSTR-3B', sub: 'Summary Return', icon: 'fas fa-chart-bar' },
                { id: 'gstr2b', label: 'GSTR-2B', sub: 'ITC Statement', icon: 'fas fa-exchange-alt' },
            ];

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
                    <div className={`max-w-5xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        {/* Header */}
                        <div className="px-7 py-5 relative overflow-hidden flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)' }}>
                            <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center"><i className="fas fa-file-spreadsheet text-white text-xl"></i></div>
                                    <div><h2 className="text-white font-bold text-xl">GST Returns</h2><p className="text-emerald-200 text-xs mt-0.5">Generate & export GSTR-1 · GSTR-3B · GSTR-2B</p></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                                        className="h-9 px-3 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-semibold outline-none" />
                                    <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"><i className="fas fa-times text-white"></i></button>
                                </div>
                            </div>
                            <div className="relative mt-5 flex gap-1">
                                {TABS.map(t => (
                                    <button key={t.id} onClick={() => setTab(t.id)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                                        <i className={`${t.icon} text-xs`}></i><span>{t.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {monthInvoices.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <i className="fas fa-file-spreadsheet text-5xl opacity-30 mb-3"></i>
                                    <p className="text-sm font-medium">No invoices for this period</p>
                                </div>
                            ) : tab === 'gstr1' ? (
                                <div className="space-y-5">
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
                                            <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
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
                                                                <td className={`${cellCls} font-mono font-bold text-blue-600`}>{inv.invoice_no}</td>
                                                                <td className={cellCls}>{inv.invoice_date}</td>
                                                                <td className={numCls}>{fmtC(inv.grand_total)}</td>
                                                                <td className={numCls}>{fmtC(inv.total_taxable)}</td>
                                                                <td className={numCls}>{fmtC(inv.total_igst)}</td>
                                                                <td className={numCls}>{fmtC(inv.total_cgst)}</td>
                                                                <td className={numCls}>{fmtC(inv.total_sgst)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : tab === 'gstr3b' ? (
                                <div className="space-y-5">
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
                                        <p className={`text-3xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>{fmtC(gstr3b.netTotal)}</p>
                                        <p className="text-xs text-slate-500 mt-1">Net Tax Payable</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
                                    <i className="fas fa-exchange-alt text-4xl text-blue-500"></i>
                                    <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>GSTR-2B — Auto-Drafted ITC Statement</p>
                                    <p className="text-sm text-slate-400 mt-2 max-w-md">Auto-generated by the GST portal based on your suppliers' filings.</p>
                                    <button onClick={() => window.open('https://gst.gov.in', '_blank')} className="h-10 px-6 rounded-xl text-white font-semibold flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                                        <i className="fas fa-arrow-up-right-from-square"></i> Open GST Portal
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                            <p className="text-xs text-slate-400">{monthInvoices.length} invoices · {format(new Date(month + '-01'), 'MMMM yyyy')}</p>
                            <div className="flex gap-2">
                                <button onClick={onClose} className="h-9 px-4 text-sm rounded-xl text-slate-500">Close</button>
                                {tab === 'gstr1' && <button onClick={exportGSTR1} disabled={monthInvoices.length === 0} className="h-9 px-5 text-sm rounded-xl text-white font-semibold flex items-center gap-2" style={{ background: monthInvoices.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #064e3b, #065f46)' }}><i className="fas fa-download"></i> Export GSTR-1</button>}
                                {tab === 'gstr3b' && <button onClick={exportGSTR3B} disabled={monthInvoices.length === 0} className="h-9 px-5 text-sm rounded-xl text-white font-semibold flex items-center gap-2" style={{ background: monthInvoices.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #064e3b, #065f46)' }}><i className="fas fa-download"></i> Export GSTR-3B</button>}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // EXCEL IMPORT HANDLER (NEW)
        const handleExcelImport = async (file) => {
            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);

                if (!rows.length) {
                    alert("Empty file");
                    return;
                }

                const invoices = rows.map((row, idx) => ({
                    invoice_no: row["Invoice No"] || `IMP-${Date.now()}-${idx}`,
                    invoice_date: row["Date"] || new Date().toISOString().slice(0, 10),
                    client_name: row["Party Name"] || "Walk-in",
                    client_phone: row["Phone"] || "",
                    items: [{
                        description: row["Item"] || "Imported Item",
                        quantity: Number(row["Qty"] || 1),
                        unit_price: Number(row["Rate"] || 0),
                        total_amount: Number(row["Amount"] || 0)
                    }],
                    grand_total: Number(row["Amount"] || 0),
                    status: "draft"
                }));

                // Mock API call
                await new Promise(r => setTimeout(r, 1200));
                alert(`Imported ${invoices.length} invoices successfully`);
                window.location.reload();
            } catch (err) {
                alert("Import failed");
            }
        };

        // UNIFIED IMPORT MODAL
        const ImportModal = ({ open, onClose, isDark, companies, onImportComplete }) => {
            const [step, setStep] = React.useState('choose');
            const [importMode, setImportMode] = React.useState('');
            const [file, setFile] = React.useState(null);
            const [parsed, setParsed] = React.useState(null);
            const [error, setError] = React.useState('');
            const [loading, setLoading] = React.useState(false);
            const [progress, setProgress] = React.useState(0);
            const [results, setResults] = React.useState({ imported: 0, clients: 0, skipped: 0, errors: [] });
            const [selectedFirm, setSelectedFirm] = React.useState('__none__');
            const [importClients, setImportClients] = React.useState(true);
            const [importInvoices, setImportInvoices] = React.useState(true);
            const [selectedCompanyId, setSelectedCompanyId] = React.useState('__none__');
            const dropRef = React.useRef(null);

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
                setFile(f); setError('');
            }, []);

            const handleParse = async () => {
                if (!file) return;
                setLoading(true); setError('');
                try {
                    if (importMode === 'excel') {
                        const invoices = await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const wb = XLSX.read(e.target.result, { type: 'array' });
                                const ws = wb.Sheets[wb.SheetNames[0]];
                                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                                resolve(rows);
                            };
                            reader.readAsArrayBuffer(file);
                        });
                        setParsed({ invoices, firms: [], clients: [], items: [], mode: 'excel', source_label: 'Excel/CSV' });
                    } else {
                        // Mock for other modes
                        setParsed({ invoices: [], firms: [], clients: [], items: [], mode: importMode, source_label: importMode.toUpperCase() });
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
                // Mock import
                await new Promise(r => setTimeout(r, 1800));
                res.imported = parsed.invoices?.length || 10;
                setResults(res);
                setStep('done');
                onImportComplete?.();
                alert(`Imported ${res.imported} invoice${res.imported !== 1 ? 's' : ''} successfully`);
            };

            const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={handleClose}></div>
                    <div className={`w-full max-w-xl rounded-2xl border shadow-2xl p-0 overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
                        style={{ maxHeight: '90vh' }}>
                        {/* Header */}
                        <div className="px-6 py-5 relative overflow-hidden flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                            <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0"><i className="fas fa-database text-white text-xl"></i></div>
                                    <div><h2 className="text-white font-bold text-lg leading-tight">Import Invoices</h2><p className="text-emerald-200 text-xs mt-0.5">KhataBook · Tally · Vyapar · Excel</p></div>
                                </div>
                                <button onClick={handleClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all flex-shrink-0"><i className="fas fa-times text-white"></i></button>
                            </div>
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
                                                    {isDoneStep ? <i className="fas fa-check-circle"></i> : <span className="w-3 h-3 flex items-center justify-center text-xs">{i + 1}</span>}
                                                    {['Upload', 'Preview', 'Import', 'Done'][i]}
                                                </div>
                                                {i < 3 && <div className={`flex-1 h-px ${isDoneStep ? 'bg-white/60' : 'bg-white/20'}`} />}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {/* STEP: CHOOSE MODE */}
                            {step === 'choose' && (
                                <div className="space-y-4">
                                    <p className={`text-sm font-medium text-center mb-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Choose your import source</p>
                                    {/* Excel direct import button */}
                                    <div className={`rounded-xl border-2 border-dashed p-4 ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0"><i className="fas fa-file-excel text-amber-600 text-xl"></i></div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Quick Excel Import</p>
                                                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Direct upload with standard columns</p>
                                            </div>
                                            <label htmlFor="excelUpload" className="cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".xlsx,.xls"
                                                    id="excelUpload"
                                                    onChange={(e) => {
                                                        if (e.target.files[0]) handleExcelImport(e.target.files[0]);
                                                        handleClose();
                                                    }}
                                                    className="hidden"
                                                />
                                                <button className="h-9 px-5 text-sm rounded-xl text-white font-semibold flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}>
                                                    <i className="fas fa-file-spreadsheet"></i>
                                                    Import Excel File
                                                </button>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { mode: 'vyp', icon: 'fas fa-database', title: 'KhataBook Backup (.vyp / .vyb)', desc: 'Import clients, items & invoices from KhataBook .vyp or KhataBook Pro .vyb backup', color: 'from-emerald-600 to-emerald-700', badge: 'Recommended' },
                                            { mode: 'tally', icon: 'fas fa-file-spreadsheet', title: 'Tally Export (.xml)', desc: 'Import from TallyPrime / Tally.ERP 9 XML export or .tbk backup', color: 'from-purple-600 to-purple-700', badge: 'Tally' },
                                            { mode: 'json', icon: 'fas fa-file-alt', title: 'Vyapar / JSON (.json)', desc: 'Import from Vyapar JSON export or any JSON formatted backup file', color: 'from-amber-600 to-amber-700', badge: 'Vyapar' },
                                            { mode: 'excel', icon: 'fas fa-table', title: 'Excel / CSV (.xlsx, .xls, .csv)', desc: 'Import from any spreadsheet — Sage, myBillBook, Zoho, Xero, or our template', color: 'from-blue-600 to-blue-700', badge: 'Universal' },
                                        ].map(opt => (
                                            <button key={opt.mode} type="button"
                                                onClick={() => { setImportMode(opt.mode); setStep('upload'); setError(''); setFile(null); }}
                                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:shadow-md ${isDark ? 'border-slate-600 hover:border-emerald-500 bg-slate-700/40' : 'border-slate-200 hover:border-emerald-400 bg-white'}`}>
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br ${opt.color}`}><i className={`${opt.icon} text-3xl`}></i></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{opt.title}</p>
                                                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{opt.badge}</span>
                                                    </div>
                                                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{opt.desc}</p>
                                                </div>
                                                <i className="fas fa-chevron-right text-slate-400 flex-shrink-0"></i>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {/* STEP: UPLOAD FILE */}
                            {step === 'upload' && (
                                <div className="space-y-5">
                                    <button type="button" onClick={() => { setStep('choose'); setFile(null); setError(''); }}
                                        className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">← Back to source selection</button>
                                    <div ref={dropRef} onDrop={handleFileDrop} onDragOver={(e) => e.preventDefault()}
                                        onClick={() => {
                                            const inp = document.createElement('input'); inp.type = 'file';
                                            inp.accept = importMode === 'vyp' ? '.vyp,.vyb,.db' : importMode === 'tally' ? '.xml,.tbk' : importMode === 'excel' ? '.xlsx,.xls,.csv' : '.json';
                                            inp.onchange = handleFileDrop; inp.click();
                                        }}
                                        className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${file ? (isDark ? 'border-emerald-500 bg-emerald-900/20' : 'border-emerald-400 bg-emerald-50') : (isDark ? 'border-slate-600 bg-slate-700/30 hover:border-emerald-500' : 'border-slate-300 bg-slate-50 hover:border-emerald-400')}`}>
                                        {file ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"><i className="fas fa-check-circle text-emerald-600 text-4xl"></i></div>
                                                <div><p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{file.name}</p><p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click or drop to change</p></div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`}><i className="fas fa-upload text-slate-400 text-4xl"></i></div>
                                                <div>
                                                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Drop your file here or click to browse</p>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {importMode === 'vyp' && 'Accepts .vyp, .vyb, or .db files'}
                                                        {importMode === 'tally' && 'Accepts .xml or .tbk files'}
                                                        {importMode === 'excel' && 'Accepts .xlsx, .xls, or .csv files'}
                                                        {importMode === 'json' && 'Accepts .json files'}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {error && (
                                        <div className={`rounded-xl border p-3 flex items-start gap-2 ${isDark ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <i className="fas fa-exclamation-triangle mt-0.5"></i><p className="text-xs">{error}</p>
                                        </div>
                                    )}
                                    <button onClick={handleParse} disabled={!file || loading} className="w-full h-11 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
                                        style={{ background: !file || loading ? '#94a3b8' : 'linear-gradient(135deg, #065f46, #059669)' }}>
                                        {loading ? (
                                            <>
                                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Parsing file…
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-upload"></i>
                                                Parse & Preview
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                            {/* STEP: PREVIEW */}
                            {step === 'preview' && parsed && (
                                <div className="space-y-5">
                                    <button type="button" onClick={() => setStep('upload')} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">← Back to upload</button>
                                    <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-emerald-50 border-emerald-200'}`}>
                                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Parsed: {parsed.source_label || parsed.mode}</p>
                                        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                                            {[{ label: 'Firms', val: parsed.stats?.firms ?? parsed.firms?.length ?? 0 },
                                                { label: 'Clients', val: parsed.stats?.clients ?? parsed.clients?.length ?? 0 },
                                                { label: 'Items', val: parsed.stats?.items ?? parsed.items?.length ?? 0 },
                                                { label: 'Invoices', val: parsed.stats?.invoices ?? parsed.invoices?.length ?? 0 },
                                                { label: 'Payments', val: parsed.stats?.payments ?? parsed.payments?.length ?? 0 },
                                            ].map(s => (<div key={s.label} className="text-center"><p className={`text-xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{s.val}</p><p className="text-[10px] font-semibold text-slate-400 uppercase">{s.label}</p></div>))}
                                        </div>
                                    </div>
                                    {parsed.firms?.length > 1 && (
                                        <div>
                                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Select Firm</label>
                                            <select value={selectedFirm} onChange={e => setSelectedFirm(e.target.value)} className={inputCls}>
                                                <option value="__none__">All firms</option>
                                                {parsed.firms.map(f => <option key={f.firm_id} value={String(f.firm_id)}>{f.firm_name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Import Into Company Profile</label>
                                        <select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)} className={inputCls}>
                                            <option value="__none__">— Select later —</option>
                                            {(companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    {parsed.mode !== 'excel' && parsed.clients?.length > 0 && (
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" checked={importClients} onChange={e => setImportClients(e.target.checked)} className="w-4 h-4" />
                                            <div>
                                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Import Clients ({parsed.clients.length})</p>
                                                <p className="text-xs text-slate-400">Add as client records</p>
                                            </div>
                                        </div>
                                    )}
                                    {parsed.invoices?.length > 0 && (
                                        <div className={`rounded-xl border max-h-48 overflow-y-auto ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                                            <div className={`px-4 py-2 border-b sticky top-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Invoice Preview ({parsed.invoices.length})</p>
                                            </div>
                                            {parsed.invoices.slice(0, 20).map((inv, i) => (
                                                <div key={i} className={`flex items-center justify-between px-4 py-2 border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-50'}`}>
                                                    <div className="flex-1 min-w-0"><p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{inv.client_name || 'Unknown'}</p><p className="text-[10px] text-slate-400">{inv.invoice_no || `#${i+1}`} · {inv.invoice_date || '—'}</p></div>
                                                    <p className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>{fmtC(inv.grand_total || 0)}</p>
                                                </div>
                                            ))}
                                            {parsed.invoices.length > 20 && <div className="px-4 py-2 text-center text-xs text-slate-400">+{parsed.invoices.length - 20} more…</div>}
                                        </div>
                                    )}
                                    <button onClick={handleImport} className="w-full h-11 rounded-xl text-white font-semibold flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                                        <i className="fas fa-check-square mr-2"></i> Import {parsed.invoices?.length || 0} Invoices{importClients && parsed.clients?.length > 0 ? ` + ${parsed.clients.length} Clients` : ''}
                                    </button>
                                </div>
                            )}
                            {/* STEP: IMPORTING */}
                            {step === 'importing' && (
                                <div className="flex flex-col items-center justify-center py-10 gap-6">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><i className="fas fa-sync animate-spin text-emerald-600 text-4xl"></i></div>
                                    <div className="text-center"><p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Importing…</p><p className="text-sm text-slate-400 mt-1">Please wait while your data is being imported</p></div>
                                    <div className="w-full max-w-xs">
                                        <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #065f46, #059669)' }}></div>
                                        </div>
                                        <p className="text-center text-xs font-bold text-emerald-600 mt-2">{progress}%</p>
                                    </div>
                                </div>
                            )}
                            {/* STEP: DONE */}
                            {step === 'done' && (
                                <div className="space-y-5">
                                    <div className="flex flex-col items-center justify-center py-6 gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><i className="fas fa-check-circle text-emerald-600 text-5xl"></i></div>
                                        <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Import Complete!</p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[{ label: 'Invoices Imported', val: results.imported, color: '#1FAF5A' },
                                            { label: 'Clients Added', val: results.clients, color: '#1F6FB2' },
                                            { label: 'Skipped', val: results.skipped, color: '#F59E0B' },
                                        ].map(s => (<div key={s.label} className={`rounded-xl border p-4 text-center ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                            <p className="text-2xl font-black" style={{ color: s.color }}>{s.val}</p><p className="text-[10px] font-semibold text-slate-400 uppercase mt-1">{s.label}</p></div>))}
                                    </div>
                                    {results.errors?.length > 0 && (
                                        <div className={`rounded-xl border p-3 max-h-32 overflow-y-auto ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-2">Errors ({results.errors.length})</p>
                                            {results.errors.slice(0, 10).map((err, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>)}
                                        </div>
                                    )}
                                    <div className="flex gap-3">
                                        <button onClick={handleClose} className="flex-1 h-10 rounded-xl border">Close</button>
                                        <button onClick={() => reset()} className="flex-1 h-10 rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>Import More</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        };

        // STATUS PILL
        const StatusPill = ({ inv }) => {
            const m = getStatusMeta(inv);
            return (
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${m.bg} ${m.text} whitespace-nowrap`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`}></span>{m.label}
                </span>
            );
        };

        // STAT CARD
        const StatCard = ({ label, value, sub, icon, color, bg, onClick, isDark, trend }) => (
            <div onClick={onClick}
                className={`rounded-2xl border p-5 relative overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}>
                <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: color }}></div>
                <div className="flex items-start justify-between mb-3 pl-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}><i className={`${icon} text-xl`} style={{ color }}></i></div>
                    {trend !== undefined && (<span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{trend >= 0 ? '+' : ''}{trend}%</span>)}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1 pl-2 text-slate-400">{label}</p>
                <p className={`text-2xl font-bold tracking-tight pl-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
                {sub && <p className={`text-xs pl-2 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
            </div>
        );

        // ─── Enhanced Revenue Trend ───────────────────────────────────────────────────
        const EnhancedRevenueTrend = ({ invoices = [], isDark }) => {
            const [trendRange, setTrendRange] = React.useState('12m');
            const [customFrom, setCustomFrom] = React.useState('');
            const [customTo, setCustomTo] = React.useState('');
            const [compareEnabled, setCompareEnabled] = React.useState(false);
            const [showServiceBreakdown, setShowServiceBreakdown] = React.useState(false);
            const [selectedServices, setSelectedServices] = React.useState([]);
            const fmtAxis = v => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0);
            const getRange = useCallback(() => {
                const now = new Date();
                if (trendRange === 'custom') {
                    return {
                        start: customFrom ? new Date(customFrom + 'T00:00:00') : subMonths(now, 12),
                        end: customTo ? new Date(customTo + 'T23:59:59') : now,
                    };
                }
                const m = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[trendRange] || 12;
                return { start: subMonths(now, m), end: now };
            }, [trendRange, customFrom, customTo]);

            const getMonths = useCallback((start, end) => {
                const months = [];
                let cur = startOfMonth(start);
                while (cur <= end) {
                    months.push(format(cur, 'yyyy-MM'));
                    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
                }
                return months;
            }, []);

            const currentData = React.useMemo(() => {
                const { start, end } = getRange();
                return getMonths(start, end).map(m => {
                    const monthInvs = invoices.filter(i => i.invoice_date?.startsWith(m) && i.status !== 'cancelled');
                    let serviceRevenue = 0;
                    if (selectedServices.length > 0) {
                        monthInvs.forEach(inv => (inv.items || []).forEach(it => {
                            if (selectedServices.includes(it.description?.trim())) serviceRevenue += (it.total_amount || 0);
                        }));
                    }
                    return {
                        month: m, label: format(new Date(m + '-15'), 'MMM yy'),
                        revenue: monthInvs.reduce((s, i) => s + (i.grand_total || 0), 0),
                        collected: monthInvs.reduce((s, i) => s + (i.amount_paid || 0), 0),
                        count: monthInvs.length, serviceRevenue,
                    };
                });
            }, [invoices, trendRange, customFrom, customTo, selectedServices, getRange, getMonths]);

            const prevData = React.useMemo(() => {
                if (!compareEnabled) return [];
                const { start, end } = getRange();
                const diff = end.getTime() - start.getTime();
                const prevStart = new Date(start.getTime() - diff);
                const prevEnd = new Date(start);
                return getMonths(prevStart, prevEnd).map(m => {
                    const monthInvs = invoices.filter(i => i.invoice_date?.startsWith(m) && i.status !== 'cancelled');
                    return {
                        month: m, label: format(new Date(m + '-15'), 'MMM yy'),
                        revenue: monthInvs.reduce((s, i) => s + (i.grand_total || 0), 0),
                        collected: monthInvs.reduce((s, i) => s + (i.amount_paid || 0), 0),
                    };
                });
            }, [invoices, compareEnabled, trendRange, customFrom, customTo, getRange, getMonths]);

            const serviceBreakdown = React.useMemo(() => {
                const { start, end } = getRange();
                const startStr = format(start, 'yyyy-MM-dd'), endStr = format(end, 'yyyy-MM-dd');
                const map = {};
                invoices.filter(i => i.invoice_date >= startStr && i.invoice_date <= endStr && i.status !== 'cancelled')
                    .forEach(inv => (inv.items || []).forEach(it => {
                        const k = (it.description || 'Unknown').trim();
                        if (!map[k]) map[k] = { description: k, revenue: 0, count: 0 };
                        map[k].revenue += (it.total_amount || 0); map[k].count++;
                    }));
                return Object.values(map).sort((a, b) => b.revenue - a.revenue);
            }, [invoices, trendRange, customFrom, customTo, getRange]);

            const allServices = React.useMemo(() => {
                const s = new Set();
                invoices.forEach(inv => (inv.items || []).forEach(it => { if (it.description?.trim()) s.add(it.description.trim()); }));
                return Array.from(s).slice(0, 30);
            }, [invoices]);

            const totalRevenue = currentData.reduce((s, d) => s + d.revenue, 0);
            const totalCollected = currentData.reduce((s, d) => s + d.collected, 0);
            const prevTotal = prevData.reduce((s, d) => s + d.revenue, 0);
            const growthPct = prevTotal > 0 ? Math.round((totalRevenue - prevTotal) / prevTotal * 100) : null;

            // SVG chart
            const W = 700, H = 160, pad = { t: 20, b: 34, l: 58, r: 16 };
            const allVals = [...currentData.map(d => d.revenue), ...(compareEnabled ? prevData.map(d => d.revenue) : [])];
            const maxVal = Math.max(...allVals, 1);
            const n = currentData.length;
            const xStep = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 0;
            const yS = v => H - pad.b - (v / maxVal) * (H - pad.t - pad.b);
            const pts = currentData.map((d, i) => [pad.l + i * xStep, yS(d.revenue)]);
            const colPts = currentData.map((d, i) => [pad.l + i * xStep, yS(d.collected)]);
            const svcPts = selectedServices.length > 0 ? currentData.map((d, i) => [pad.l + i * xStep, yS(d.serviceRevenue)]) : [];
            const prevAligned = compareEnabled ? currentData.map((_, i) => prevData[i] || { revenue: 0 }) : [];
            const prevPts = prevAligned.map((d, i) => [pad.l + i * xStep, yS(d.revenue)]);
            const mkLine = pp => pp.length > 1 ? `M${pp.map(p => `${p[0]},${p[1]}`).join(' L')}` : '';
            const mkArea = pp => pp.length > 1 ? `M${pp[0][0]},${H - pad.b} L${pp.map(p => `${p[0]},${p[1]}`).join(' L')} L${pp[pp.length-1][0]},${H - pad.b} Z` : '';
            const RANGE_BTNS = [{ v:'1m',l:'1M' },{ v:'3m',l:'3M' },{ v:'6m',l:'6M' },{ v:'12m',l:'12M' },{ v:'custom',l:'Custom' }];

            if (!invoices.some(i => (i.grand_total||0) > 0)) return null;

            return (
                <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-wrap">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40"><i className="fas fa-chart-bar text-blue-500"></i></div>
                            <div>
                                <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Revenue Trend</h3>
                                <p className="text-xs text-slate-400">
                                    {fmtC(totalRevenue)} · {currentData.length} months
                                    {growthPct !== null && <span className={`ml-2 font-bold ${growthPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{growthPct >= 0 ? '↑' : '↓'} {Math.abs(growthPct)}% vs prev period</span>}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                            <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                                {RANGE_BTNS.map(b => (
                                    <button key={b.v} onClick={() => setTrendRange(b.v)}
                                        className={`px-2.5 py-1.5 text-[10px] font-bold transition-all whitespace-nowrap ${trendRange === b.v ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                                        {b.l}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setCompareEnabled(c => !c)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${compareEnabled ? 'bg-purple-600 text-white border-purple-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                <i className="fas fa-exchange-alt"></i> Compare
                            </button>
                            <button onClick={() => setShowServiceBreakdown(s => !s)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${showServiceBreakdown ? 'bg-emerald-600 text-white border-emerald-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                <i className="fas fa-chart-pie"></i> By Service
                            </button>
                        </div>
                    </div>
                    {/* Custom date range */}
                    {trendRange === 'custom' && (
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                            <i className="fas fa-calendar text-slate-400"></i>
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                className={`h-8 px-2 rounded-lg text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`} />
                            <span className="text-slate-400 text-xs">to</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                className={`h-8 px-2 rounded-lg text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`} />
                        </div>
                    )}
                    {/* Comparative totals */}
                    {compareEnabled && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            {[
                                { label: 'Current Period', val: totalRevenue, color: COLORS.mediumBlue },
                                { label: 'Previous Period', val: prevTotal, color: COLORS.purple },
                                { label: totalRevenue >= prevTotal ? 'Growth ↑' : 'Decline ↓', val: Math.abs(totalRevenue - prevTotal), sub: growthPct !== null ? `${Math.abs(growthPct)}%` : '—', color: totalRevenue >= prevTotal ? COLORS.emeraldGreen : COLORS.coral },
                            ].map(c => (
                                <div key={c.label} className={`rounded-xl border p-3 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{c.label}</p>
                                    <p className="text-base font-black" style={{ color: c.color }}>{fmtC(c.val)}</p>
                                    {c.sub && <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Service filter chips */}
                    {showServiceBreakdown && allServices.length > 0 && (
                        <div className="mb-4">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">Filter by Service (multi-select — also highlights on chart)</p>
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                                <button onClick={() => setSelectedServices([])}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${selectedServices.length === 0 ? 'bg-blue-600 text-white border-blue-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    All
                                </button>
                                {allServices.map(name => (
                                    <button key={name} title={name}
                                        onClick={() => setSelectedServices(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all max-w-[180px] truncate ${selectedServices.includes(name) ? 'bg-emerald-600 text-white border-emerald-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* SVG Chart */}
                    {currentData.length > 0 && (
                        <div>
                            <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none">
                                <defs>
                                    <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity="0.22" />
                                        <stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity="0.01" />
                                    </linearGradient>
                                </defs>
                                {[0.25, 0.5, 0.75, 1].map(f => {
                                    const y = H - pad.b - f * (H - pad.t - pad.b);
                                    return (
                                        <g key={f}>
                                            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke={isDark ? '#334155' : '#f1f5f9'} strokeWidth="1" />
                                            <text x={pad.l - 4} y={y + 3} textAnchor="end" fontSize="8" fill={isDark ? '#64748b' : '#94a3b8'} fontFamily="monospace">{fmtAxis(maxVal * f)}</text>
                                        </g>
                                    );
                                })}
                                {mkArea(pts) && <path d={mkArea(pts)} fill="url(#trendAreaGrad)" />}
                                {compareEnabled && mkLine(prevPts) && <path d={mkLine(prevPts)} fill="none" stroke={COLORS.purple} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.8" strokeLinecap="round" />}
                                {mkLine(colPts) && <path d={mkLine(colPts)} fill="none" stroke={COLORS.emeraldGreen} strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" />}
                                {selectedServices.length > 0 && mkLine(svcPts) && <path d={mkLine(svcPts)} fill="none" stroke={COLORS.amber} strokeWidth="2.5" strokeLinecap="round" />}
                                {mkLine(pts) && <path d={mkLine(pts)} fill="none" stroke={COLORS.mediumBlue} strokeWidth="2.5" strokeLinecap="round" />}
                                {pts.map(([x, y], i) => (
                                    <g key={i}>
                                        <circle cx={x} cy={y} r="3.5" fill="white" stroke={COLORS.mediumBlue} strokeWidth="2" />
                                        <text x={x} y={H - 7} textAnchor="middle" fontSize="8" fill={isDark ? '#64748b' : '#94a3b8'}>{currentData[i]?.label}</text>
                                    </g>
                                ))}
                            </svg>
                            <div className="flex flex-wrap gap-4 text-[10px] mt-1 text-slate-400">
                                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded" style={{ background: COLORS.mediumBlue }}></span>Revenue</span>
                                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: COLORS.emeraldGreen }}></span>Collected</span>
                                {compareEnabled && <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: COLORS.purple }}></span>Prev Period</span>}
                                {selectedServices.length > 0 && <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded" style={{ background: COLORS.amber }}></span>Selected Services</span>}
                            </div>
                        </div>
                    )}
                    {/* Comparative table */}
                    {compareEnabled && currentData.length > 0 && (
                        <div className={`mt-4 rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className={`px-4 py-2 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Month-by-Month Comparison</p>
                            </div>
                            <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead><tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>
                                        {['Month','Revenue','Collected','Prev Revenue','Change'].map(h => (
                                            <th key={h} className={`px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{h}</th>
                                        ))}
                                    </tr></thead>
                                    <tbody>
                                        {currentData.map((d, i) => {
                                            const prev = prevData[i];
                                            const chg = prev != null ? d.revenue - prev.revenue : null;
                                            return (
                                                <tr key={d.month} className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                                                    <td className={`px-3 py-2 font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{d.label}</td>
                                                    <td className={`px-3 py-2 font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(d.revenue)}</td>
                                                    <td className="px-3 py-2 text-emerald-600">{fmtC(d.collected)}</td>
                                                    <td className={`px-3 py-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{prev != null ? fmtC(prev.revenue) : '—'}</td>
                                                    <td className={`px-3 py-2 font-bold ${chg == null ? '' : chg >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {chg == null ? '—' : `${chg >= 0 ? '+' : ''}${fmtC(chg)}`}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {/* Service breakdown table */}
                    {showServiceBreakdown && serviceBreakdown.length > 0 && (
                        <div className={`mt-4 rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Revenue by Service / Item — click to toggle chart highlight</p>
                            </div>
                            <div className="max-h-52 overflow-y-auto">
                                {serviceBreakdown.map((s, i) => {
                                    const pct = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
                                    const isSelected = selectedServices.includes(s.description);
                                    return (
                                        <div key={s.description}
                                            onClick={() => setSelectedServices(prev => prev.includes(s.description) ? prev.filter(n => n !== s.description) : [...prev, s.description])}
                                            className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-0 cursor-pointer transition-colors ${isSelected ? (isDark ? 'bg-emerald-900/20' : 'bg-emerald-50') : (isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50')} ${isDark ? 'border-slate-700' : 'border-slate-50'}`}>
                                            <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                                style={{ background: isSelected ? COLORS.emeraldGreen : `linear-gradient(135deg,${COLORS.deepBlue},${COLORS.mediumBlue})` }}>
                                                {isSelected ? '✓' : i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{s.description}</p>
                                                <div className={`h-1 rounded-full mt-1 ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${COLORS.deepBlue},${COLORS.mediumBlue})` }}></div>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-xs font-bold" style={{ color: COLORS.mediumBlue }}>{fmtC(s.revenue)}</p>
                                                <p className="text-[9px] text-slate-400">{pct.toFixed(1)}% · {s.count}×</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        // PAYMENT MODAL
        const PaymentModal = ({ invoice, open, onClose, onSuccess, isDark }) => {
            const [form, setForm] = React.useState({ amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), payment_mode: 'neft', reference_no: '', notes: '' });
            const [loading, setLoading] = React.useState(false);

            React.useEffect(() => { if (open && invoice) setForm(p => ({ ...p, amount: invoice.amount_due?.toFixed(2) || '' })); }, [open, invoice]);

            const handleSubmit = async (e) => {
                e.preventDefault();
                if (!form.amount || parseFloat(form.amount) <= 0) { alert('Enter a valid amount'); return; }
                setLoading(true);
                try {
                    // Mock API
                    await new Promise(r => setTimeout(r, 600));
                    alert('Payment recorded!');
                    onSuccess?.();
                    onClose();
                } catch (err) {
                    alert('Failed to record payment');
                } finally {
                    setLoading(false);
                }
            };

            if (!invoice) return null;

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
                    <div className="max-w-md rounded-2xl p-0 overflow-hidden bg-white dark:bg-slate-800">
                        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><i className="fas fa-rupee-sign text-white"></i></div>
                                <div><p className="text-white/60 text-[10px] uppercase tracking-widest">Record Payment</p><h2 className="text-white font-bold text-lg">{invoice.invoice_no}</h2></div>
                            </div>
                            <div className="mt-4 flex gap-4">
                                {[['Invoice Total', invoice.grand_total, 'text-white'], ['Paid So Far', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([l, v, cls]) => (
                                    <div key={l} className="flex-1 bg-white/10 rounded-xl px-3 py-2"><p className="text-white/50 text-[9px] uppercase tracking-wider">{l}</p><p className={`font-bold text-sm ${cls}`}>{fmtC(v)}</p></div>
                                ))}
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Amount (₹) *</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span><input type="number" step="0.01" min="0.01" className="pl-8 h-11 rounded-xl border w-full" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required /></div></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Date *</label><input type="date" className="h-11 rounded-xl border w-full" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} required /></div>
                                <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Mode</label>
                                    <select value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value }))} className="h-11 rounded-xl border w-full">
                                        {PAY_MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Reference / UTR No.</label><input className="h-11 rounded-xl border w-full" placeholder="Transaction / cheque reference" value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} /></div>
                            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Notes</label><textarea className="rounded-xl border w-full min-h-[70px]" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border">Cancel</button>
                                <button type="submit" disabled={loading} className="flex-1 h-11 rounded-xl text-white font-semibold flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>{loading ? 'Recording…' : '✓ Record Payment'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // INVOICE FORM
        const InvoiceForm = ({ open, onClose, editingInv, companies, clients, leads, onSuccess, isDark }) => {
            const navigate = () => {}; // Mock
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
                invoice_template: 'prestige', invoice_theme: 'classic_blue', invoice_custom_color: '#0D3B66',
            };
            const [form, setForm] = React.useState(defaultForm);
            const [loading, setLoading] = React.useState(false);
            const [activeTab, setActiveTab] = React.useState('details');
            const [products, setProducts] = React.useState([]);
            const previewRef = React.useRef(null);

            React.useEffect(() => {
                if (open) {
                    if (editingInv) {
                        setForm({
                            ...defaultForm,
                            ...editingInv,
                            invoice_date: (editingInv.invoice_date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
                            due_date: (editingInv.due_date || '').slice(0, 10) || format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
                        });
                    } else {
                        setForm(defaultForm);
                    }
                    setActiveTab('details');
                }
            }, [open, editingInv]);

            React.useEffect(() => {
                // Mock products
                setProducts([]);
            }, []);

            const totals = React.useMemo(() => computeTotals(form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges), [form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges]);

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
                alert(`Auto-filled from "${client.company_name}"`);
            }, []);

            const handlePreview = () => {
                const company = companies.find(c => c.id === form.company_id) || {};
                const previewInv = {
                    ...form,
                    invoice_no: editingInv?.invoice_no || 'PREVIEW-001',
                    invoice_date: form.invoice_date || format(new Date(), 'yyyy-MM-dd'),
                    due_date: form.due_date || format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
                    client_name: form.client_name || 'Client Name'
                };
                // Mock HTML generation
                const html = `<html><body><h1>Preview for ${previewInv.invoice_no}</h1><p>Invoice generated successfully.</p></body></html>`;
                if (previewRef.current) {
                    previewRef.current.srcdoc = html;
                }
            };

            const handleSubmit = async (e) => {
                e.preventDefault();
                if (!form.company_id) { alert('Please select a company profile'); return; }
                if (!form.client_name?.trim()) { alert('Client name is required'); return; }
                if (!form.items.some(it => it.description?.trim())) { alert('Add at least one item'); return; }
                setLoading(true);
                try {
                    // Mock save
                    await new Promise(r => setTimeout(r, 800));
                    alert(editingInv ? 'Invoice updated successfully' : 'Invoice created successfully');
                    saveItemMemory(form.items);
                    onSuccess?.();
                    onClose();
                } catch (err) {
                    alert('Failed to save invoice');
                } finally {
                    setLoading(false);
                }
            };

            const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
            const inputCls = `h-11 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;
            const sectionCls = `border rounded-2xl p-5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`;
            const tabs = [
                { id: 'details', label: 'Details', icon: 'fas fa-file-alt' },
                { id: 'items', label: 'Items', icon: 'fas fa-box' },
                { id: 'totals', label: 'Totals', icon: 'fas fa-rupee-sign' },
                { id: 'settings', label: 'Settings', icon: 'fas fa-layer-group' },
                { id: 'design', label: 'Design & Preview', icon: 'fas fa-palette' },
            ];

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
                    <div className={`max-w-5xl max-h-[96vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="sticky top-0 z-20 flex-shrink-0">
                            <div className="px-7 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                                <div className="relative flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><i className="fas fa-receipt text-white"></i></div>
                                        <div><p className="text-white/50 text-[10px] uppercase tracking-widest">{editingInv ? `Edit · ${editingInv.invoice_no}` : 'New Document'}</p><h2 className="text-white font-bold text-xl">{editingInv ? 'Edit Invoice' : 'Create Invoice / Estimate'}</h2></div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <select value={form.invoice_type} onChange={e => setField('invoice_type', e.target.value)} className="w-44 h-9 rounded-xl border-white/20 bg-white/10 text-white text-xs font-semibold">
                                            {INV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"><i className="fas fa-times text-white"></i></button>
                                    </div>
                                </div>
                            </div>
                            <div className={`flex border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all ${activeTab === tab.id ? `border-blue-500 ${isDark ? 'text-blue-400' : 'text-blue-600'}` : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}`}>
                                        <i className={`${tab.icon}`}></i>{tab.label}
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
                                            <div className="flex items-center gap-2 mb-5"><div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><i className="fas fa-building"></i></div><h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Company & Client</h3></div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div><label className={labelCls}>Company Profile *</label>
                                                    <select value={form.company_id || '__none__'} onChange={e => setField('company_id', e.target.value === '__none__' ? '' : e.target.value)} className={inputCls}>
                                                        <option value="__none__">— Select company —</option>
                                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div><label className={labelCls}>Select Client (auto-fill){form.client_id && <span className="ml-2 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal font-normal">✓ auto-populated</span>}</label>
                                                    <ClientSearchCombobox clients={clients} value={form.client_id} onSelect={handleClientSelect} onAddNew={() => { onClose(); }} isDark={isDark} />
                                                </div>
                                                <div><label className={labelCls}>Client Name *</label><input className={inputCls} value={form.client_name} onChange={e => setField('client_name', e.target.value)} required /></div>
                                                <div><label className={labelCls}>Client GSTIN</label><input className={inputCls} placeholder="22AAAAA0000A1Z5" value={form.client_gstin} onChange={e => setField('client_gstin', e.target.value)} /></div>
                                                <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.client_email} onChange={e => setField('client_email', e.target.value)} /></div>
                                                <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} /></div>
                                                <div className="md:col-span-2"><label className={labelCls}>Address</label><input className={inputCls} value={form.client_address} onChange={e => setField('client_address', e.target.value)} /></div>
                                                <div><label className={labelCls}>Client State</label><input className={inputCls} placeholder="e.g. Gujarat" value={form.client_state} onChange={e => setField('client_state', e.target.value)} /></div>
                                                <div><label className={labelCls}>Supply State (Your State)</label><input className={inputCls} placeholder="e.g. Gujarat" value={form.supply_state} onChange={e => setField('supply_state', e.target.value)} /></div>
                                            </div>
                                            <div className="mt-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                                                <input type="checkbox" checked={form.is_interstate} onChange={e => setField('is_interstate', e.target.checked)} className="w-4 h-4" />
                                                <div><p className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Interstate Supply (IGST)</p><p className="text-xs text-amber-600 dark:text-amber-400">{form.is_interstate ? 'IGST will be applied' : 'CGST + SGST will be applied'}</p></div>
                                            </div>
                                        </div>
                                        <div className={sectionCls}>
                                            <div className="flex items-center gap-2 mb-5"><div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><i className="fas fa-calendar"></i></div><h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Invoice Details</h3></div>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className={labelCls}>Invoice Date *</label>
                                                    <input type="date" className={`w-full h-11 rounded-xl text-sm px-3 border ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-800'}`} value={form.invoice_date} onChange={e => setField('invoice_date', e.target.value)} required />
                                                </div>
                                                <div>
                                                    <label className={labelCls}>Due Date</label>
                                                    <input type="date" className={`w-full h-11 rounded-xl text-sm px-3 border ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-slate-800'}`} value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
                                                </div>
                                                <div><label className={labelCls}>Reference / PO No.</label><input className={inputCls} placeholder="Optional" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} /></div>
                                                <div><label className={labelCls}>Payment Terms</label><input className={inputCls} value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)} /></div>
                                                <div><label className={labelCls}>Linked Lead</label>
                                                    <select value={form.lead_id || '__none__'} onChange={e => setField('lead_id', e.target.value === '__none__' ? null : e.target.value)} className={inputCls}>
                                                        <option value="__none__">— No Lead —</option>
                                                        {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
                                                    </select>
                                                </div>
                                                <div><label className={labelCls}>Status</label>
                                                    <select value={form.status} onChange={e => setField('status', e.target.value)} className={inputCls}>
                                                        {['draft','sent','partially_paid','paid','overdue','cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeTab === 'items' && (
                                    <div className={sectionCls}>
                                        <div className="flex items-center justify-between mb-5">
                                            <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><i className="fas fa-box"></i></div><h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Line Items</h3></div>
                                            <button type="button" onClick={addItem} className="flex items-center gap-1 text-xs font-semibold px-3 h-8 rounded-xl border">+ Add Item</button>
                                        </div>
                                        <div className="space-y-4">
                                            {form.items.map((item, idx) => {
                                                const comp = computeItem(item, form.is_interstate);
                                                return (
                                                    <div key={idx} className={`border rounded-xl p-4 relative ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                                                            </div>
                                                            {form.items.length > 1 && (<button type="button" onClick={() => removeItem(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><i className="fas fa-trash"></i></button>)}
                                                        </div>
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            <div className="md:col-span-2"><label className={labelCls}>Description *</label><input className={inputCls} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} /></div>
                                                            <div className="md:col-span-2"><label className={labelCls}>Details</label><textarea className={`rounded-xl text-sm min-h-[60px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} placeholder="Additional details…" value={item.item_details || ''} onChange={e => updateItem(idx, 'item_details', e.target.value)} /></div>
                                                            <div><label className={labelCls}>HSN / SAC</label><input className={inputCls} placeholder="e.g. 9983" value={item.hsn_sac} onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} /></div>
                                                            <div><label className={labelCls}>Unit</label>
                                                                <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} className={inputCls}>
                                                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                                </select>
                                                            </div>
                                                            <div><label className={labelCls}>Quantity</label><input type="number" min="0" step="0.01" className={inputCls} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                                                            <div><label className={labelCls}>Unit Price (₹)</label><input type="number" min="0" step="0.01" className={inputCls} value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} /></div>
                                                            <div><label className={labelCls}>Discount %</label><input type="number" min="0" max="100" step="0.01" className={inputCls} value={item.discount_pct} onChange={e => updateItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)} /></div>
                                                            <div><label className={labelCls}>GST Rate %</label>
                                                                <select value={String(item.gst_rate)} onChange={e => updateItem(idx, 'gst_rate', parseFloat(e.target.value))} className={inputCls}>
                                                                    {GST_RATES.map(r => <option key={r} value={String(r)}>{r}%</option>)}
                                                                </select>
                                                            </div>
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
                                                    <div key={key}><label className={labelCls}>{label}</label><input type="number" min="0" step="0.01" className={inputCls} value={form[key]} onChange={e => setField(key, parseFloat(e.target.value) || 0)} /></div>
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
                                                    <div key={key}><label className={labelCls}>{label}</label><textarea className={`rounded-xl text-sm min-h-[80px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={form[key]} onChange={e => setField(key, e.target.value)} /></div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className={sectionCls}>
                                            <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Recurring Settings</h3>
                                            <div className="flex items-center gap-3 mb-4">
                                                <input type="checkbox" checked={form.is_recurring} onChange={e => setField('is_recurring', e.target.checked)} />
                                                <div><p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Enable Recurring Invoice</p><p className="text-xs text-slate-400">Auto-generate new invoice on schedule</p></div>
                                            </div>
                                            {form.is_recurring && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div><label className={labelCls}>Recurrence Pattern</label>
                                                        <select value={form.recurrence_pattern} onChange={e => setField('recurrence_pattern', e.target.value)} className={inputCls}>
                                                            <option value="monthly">Monthly</option>
                                                            <option value="quarterly">Quarterly</option>
                                                            <option value="yearly">Yearly</option>
                                                        </select>
                                                    </div>
                                                    <div><label className={labelCls}>Recurrence End Date</label><input type="date" className={inputCls} value={form.recurrence_end || ''} onChange={e => setField('recurrence_end', e.target.value)} /></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {activeTab === 'design' && (
                                    <div className="space-y-5">
                                        <div className={sectionCls}>
                                            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><i className="fas fa-layer-group"></i> Invoice Template</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {/* Mock templates */}
                                                {[{id:'classic',name:'Classic',desc:'Clean professional layout'},{id:'modern',name:'Modern',desc:'Minimalist design'}].map(t => (
                                                    <button key={t.id} type="button" onClick={() => setField('invoice_template', t.id)}
                                                        className={`relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${form.invoice_template === t.id ? 'border-blue-500 shadow-md' : (isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300')}`}>
                                                        {form.invoice_template === t.id && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><i className="fas fa-check text-white text-xs"></i></div>}
                                                        <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t.name}</p>
                                                        <p className={`text-[10px] mt-1 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className={sectionCls}>
                                            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><i className="fas fa-palette"></i> Color Theme</h3>
                                            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                                                {/* Mock themes */}
                                                {[{id:'classic_blue',primary:COLORS.deepBlue,secondary:COLORS.mediumBlue,name:'Classic Blue'}].map(theme => (
                                                    <button key={theme.id} type="button" onClick={() => setField('invoice_theme', theme.id)}
                                                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${form.invoice_theme === theme.id ? 'border-blue-500 shadow-md' : (isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300')}`}>
                                                        <div className="relative w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"><div className="absolute inset-0" style={{ background: theme.primary }}></div><div className="absolute bottom-0 right-0 w-4 h-4" style={{ background: theme.secondary }}></div></div>
                                                        <p className={`text-[9px] font-semibold text-center leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{theme.name}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className={sectionCls}>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><i className="fas fa-eye"></i> Live Preview</h3>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={handlePreview} className="h-8 px-3 text-xs rounded-xl flex items-center gap-1.5 border">Preview</button>
                                                    <button type="button" className="h-8 px-3 text-xs rounded-xl flex items-center gap-1.5 border">Open Print Preview</button>
                                                </div>
                                            </div>
                                            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-600' : 'border-slate-200'}`} style={{ height: 600 }}>
                                                <iframe
                                                    ref={previewRef}
                                                    className="w-full h-[600px] border rounded-xl bg-white"
                                                    title="Invoice Preview"
                                                    sandbox="allow-scripts"
                                                />
                                            </div>
                                            <p className={`text-[10px] mt-2 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                Click <strong>Preview</strong> to load the invoice in the iframe below.<br />
                                                Use "Open Print Preview" to open in a new tab for printing/saving as PDF.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </form>
                        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={onClose} className="h-10 px-5 text-sm rounded-xl border">Cancel</button>
                                <button type="button" onClick={() => setActiveTab('design')} className="h-10 px-4 text-xs rounded-xl flex items-center gap-1.5 border-purple-200 text-purple-600 hover:bg-purple-50">Design & Preview</button>
                            </div>
                            <div className="flex items-center gap-3">
                                {totals.grand_total > 0 && (<span className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Total: <span style={{ color: COLORS.mediumBlue }}>{fmtC(totals.grand_total)}</span></span>)}
                                {activeTab !== 'design' ? (
                                    <button type="button" onClick={() => { const order = ['details', 'items', 'totals', 'settings', 'design']; const next = order[order.indexOf(activeTab) + 1]; if (next) setActiveTab(next); }}
                                        className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>Next <i className="fas fa-chevron-right"></i></button>
                                ) : (
                                    <button type="button" onClick={handleSubmit} disabled={loading} className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm" style={{ background: loading ? '#94a3b8' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{loading ? 'Saving…' : editingInv ? '✓ Update Invoice' : '✓ Create Invoice'}</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // INVOICE DETAIL PANEL
        const InvoiceDetailPanel = ({ invoice, open, onClose, onPayment, onEdit, onDelete, onDownloadPdf, onSendEmail, isDark }) => {
            const [payments, setPayments] = React.useState([]);
            React.useEffect(() => { if (open && invoice) { setPayments([]); } }, [open, invoice?.id]);

            if (!invoice) return null;
            const meta = getStatusMeta(invoice); const isInterstate = invoice.is_interstate;

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
                    <div className={`max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="px-7 py-5 relative overflow-hidden flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                            <div className="relative flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0"><i className="fas fa-receipt text-white"></i></div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5"><p className="text-white font-bold text-lg leading-tight">{invoice.invoice_no}</p><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span></div>
                                        <p className="text-white/60 text-sm">{invoice.client_name}</p>
                                        <p className="text-white/40 text-xs mt-0.5">{invoice.invoice_date} · {INV_TYPES.find(t => t.value === invoice.invoice_type)?.label || 'Tax Invoice'}</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"><i className="fas fa-times text-white"></i></button>
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
                                        {[['Taxable Value', invoice.total_taxable], isInterstate ? ['IGST', invoice.total_igst] : null, !isInterstate ? ['CGST', invoice.total_cgst] : null, !isInterstate ? ['SGST', invoice.total_sgst] : null].filter(Boolean).map(([label, val]) => (
                                            <div key={label} className="flex items-center justify-between text-xs"><span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span><span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{fmtC(val)}</span></div>
                                        ))}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600"><span className="text-sm font-bold" style={{ color: COLORS.deepBlue }}>Grand Total</span><span className="text-lg font-black" style={{ color: COLORS.mediumBlue }}>{fmtC(invoice.grand_total)}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={`flex-shrink-0 flex items-center gap-2 px-7 py-4 border-t flex-wrap ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
                            <button onClick={() => { onClose(); onEdit?.(invoice); }} className="rounded-xl text-xs h-9 flex items-center gap-1.5 px-3 border">Edit</button>
                            <button onClick={() => onDownloadPdf?.(invoice)} className="rounded-xl text-xs h-9 flex items-center gap-1.5 px-3 border">PDF</button>
                            <DriveUploadBtn invoiceId={invoice.id} invoiceNo={invoice.invoice_no} />
                            {invoice.client_email && (<button onClick={() => { onClose(); onSendEmail?.(invoice); }} className="rounded-xl text-xs h-9 flex items-center gap-1.5 px-3 bg-blue-600 text-white">Send Email</button>)}
                            {invoice.amount_due > 0 && (<button onClick={() => { onClose(); onPayment?.(invoice); }} className="rounded-xl text-xs h-9 flex items-center gap-1.5 px-3 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>Record Payment</button>)}
                            <button onClick={() => onDelete?.(invoice)} className="rounded-xl text-xs h-9 flex items-center gap-1.5 px-3 text-red-500 hover:bg-red-50 ml-auto">Delete</button>
                        </div>
                    </div>
                </div>
            );
        };

        // PRODUCT MODAL
        const ProductModal = ({ open, onClose, isDark, onSaved }) => {
            const [products, setProducts] = React.useState([]);
            const [form, setForm] = React.useState({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
            const [editing, setEditing] = React.useState(null);
            const [loading, setLoading] = React.useState(false);

            React.useEffect(() => { if (open) setProducts([]); }, [open]);

            const handleSave = async (e) => {
                e.preventDefault(); setLoading(true);
                try {
                    // Mock
                    await new Promise(r => setTimeout(r, 500));
                    setProducts(p => editing ? p.map(x => x.id === editing.id ? {...form, id: editing.id} : x) : [...p, {...form, id: Date.now()}]);
                    setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
                    setEditing(null); onSaved?.();
                } catch {}
                finally { setLoading(false); }
            };

            const handleDelete = async (id) => {
                setProducts(p => p.filter(x => x.id !== id));
            };

            const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

            return (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? 'visible' : 'invisible'}`}>
                    <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
                    <div className={`max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><i className="fas fa-box"></i></div><div><h2 className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Product / Service Catalog</h2><p className="text-xs text-slate-400">Reusable items for quick invoice creation</p></div></div>
                        </div>
                        <div className="flex-1 overflow-hidden flex">
                            <div className={`w-72 flex-shrink-0 p-5 border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/40'}`}>
                                <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{editing ? 'Edit Item' : 'New Item'}</h4>
                                <form onSubmit={handleSave} className="space-y-3">
                                    <input className={inputCls} placeholder="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                                    <input className={inputCls} placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input className={inputCls} placeholder="HSN/SAC" value={form.hsn_sac} onChange={e => setForm(p => ({ ...p, hsn_sac: e.target.value }))} />
                                        <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
                                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="number" className={inputCls} placeholder="Unit Price" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} />
                                        <select value={String(form.gst_rate)} onChange={e => setForm(p => ({ ...p, gst_rate: parseFloat(e.target.value) }))} className={inputCls}>
                                            {GST_RATES.map(r => <option key={r} value={String(r)}>{r}% GST</option>)}
                                        </select>
                                    </div>
                                    <input className={inputCls} placeholder="Category (optional)" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
                                    <div className="flex gap-2">
                                        <button type="submit" disabled={loading} className="flex-1 h-9 rounded-xl text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Item'}</button>
                                        {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true }); }} className="h-9 rounded-xl text-xs px-4 border">Cancel</button>}
                                    </div>
                                </form>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {products.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400"><i className="fas fa-box text-5xl opacity-30 mb-3"></i><p className="text-sm">No products yet — add one!</p></div>
                                ) : products.map(p => (
                                    <div key={p.id} className={`flex items-center gap-3 px-5 py-3.5 border-b group transition-colors ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'}`}>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ background: p.is_service ? `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` : 'linear-gradient(135deg, #065f46, #059669)' }}>{p.is_service ? 'S' : 'P'}</div>
                                        <div className="flex-1 min-w-0"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p><p className="text-xs text-slate-400">{p.unit} · {fmtC(p.unit_price)} · GST {p.gst_rate}%{p.hsn_sac && ` · HSN ${p.hsn_sac}`}</p></div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditing(p); setForm({ name: p.name, description: p.description || '', hsn_sac: p.hsn_sac || '', unit: p.unit || 'service', unit_price: p.unit_price || 0, gst_rate: p.gst_rate || 18, category: p.category || '', is_service: p.is_service !== false }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><i className="fas fa-edit"></i></button>
                                            <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"><i className="fas fa-trash"></i></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // MAIN PAGE
        function Invoicing() {
            const { user } = { user: { name: 'Demo' } }; // Mock
            const isDark = false; // Mock
            const navigate = () => {};
            const [invoices, setInvoices] = React.useState([]);
            const [companies, setCompanies] = React.useState([]);
            const [clients, setClients] = React.useState([]);
            const [leads, setLeads] = React.useState([]);
            const [stats, setStats] = React.useState(null);
            const [loading, setLoading] = React.useState(false);
            const [formOpen, setFormOpen] = React.useState(false);
            const [editingInv, setEditingInv] = React.useState(null);
            const [detailInv, setDetailInv] = React.useState(null);
            const [detailOpen, setDetailOpen] = React.useState(false);
            const [payInv, setPayInv] = React.useState(null);
            const [payOpen, setPayOpen] = React.useState(false);
            const [catOpen, setCatOpen] = React.useState(false);
            const [importOpen, setImportOpen] = React.useState(false);
            const [gstOpen, setGstOpen] = React.useState(false);
            const [settingsOpen, setSettingsOpen] = React.useState(false);
            const [ledgerOpen, setLedgerOpen] = React.useState(false);
            const [ledgerClient, setLedgerClient] = React.useState(null);
            const [searchInput, setSearchInput] = React.useState('');
            const [searchTerm, setSearchTerm] = React.useState('');
            const [statusFilter, setStatusFilter] = React.useState('all');
            const [typeFilter, setTypeFilter] = React.useState('all');
            const [companyFilter, setCompanyFilter] = React.useState('all');
            const [yearFilter, setYearFilter] = React.useState('all');
            const [fromDate, setFromDate] = React.useState('');
            const [toDate, setToDate] = React.useState('');
            const searchRef = React.useRef(null);

            // NEW BULK DELETE STATE
            const [selectedInvoices, setSelectedInvoices] = React.useState([]);

            React.useEffect(() => { const t = setTimeout(() => setSearchTerm(searchInput), 250); return () => clearTimeout(t); }, [searchInput]);

            const fetchAll = useCallback(async () => {
                setLoading(true);
                // Mock data
                setInvoices([
                    { id: 1, invoice_no: 'INV-001', client_name: 'Acme Corp', invoice_date: '2025-03-01', grand_total: 25000, amount_paid: 10000, amount_due: 15000, status: 'partially_paid', invoice_type: 'tax_invoice', items: [] },
                    { id: 2, invoice_no: 'INV-002', client_name: 'Beta Ltd', invoice_date: '2025-03-15', grand_total: 45000, amount_paid: 45000, amount_due: 0, status: 'paid', invoice_type: 'tax_invoice', items: [] },
                ]);
                setCompanies([{ id: 1, name: 'Demo Company' }]);
                setClients([]);
                setLeads([]);
                setStats({});
                setLoading(false);
            }, []);

            React.useEffect(() => { fetchAll(); }, [fetchAll]);

            const availableYears = React.useMemo(() => {
                const years = new Set(invoices.map(i => i.invoice_date?.slice(0, 4)).filter(Boolean));
                return Array.from(years).sort().reverse();
            }, [invoices]);

            const fyRange = (year) => { if (!year || year === 'all') return null; const y = parseInt(year); return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; };

            const localStats = React.useMemo(() => {
                const now = new Date(); const curMonth = format(now, 'yyyy-MM'); const fy = fyRange(yearFilter === 'all' ? null : yearFilter);
                const base = invoices.filter(inv => { if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false; if (fy && (inv.invoice_date < fy.from || inv.invoice_date > fy.to)) return false; return true; });
                const total_revenue = base.reduce((s, i) => s + (i.grand_total || 0), 0);
                const total_outstanding = base.reduce((s, i) => s + (i.amount_due || 0), 0);
                const total_gst = base.reduce((s, i) => s + (i.total_gst || 0), 0);
                const total_invoices = base.length;
                const month_revenue = base.filter(i => i.invoice_date?.startsWith(curMonth)).reduce((s, i) => s + (i.grand_total || 0), 0);
                const month_invoices = base.filter(i => i.invoice_date?.startsWith(curMonth)).length;
                const overdue_count = base.filter(i => i.amount_due > 0 && i.due_date && differenceInDays(new Date(), parseISO(i.due_date)) > 0).length;
                const paid_count = base.filter(i => i.status === 'paid').length;
                const draft_count = base.filter(i => i.status === 'draft').length;
                return { total_revenue, total_outstanding, total_gst, total_invoices, month_revenue, month_invoices, overdue_count, paid_count, draft_count };
            }, [invoices, companyFilter, yearFilter]);

            const filtered = React.useMemo(() => {
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

            const enrichedFiltered = React.useMemo(() => filtered.map(inv => {
                if (inv.status === 'sent' && inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0) return { ...inv, status: 'overdue' };
                return inv;
            }), [filtered]);

            const handleEdit = useCallback((inv) => { setEditingInv(inv); setFormOpen(true); }, []);
            const handleDelete = useCallback(async (inv) => {
                if (!window.confirm(`Delete invoice ${inv.invoice_no}?`)) return;
                setInvoices(prev => prev.filter(i => i.id !== inv.id));
                setDetailOpen(false);
            }, []);

            const handleDownloadPdf = useCallback(async (inv) => {
                alert(`PDF generated for ${inv.invoice_no}`);
            }, []);

            const handleMarkSent = useCallback(async (inv) => {
                setInvoices(prev => prev.map(i => i.id === inv.id ? {...i, status: 'sent'} : i));
            }, []);

            const handleSendEmail = useCallback(async (inv) => {
                if (!inv.client_email) { alert('Client email address is missing'); return; }
                if (!window.confirm(`Send invoice ${inv.invoice_no} to ${inv.client_email}?`)) return;
                alert(`Email queued for ${inv.invoice_no}`);
            }, []);

            const handleExport = useCallback(() => {
                if (!enrichedFiltered.length) { alert('No invoices to export'); return; }
                alert(`Exported ${enrichedFiltered.length} invoices`);
            }, [enrichedFiltered]);

            // BULK SELECT HANDLERS
            const handleToggleSelect = (id) => {
                setSelectedInvoices(prev => 
                    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                );
            };

            const handleSelectAll = () => {
                if (selectedInvoices.length === enrichedFiltered.length) {
                    setSelectedInvoices([]);
                } else {
                    setSelectedInvoices(enrichedFiltered.map(inv => inv.id));
                }
            };

            // BULK DELETE
            const handleBulkDelete = async () => {
                if (!selectedInvoices.length) return;
                if (!window.confirm("Delete selected invoices?")) return;
                setInvoices(prev => prev.filter(i => !selectedInvoices.includes(i.id)));
                setSelectedInvoices([]);
                alert("Deleted successfully");
            };

            return (
                <div className={`min-h-screen p-5 md:p-7 space-y-5 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
                    {/* PAGE HEADER */}
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)` }}>
                        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 px-7 py-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0"><i className="fas fa-receipt text-white text-3xl"></i></div>
                                <div><h1 className="text-2xl font-bold text-white tracking-tight">Invoicing & Billing</h1><p className="text-sm text-blue-200 mt-0.5">GST-compliant · Smart client search · GSTR reports · Email invoices</p></div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => { setLedgerClient(null); setLedgerOpen(true); }} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl flex items-center gap-2">Party Ledger</button>
                                <button onClick={() => setGstOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl flex items-center gap-2">GST Returns</button>
                                <button onClick={() => setSettingsOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl flex items-center gap-2">Settings</button>
                                <button onClick={() => setImportOpen(true)} className="h-9 px-4 text-sm bg-emerald-500/20 border-emerald-300/40 text-white hover:bg-emerald-500/30 rounded-xl flex items-center gap-2">Import</button>
                                <label className="cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) handleExcelImport(e.target.files[0]);
                                        }}
                                        className="hidden"
                                    />
                                    <button className="h-9 px-4 text-sm bg-amber-500/20 border-amber-300/40 text-white hover:bg-amber-500/30 rounded-xl flex items-center gap-2">Template</button>
                                </label>
                                <button onClick={() => setCatOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl flex items-center gap-2">Catalog</button>
                                <button onClick={handleExport} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl flex items-center gap-2">Export</button>
                                {/* BULK DELETE BUTTON */}
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={!selectedInvoices.length}
                                    className="h-9 px-4 text-sm bg-red-500 text-white hover:bg-red-600 rounded-xl flex items-center gap-2 disabled:opacity-40"
                                >
                                    <i className="fas fa-trash"></i>
                                    Delete ({selectedInvoices.length})
                                </button>
                                <button onClick={() => { setEditingInv(null); setFormOpen(true); }} className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm flex items-center gap-2 font-semibold border-0">+ New Invoice</button>
                            </div>
                        </div>
                    </div>

                    {/* STATS */}
                    {(localStats.total_invoices > 0 || invoices.length > 0) && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Total Revenue" value={fmtC(localStats.total_revenue)} sub={`${localStats.total_invoices} invoices`} icon="fas fa-rupee-sign" color={COLORS.mediumBlue} bg={`${COLORS.mediumBlue}12`} isDark={isDark} />
                            <StatCard label="Outstanding" value={fmtC(localStats.total_outstanding)} sub={`${localStats.overdue_count} overdue`} icon="fas fa-exclamation-circle" color={COLORS.coral} bg={`${COLORS.coral}15`} isDark={isDark} />
                            <StatCard label="This Month" value={fmtC(localStats.month_revenue)} sub={`${localStats.month_invoices} invoices`} icon="fas fa-trending-up" color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} isDark={isDark} />
                            <StatCard label="Total GST" value={fmtC(localStats.total_gst)} sub={`${localStats.paid_count} paid · ${localStats.draft_count} draft`} icon="fas fa-shield-alt" color={COLORS.amber} bg={`${COLORS.amber}12`} isDark={isDark} />
                        </div>
                    )}

                    {localStats.monthly_trend && <EnhancedRevenueTrend invoices={invoices} isDark={isDark} />}

                    {/* FILTERS */}
                    <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                            <div className="relative flex-1">
                                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
                                <input ref={searchRef} placeholder="Search invoice no. or client… (Ctrl+K)" className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                                {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>}
                            </div>
                            <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{enrichedFiltered.length} <span className="ml-1 font-normal text-slate-400">invoices</span></div>
                        </div>
                        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto flex-wrap">
                            {companies.length > 1 && (
                                <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className={`h-9 w-[160px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-blue-50 text-blue-700'}`}>
                                    <option value="all">All Companies</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            )}
                            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}>
                                <option value="all">All Years</option>
                                {availableYears.map(y => <option key={y} value={y}>FY {y}-{String(parseInt(y) + 1).slice(2)}</option>)}
                            </select>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}>
                                <option value="all">All Status</option>
                                {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={`h-9 w-[145px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}>
                                <option value="all">All Types</option>
                                {INV_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <div className="flex items-center gap-1.5">
                                <i className="fas fa-calendar text-slate-400"></i>
                                <input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                                <span className="text-slate-400 text-xs">to</span>
                                <input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={toDate} onChange={e => setToDate(e.target.value)} />
                            </div>
                            {(companyFilter !== 'all' || yearFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate || searchInput) && (
                                <button onClick={() => { setCompanyFilter('all'); setYearFilter('all'); setStatusFilter('all'); setTypeFilter('all'); setFromDate(''); setToDate(''); setSearchInput(''); }} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-xl hover:bg-red-50 transition-colors">Clear</button>
                            )}
                        </div>
                    </div>

                    {/* INVOICE TABLE */}
                    <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
                        <div className={`grid border-b px-5 py-3 ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`} style={{ gridTemplateColumns: '40px 1fr 1fr 110px 100px 100px 100px 100px 160px' }}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                                <input 
                                    type="checkbox" 
                                    checked={selectedInvoices.length === enrichedFiltered.length && enrichedFiltered.length > 0}
                                    onChange={handleSelectAll}
                                    className="w-4 h-4 accent-blue-600"
                                />
                            </div>
                            {['Invoice No', 'Client', 'Date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (<div key={h} className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</div>))}
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-16"><div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                        ) : enrichedFiltered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}><i className="fas fa-receipt text-4xl opacity-30"></i></div>
                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No invoices found</p>
                            </div>
                        ) : (
                            <div>
                                {enrichedFiltered.map(inv => {
                                    const meta = getStatusMeta(inv); const isOverdue = inv.status === 'overdue';
                                    const isSelected = selectedInvoices.includes(inv.id);
                                    return (
                                        <div key={inv.id} className={`grid items-center px-5 py-3.5 border-b cursor-pointer group transition-colors last:border-0 ${isOverdue ? (isDark ? 'bg-red-900/10 border-red-900/20' : 'bg-red-50/30 border-red-100') : ''} ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50/60'}`}
                                            style={{ gridTemplateColumns: '40px 1fr 1fr 110px 100px 100px 100px 100px 160px' }} onClick={() => { setDetailInv(inv); setDetailOpen(true); }}>
                                            <div className="flex items-center" onClick={e => { e.stopPropagation(); handleToggleSelect(inv.id); }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={e => { e.stopPropagation(); handleToggleSelect(inv.id); }}
                                                    className="w-4 h-4 accent-blue-600"
                                                />
                                            </div>
                                            <div className="flex items-center gap-3"><div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: meta.hex }} /><div><p className={`text-sm font-bold font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{inv.invoice_no}</p><p className="text-[10px] text-slate-400">{INV_TYPES.find(t => t.value === inv.invoice_type)?.label || 'Tax Invoice'}</p></div></div>
                                            <div className="flex items-center gap-2.5 min-w-0"><div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{inv.client_name?.charAt(0).toUpperCase() || '?'}</div><div className="min-w-0"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{inv.client_name}</p></div></div>
                                            <div><p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{inv.invoice_date}</p><p className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>Due: {inv.due_date}</p></div>
                                            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(inv.grand_total)}</p>
                                            <p className={`text-sm font-semibold ${inv.amount_paid > 0 ? 'text-emerald-600' : (isDark ? 'text-slate-500' : 'text-slate-300')}`}>{fmtC(inv.amount_paid)}</p>
                                            <p className={`text-sm font-semibold ${inv.amount_due > 0 ? (isOverdue ? 'text-red-500' : 'text-amber-600') : 'text-slate-300'}`}>{fmtC(inv.amount_due)}</p>
                                            <StatusPill inv={inv} />
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <button onClick={(e) => { e.stopPropagation(); setLedgerClient(inv.client_name); setLedgerOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors" title="Party Ledger"><i className="fas fa-book"></i></button>
                                                <button onClick={() => handleDownloadPdf(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="PDF"><i className="fas fa-download"></i></button>
                                                {inv.client_email && (<button onClick={(e) => { e.stopPropagation(); handleSendEmail(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Send Email"><i className="fas fa-paper-plane"></i></button>)}
                                                {inv.amount_due > 0 && (<button onClick={(e) => { e.stopPropagation(); setPayInv(inv); setPayOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors" title="Payment"><i className="fas fa-rupee-sign"></i></button>)}
                                                {inv.status === 'draft' && (<button onClick={(e) => { e.stopPropagation(); handleMarkSent(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Mark Sent"><i className="fas fa-paper-plane"></i></button>)}
                                                <button onClick={(e) => { e.stopPropagation(); handleEdit(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit"><i className="fas fa-edit"></i></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(inv); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete"><i className="fas fa-trash"></i></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* DIALOGS */}
                    <InvoiceForm open={formOpen} onClose={() => { setFormOpen(false); setEditingInv(null); }} editingInv={editingInv} companies={companies} clients={clients} leads={leads} onSuccess={fetchAll} isDark={isDark} />
                    <InvoiceDetailPanel invoice={detailInv} open={detailOpen} onClose={() => setDetailOpen(false)} onPayment={(inv) => { setPayInv(inv); setPayOpen(true); }} onEdit={handleEdit} onDelete={handleDelete} onDownloadPdf={handleDownloadPdf} onSendEmail={handleSendEmail} isDark={isDark} />
                    <PaymentModal invoice={payInv} open={payOpen} onClose={() => { setPayOpen(false); setPayInv(null); }} onSuccess={fetchAll} isDark={isDark} />
                    <ProductModal open={catOpen} onClose={() => setCatOpen(false)} isDark={isDark} onSaved={() => {}} />
                    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} isDark={isDark} companies={companies} onImportComplete={fetchAll} />
                    <GSTReportsModal open={gstOpen} onClose={() => setGstOpen(false)} invoices={invoices} isDark={isDark} />

                    {/* Hidden elements */}
                    <iframe style={{ display: 'none' }} title="print-frame" />
                </div>
            );
        }

        // Render the app
        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(Invoicing));
    </script>
</body>
</html>
