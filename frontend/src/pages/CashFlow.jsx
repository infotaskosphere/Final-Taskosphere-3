import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Activity, RefreshCw, Download } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function SectionBlock({ title, items, total, positive, isDark, totalLabel }) {
  const isPos = total >= 0;
  return (
    <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`px-5 py-3 border-b font-bold text-sm ${isDark ? 'border-slate-700 text-slate-100' : 'border-slate-100 text-slate-900'}`}>{title}</div>
      <div className="p-4 space-y-2">
        {(items || []).map((item, i) => (
          <div key={i} className="flex justify-between items-center py-1">
            <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.name}</span>
            <span className={`font-mono text-sm ${item.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{item.amount >= 0 ? '+' : ''}{fmtC(item.amount)}</span>
          </div>
        ))}
        {(items || []).length === 0 && <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No items for this period.</p>}
        <div className={`flex justify-between items-center pt-2 mt-2 border-t font-bold ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>{totalLabel || 'Total'}</span>
          <span className={`font-mono ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>{total >= 0 ? '+' : ''}{fmtC(total)}</span>
        </div>
      </div>
    </div>
  );
}

function CashFlowInner() {
  const isDark = useDark();
  const curYear = new Date().getFullYear();
  const defaultFy = new Date().getMonth() >= 3 ? `${curYear}-${String(curYear + 1).slice(2)}` : `${curYear - 1}-${String(curYear).slice(2)}`;
  const fyOptions = Array.from({ length: 5 }, (_, i) => { const y = curYear - i; return `${y}-${String(y + 1).slice(2)}`; });

  const [selectedFy, setSelectedFy] = useState(defaultFy);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (fromDate && toDate) { params.from_date = fromDate; params.to_date = toDate; }
      else params.fy = selectedFy;
      const { data: res } = await api.get('/reports/cash-flow', { params });
      setData(res);
    } catch { toast.error('Failed to load Cash Flow'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Section', 'Item', 'Amount']];
    rows.push(['Operating', 'Net Profit', data.operating.net_profit]);
    for (const i of data.operating.working_capital_changes || []) rows.push(['Operating - WC', i.name, i.change]);
    rows.push(['Operating Total', '', data.operating.total]);
    for (const i of data.investing.items || []) rows.push(['Investing', i.name, i.amount]);
    rows.push(['Investing Total', '', data.investing.total]);
    for (const i of data.financing.items || []) rows.push(['Financing', i.name, i.amount]);
    rows.push(['Financing Total', '', data.financing.total]);
    rows.push(['Net Change in Cash', '', data.net_change_in_cash]);
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `cash-flow-${selectedFy}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Activity className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Cash Flow Statement</h1>
                <p className="text-sm text-blue-100 mt-1">Indirect method: operating, investing, and financing activities.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} disabled={!data} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Financial Year</p>
            <Select value={selectedFy} onValueChange={v => { setSelectedFy(v); setFromDate(''); setToDate(''); }}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>or From</p>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>To</p>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-38" />
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        {data?.net_change_in_cash != null && (
          <div className={`rounded-2xl p-5 text-center border ${data.net_change_in_cash >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <p className="text-sm font-medium text-slate-600">Net Change in Cash & Cash Equivalents</p>
            <p className={`text-3xl font-bold mt-1 ${data.net_change_in_cash >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {data.net_change_in_cash >= 0 ? '+' : ''}{fmtC(data.net_change_in_cash)}
            </p>
          </div>
        )}

        {loading ? <ContentLoader /> : data ? (
          <div className="space-y-4">
            <SectionBlock
              title="A. Cash from Operating Activities"
              items={[
                { name: 'Net Profit for the Period', amount: data.operating.net_profit },
                ...(data.operating.working_capital_changes || []).map(i => ({ name: `Change in ${i.name}`, amount: i.change })),
              ]}
              total={data.operating.total}
              totalLabel="Net Cash from Operating Activities"
              isDark={isDark}
            />
            <SectionBlock
              title="B. Cash from Investing Activities"
              items={data.investing.items || []}
              total={data.investing.total}
              totalLabel="Net Cash from Investing Activities"
              isDark={isDark}
            />
            <SectionBlock
              title="C. Cash from Financing Activities"
              items={data.financing.items || []}
              total={data.financing.total}
              totalLabel="Net Cash from Financing Activities"
              isDark={isDark}
            />
          </div>
        ) : (
          <div className={`rounded-2xl p-10 text-center text-sm border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'}`}>
            Select a period and click Apply to load the cash flow statement.
          </div>
        )}
      </div>
    </div>
  );
}

export default function CashFlow() {
  return (
    <RequestAccessGate module="cash_flow" moduleLabel="Cash Flow Statement" permissionFlag="can_view_accounting_reports">
      <CashFlowInner />
    </RequestAccessGate>
  );
}
