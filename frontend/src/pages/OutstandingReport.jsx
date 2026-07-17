import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Users, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

const BUCKET_LABELS = { current: 'Current', '1_30': '1–30 Days', '31_60': '31–60 Days', '61_90': '61–90 Days', '91_plus': '90+ Days' };
const BUCKET_COLORS = {
  current: 'bg-emerald-100 text-emerald-700',
  '1_30': 'bg-yellow-100 text-yellow-700',
  '31_60': 'bg-orange-100 text-orange-700',
  '61_90': 'bg-red-100 text-red-700',
  '91_plus': 'bg-rose-200 text-rose-800 font-bold',
};

function AgingSummaryBar({ aging, total, isDark }) {
  if (!total) return null;
  const buckets = ['current', '1_30', '31_60', '61_90', '91_plus'];
  const barColors = ['#10B981', '#FBBF24', '#F97316', '#EF4444', '#9F1239'];
  return (
    <div className={`rounded-2xl p-5 ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} shadow-sm`}>
      <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Aging Summary</p>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
        {buckets.map((b, i) => {
          const pct = ((aging[b] || 0) / total) * 100;
          return pct > 0 ? (
            <div key={b} style={{ width: `${pct}%`, background: barColors[i] }} title={`${BUCKET_LABELS[b]}: ${fmtC(aging[b] || 0)}`} />
          ) : null;
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {buckets.map((b, i) => (
          <div key={b} className={`rounded-xl p-3 ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
            <p className={`text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{BUCKET_LABELS[b]}</p>
            <p className="font-bold font-mono text-sm" style={{ color: barColors[i] }}>{fmtC(aging[b] || 0)}</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{total ? Math.round(((aging[b] || 0) / total) * 100) : 0}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutstandingTable({ rows, type, isDark }) {
  const [search, setSearch] = useState('');
  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const name = type === 'receivable' ? (r.client_name || '') : (r.supplier_name || '');
    return !q || name.toLowerCase().includes(q) || (r.invoice_no || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-3">
      <Input placeholder="Search by name or invoice no…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm h-9" />
      <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">{type === 'receivable' ? 'Customer' : 'Supplier'}</th>
                <th className="px-4 py-3 text-left">Invoice Date</th>
                <th className="px-4 py-3 text-left">Due Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-left">Age Bucket</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className={`px-4 py-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No outstanding {type} found.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.invoice_no || '—'}</td>
                  <td className="px-4 py-2.5 font-medium">{type === 'receivable' ? r.client_name : r.supplier_name}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.due_date)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtC(r.grand_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{fmtC(r.amount_paid)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">{fmtC(r.outstanding)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${BUCKET_COLORS[r.bucket] || 'bg-slate-100 text-slate-600'}`}>
                      {BUCKET_LABELS[r.bucket] || r.bucket}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OutstandingReportInner() {
  const isDark = useDark();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [receivable, setReceivable] = useState(null);
  const [payable, setPayable] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [recR, payR] = await Promise.allSettled([
        api.get('/reports/outstanding/receivable', { params: { as_of: asOf } }),
        api.get('/reports/outstanding/payable', { params: { as_of: asOf } }),
      ]);
      setReceivable(recR.status === 'fulfilled' ? recR.value.data : null);
      setPayable(payR.status === 'fulfilled' ? payR.value.data : null);
    } catch { toast.error('Failed to load outstanding report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = (data, type) => {
    if (!data) return;
    const rows = [['Invoice #', type === 'receivable' ? 'Customer' : 'Supplier', 'Invoice Date', 'Due Date', 'Total', 'Paid', 'Outstanding', 'Bucket']];
    for (const r of data.rows || []) {
      rows.push([r.invoice_no, type === 'receivable' ? r.client_name : r.supplier_name, r.invoice_date, r.due_date, r.grand_total, r.amount_paid, r.outstanding, BUCKET_LABELS[r.bucket]]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `outstanding-${type}-${asOf}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Outstanding Receivable / Payable</h1>
                <p className="text-sm text-blue-100 mt-1">Aged analysis of unpaid invoices and bills as on a given date.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-9 bg-white/10 border-white/25 text-white w-40" />
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className={`rounded-2xl p-5 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Receivable</p>
                <p className="text-3xl font-bold text-emerald-600 mt-1">{fmtC(receivable?.total_outstanding || 0)}</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{(receivable?.rows || []).length} outstanding invoices</p>
              </div>
              <Button onClick={() => exportCSV(receivable, 'receivable')} size="sm" variant="outline" className="gap-1"><Download className="h-3 w-3" />CSV</Button>
            </div>
          </div>
          <div className={`rounded-2xl p-5 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex justify-between items-center">
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Payable</p>
                <p className="text-3xl font-bold text-rose-600 mt-1">{fmtC(payable?.total_outstanding || 0)}</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{(payable?.rows || []).length} outstanding bills</p>
              </div>
              <Button onClick={() => exportCSV(payable, 'payable')} size="sm" variant="outline" className="gap-1"><Download className="h-3 w-3" />CSV</Button>
            </div>
          </div>
        </div>

        {loading ? <ContentLoader /> : (
          <Tabs defaultValue="receivable">
            <TabsList className="rounded-xl">
              <TabsTrigger value="receivable" className="rounded-lg">Receivable</TabsTrigger>
              <TabsTrigger value="payable" className="rounded-lg">Payable</TabsTrigger>
            </TabsList>

            <TabsContent value="receivable" className="mt-4 space-y-4">
              <AgingSummaryBar aging={receivable?.aging || {}} total={receivable?.total_outstanding || 0} isDark={isDark} />
              <OutstandingTable rows={receivable?.rows || []} type="receivable" isDark={isDark} />
            </TabsContent>

            <TabsContent value="payable" className="mt-4 space-y-4">
              <AgingSummaryBar aging={payable?.aging || {}} total={payable?.total_outstanding || 0} isDark={isDark} />
              <OutstandingTable rows={payable?.rows || []} type="payable" isDark={isDark} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default function OutstandingReport() {
  return (
    <RequestAccessGate module="outstanding_report" moduleLabel="Outstanding Report" permissionFlag="can_view_accounting_reports">
      <OutstandingReportInner />
    </RequestAccessGate>
  );
}
