import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CalendarRange, RefreshCw, Download } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS_MAP = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtCFull = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function YearlyReportInner() {
  const isDark = useDark();
  const [years, setYears] = useState('5');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/reports/yearly', { params: { years: Number(years) } });
      setData(res);
    } catch { toast.error('Failed to load yearly report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const chartData = (data?.years || []).map(y => ({
    name: `FY ${y.fy}`,
    Income: Math.round(y.total_income),
    Expenses: Math.round(y.total_expense),
    'Net Profit': Math.round(y.net_profit),
  }));

  const exportCSV = () => {
    if (!data) return;
    const rows = [['FY', 'Total Income', 'Total Expenses', 'Net Profit / Loss']];
    for (const y of data.years) rows.push([y.fy, y.total_income, y.total_expense, y.net_profit]);
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'yearly-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS_MAP.deepBlue}, ${COLORS_MAP.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <CalendarRange className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Year-wise Report</h1>
                <p className="text-sm text-blue-100 mt-1">Multi-year trend of income, expenses and profitability.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} disabled={!data} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 flex items-end gap-3 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Number of Years</p>
            <Select value={years} onValueChange={setYears}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['3', '5', '7', '10'].map(n => <SelectItem key={n} value={n}>{n} years</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS_MAP.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        {loading ? <ContentLoader /> : data ? (
          <>
            {/* Bar Chart */}
            <div className={`rounded-2xl border shadow-sm p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <p className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Revenue vs Expenses vs Net Profit</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} />
                  <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                  <Tooltip formatter={(v) => fmtCFull(v)} contentStyle={{ background: isDark ? '#1e293b' : '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }} />
                  <Legend />
                  <Bar dataKey="Income" fill={COLORS_MAP.mediumBlue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" fill={COLORS_MAP.coral} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Net Profit" fill={COLORS_MAP.emeraldGreen} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data Table */}
            <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                    <th className="px-5 py-3 text-left">Financial Year</th>
                    <th className="px-5 py-3 text-right">Total Income</th>
                    <th className="px-5 py-3 text-right">Total Expenses</th>
                    <th className="px-5 py-3 text-right">Net Profit / Loss</th>
                    <th className="px-5 py-3 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.years || []).map((y, i) => {
                    const margin = y.total_income > 0 ? ((y.net_profit / y.total_income) * 100).toFixed(1) : 0;
                    return (
                      <tr key={y.fy} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                        <td className="px-5 py-3 font-semibold">FY {y.fy}</td>
                        <td className="px-5 py-3 text-right font-mono text-blue-600">{fmtCFull(y.total_income)}</td>
                        <td className="px-5 py-3 text-right font-mono text-rose-600">{fmtCFull(y.total_expense)}</td>
                        <td className={`px-5 py-3 text-right font-mono font-bold ${y.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {y.net_profit >= 0 ? '+' : ''}{fmtCFull(y.net_profit)}
                        </td>
                        <td className={`px-5 py-3 text-right font-semibold ${Number(margin) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{margin}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function YearlyReport() {
  return (
    <RequestAccessGate module="yearly_report" moduleLabel="Year-wise Report" permissionFlag="can_view_accounting_reports">
      <YearlyReportInner />
    </RequestAccessGate>
  );
}
