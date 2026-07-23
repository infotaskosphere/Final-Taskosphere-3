import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ShieldCheck, Search, ReceiptText, ShoppingCart, Loader2, RefreshCw,
  ArrowDownCircle, ArrowUpCircle, Info, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { if (!v) return '—'; try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v; } };

/**
 * ExistingRecordsPanel — a duplicate-avoidance lookup shared by the Bank
 * Accounts, Journal Entries, and Accounting Reports pages.
 *
 * Before uploading a bank statement, or before posting a manual journal
 * entry, this lets the user glance at every Sale invoice and Purchase bill
 * already on file for the company — so they can confirm a payment/receipt
 * is already booked instead of accidentally recording it a second time.
 * It's read-only: it never creates, edits, or deletes anything.
 */
export default function ExistingRecordsPanel({ open, onOpenChange, companyId, isDark, title, description }) {
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [tab, setTab] = useState('open'); // 'open' | 'all' | 'sales' | 'purchases'
  const [search, setSearch] = useState('');
  const [loadedFor, setLoadedFor] = useState(undefined);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const [salesRes, purchasesRes] = await Promise.allSettled([
        api.get('/invoices', { params: { page: 1, page_size: 1000, company_id: companyId || undefined } }),
        api.get('/purchase-invoices', { params: { page_size: 1000, company_id: companyId || undefined } }),
      ]);

      if (salesRes.status === 'fulfilled') {
        const data = salesRes.value.data;
        const raw = Array.isArray(data) ? data : (data?.invoices || data?.items || []);
        setSales(raw.map(s => ({
          id: s.id,
          kind: 'sale',
          party: s.client_name || s.customer_name || s.party_name || 'Customer',
          invoice_no: s.invoice_no || s.invoice_number || '—',
          date: s.invoice_date || s.date || '',
          amount: Number(s.grand_total || s.amount || s.total_amount || s.total || 0),
          status: s.status || 'unpaid',
          open: !['paid', 'cancelled'].includes((s.status || '').toLowerCase()),
        })));
      }
      if (purchasesRes.status === 'fulfilled') {
        const data = purchasesRes.value.data;
        const raw = Array.isArray(data) ? data : (data?.purchase_invoices || data?.items || []);
        setPurchases(raw.map(p => ({
          id: p.id,
          kind: 'purchase',
          party: p.supplier_name || p.vendor_name || 'Vendor',
          invoice_no: p.invoice_no || p.bill_number || '—',
          date: p.invoice_date || p.date || '',
          amount: Number(p.grand_total || p.amount || p.total || 0),
          status: p.payment_status || 'unpaid',
          open: (p.payment_status || 'unpaid').toLowerCase() !== 'paid',
        })));
      }
      setLoadedFor(companyId);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && loadedFor !== companyId) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  const combined = useMemo(() => {
    let rows = [...sales, ...purchases];
    if (tab === 'open') rows = rows.filter(r => r.open);
    else if (tab === 'sales') rows = rows.filter(r => r.kind === 'sale');
    else if (tab === 'purchases') rows = rows.filter(r => r.kind === 'purchase');
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r => `${r.party} ${r.invoice_no}`.toLowerCase().includes(q));
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [sales, purchases, tab, search]);

  const openSales = sales.filter(s => s.open);
  const openPurchases = purchases.filter(p => p.open);
  const openSalesTotal = openSales.reduce((s, r) => s + r.amount, 0);
  const openPurchasesTotal = openPurchases.reduce((s, r) => s + r.amount, 0);

  const tabs = [
    { key: 'open', label: 'Open only', count: openSales.length + openPurchases.length },
    { key: 'sales', label: 'Sales', count: sales.length },
    { key: 'purchases', label: 'Purchases', count: purchases.length },
    { key: 'all', label: 'All records', count: sales.length + purchases.length },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
            {title || 'Existing sale & purchase records'}
          </DialogTitle>
        </DialogHeader>

        <p className={`text-xs -mt-2 flex items-start gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {description || 'Everything already booked in Invoicing and Purchases for this company. Check here before adding a new entry, so nothing gets recorded twice — a matching bank transaction or journal entry will link to one of these instead of creating a duplicate.'}
        </p>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-3 flex items-center gap-3 ${isDark ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: COLORS.emeraldGreen }}>
              <ArrowUpCircle className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-bold uppercase tracking-wide ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Open sales</p>
              <p className={`text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{openSales.length} · {fmtC(openSalesTotal)}</p>
            </div>
          </div>
          <div className={`rounded-2xl border p-3 flex items-center gap-3 ${isDark ? 'bg-rose-950/30 border-rose-800/40' : 'bg-rose-50 border-rose-200'}`}>
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: COLORS.coral }}>
              <ArrowDownCircle className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className={`text-[11px] font-bold uppercase tracking-wide ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>Open purchases</p>
              <p className={`text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{openPurchases.length} · {fmtC(openPurchasesTotal)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="flex gap-1.5 flex-wrap">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  tab === t.key
                    ? 'text-white border-transparent'
                    : isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                style={tab === t.key ? { background: COLORS.mediumBlue } : {}}
              >
                {t.label} <span className="opacity-75">({t.count})</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party or invoice no…" className="pl-8 h-9 rounded-xl text-sm" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading} className="h-9 rounded-xl shrink-0">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
            </div>
          ) : combined.length === 0 ? (
            <div className="text-center py-16">
              <ReceiptText className="h-9 w-9 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-400">No matching records</p>
              <p className="text-xs text-slate-400 mt-1">Nothing here to duplicate — go ahead.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {combined.map(r => (
                <div key={`${r.kind}-${r.id}`} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${r.kind === 'sale' ? (isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : (isDark ? 'bg-rose-900/40 text-rose-300' : 'bg-rose-100 text-rose-700')}`}>
                    {r.kind === 'sale' ? <ReceiptText className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{r.party}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{r.invoice_no}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400">{fmtDate(r.date)} · {r.kind === 'sale' ? 'Sale invoice' : 'Purchase bill'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(r.amount)}</p>
                    <Badge className={`text-[10px] mt-0.5 ${r.open ? (isDark ? 'bg-amber-900/40 text-amber-300 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-200') : (isDark ? 'bg-emerald-900/40 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}`} variant="outline">
                      {r.open ? 'Open' : 'Settled'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={() => onOpenChange(false)} className="rounded-xl text-white" style={{ background: COLORS.deepBlue }}>
            <X className="h-4 w-4 mr-1.5" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
