import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { TrendingUp, RefreshCw, Download } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtChg = (n) => {
  if (n == null) return '—';
  const pos = n >= 0;
  return <span className={pos ? 'text-emerald-600' : 'text-rose-600'}>{pos ? '+' : ''}{fmtC(n)}</span>;
};
const fmtPctChg = (n) => {
  if (n == null || isNaN(n)) return null;
  const pos = n >= 0;
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${pos ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{pos ? '+' : ''}{Number(n).toFixed(1)}%</span>;
};

function CompareTable({ rows, label1, label2, isDark }) {
  if (!rows?.length) return <p className={`text-sm text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No data for this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
            <th className="px-4 py-3 text-left">Account</th>
            <th className="px-4 py-3 text-right">{label1}</th>
            <th className="px-4 py-3 text-right">{label2}</th>
            <th className="px-4 py-3 text-right">Change</th>
            <th className="px-4 py-3 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code || i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
              <td className="px-4 py-2.5">
                <span className={`text-xs font-mono mr-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{r.code}</span>
                {r.name}
              </td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtC(r.fy1)}</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtC(r.fy2)}</td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtChg(r.change)}</td>
              <td className="px-4 py-2.5 text-right">{r.fy1 ? fmtPctChg(r.change_pct) : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, fy1, fy2, change, isDark, bold }) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{label}</span>
      <div className="flex items-center gap-8">
        <span className={`font-mono text-sm w-32 text-right ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{fmtC(fy1)}</span>
        <span className={`font-mono text-sm w-32 text-right ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(fy2)}</span>
        <span className="font-mono text-sm w-32 text-right">{fmtChg(change)}</span>
      </div>
    </div>
  );
}

function ComparativeReportInner() {
  const isDark = useDark();
  const curYear = new Date().getFullYear();
  const mkFy = (y) => `${y}-${String(y + 1).slice(2)}`;
  const currentFy = new Date().getMonth() >= 3 ? mkFy(curYear) : mkFy(curYear - 1);
  const fyOptions = Array.from({ length: 7 }, (_, i) => mkFy(curYear - i));

  const [fy1, setFy1] = useState(mkFy(parseInt(currentFy) - 1));
  const [fy2, setFy2] = useState(currentFy);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/reports/comparative', { params: { fy1, fy2 } });
      setData(res);
    } catch { toast.error('Failed to load comparative report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Type', 'Code', 'Name', `FY ${fy1}`, `FY ${fy2}`, 'Change', 'Change %']];
    for (const r of data.income || []) rows.push(['Income', r.code, r.name, r.fy1, r.fy2, r.change, r.change_pct]);
    for (const r of data.expenses || []) rows.push(['Expense', r.code, r.name, r.fy1, r.fy2, r.change, r.change_pct]);
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `comparative-${fy1}-vs-${fy2}.csv`; a.click();
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
                <TrendingUp className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Comparative Report</h1>
                <p className="text-sm text-blue-100 mt-1">Side-by-side P&L comparison across two financial years with change analysis.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20" disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        {/* FY Selector */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Base Year (FY 1)</p>
            <Select value={fy1} onValueChange={setFy1}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={`text-sm font-bold pb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>vs</div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Compare Year (FY 2)</p>
            <Select value={fy2} onValueChange={setFy2}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Compare'}
          </Button>
        </div>

        {/* Summary Banner */}
        {data?.summary && (
          <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`px-5 py-3 border-b flex gap-4 font-semibold text-xs uppercase tracking-wide ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
              <span className="flex-1">Metric</span>
              <span className="w-32 text-right">FY {data.fy1}</span>
              <span className="w-32 text-right">FY {data.fy2}</span>
              <span className="w-32 text-right">Change</span>
            </div>
            <div className="px-5">
              <SummaryRow label="Total Income" fy1={data.summary.fy1.total_income} fy2={data.summary.fy2.total_income} change={data.summary.change.total_income} isDark={isDark} />
              <SummaryRow label="Total Expenses" fy1={data.summary.fy1.total_expense} fy2={data.summary.fy2.total_expense} change={data.summary.change.total_expense} isDark={isDark} />
              <SummaryRow label="Net Profit / Loss" fy1={data.summary.fy1.net_profit} fy2={data.summary.fy2.net_profit} change={data.summary.change.net_profit} isDark={isDark} bold />
            </div>
          </div>
        )}

        {/* Detail Tabs */}
        {loading ? <ContentLoader /> : data ? (
          <Tabs defaultValue="income">
            <TabsList className="rounded-xl">
              <TabsTrigger value="income" className="rounded-lg">Income</TabsTrigger>
              <TabsTrigger value="expenses" className="rounded-lg">Expenses</TabsTrigger>
            </TabsList>
            <TabsContent value="income" className="mt-4">
              <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <CompareTable rows={data.income} label1={`FY ${data.fy1}`} label2={`FY ${data.fy2}`} isDark={isDark} />
              </div>
            </TabsContent>
            <TabsContent value="expenses" className="mt-4">
              <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <CompareTable rows={data.expenses} label1={`FY ${data.fy1}`} label2={`FY ${data.fy2}`} isDark={isDark} />
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}

export default function ComparativeReport() {
  return (
    <RequestAccessGate module="comparative_report" moduleLabel="Comparative Report" permissionFlag="can_view_accounting_reports">
      <ComparativeReportInner />
    </RequestAccessGate>
  );
}
