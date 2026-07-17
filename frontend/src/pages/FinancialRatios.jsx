import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtRatio = (n) => n == null ? 'N/A' : Number(n).toFixed(2);
const fmtPct = (n) => n == null ? 'N/A' : `${(Number(n) * 100).toFixed(1)}%`;

function RatioCard({ label, value, format = 'ratio', target, description, isDark }) {
  const numVal = Number(value);
  const formatted = format === 'pct' ? fmtPct(value) : format === 'currency' ? fmtC(value) : fmtRatio(value);
  let health = 'neutral';
  if (target && value != null) {
    if (label.includes('Debt')) health = numVal < target ? 'good' : 'warn';
    else health = numVal >= target ? 'good' : 'warn';
  }
  const healthColors = { good: 'text-emerald-600', warn: 'text-amber-600', neutral: isDark ? 'text-slate-200' : 'text-slate-900' };
  const Icon = health === 'good' ? TrendingUp : health === 'warn' ? TrendingDown : Minus;
  return (
    <div className={`rounded-2xl p-5 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
        <Icon className={`h-4 w-4 ${healthColors[health]}`} />
      </div>
      <p className={`text-2xl font-bold mt-2 font-mono ${healthColors[health]}`}>{formatted}</p>
      {description && <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{description}</p>}
      {target != null && (
        <div className="mt-3">
          <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <div className={`h-1.5 rounded-full transition-all ${health === 'good' ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (numVal / (target * 2)) * 100)}%` }} />
          </div>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Target: ≥ {target}</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, isDark }) {
  return (
    <div>
      <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function FinancialRatiosInner() {
  const isDark = useDark();
  const curYear = new Date().getFullYear();
  const fy = new Date().getMonth() >= 3 ? `${curYear}-${String(curYear + 1).slice(2)}` : `${curYear - 1}-${String(curYear).slice(2)}`;
  const fyOptions = Array.from({ length: 5 }, (_, i) => { const y = curYear - i; return `${y}-${String(y + 1).slice(2)}`; });
  const [selectedFy, setSelectedFy] = useState(fy);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/reports/financial-ratios', { params: { fy: selectedFy, as_of: asOf } });
      setData(res);
    } catch { toast.error('Failed to load financial ratios'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <BarChart3 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Financial Ratios</h1>
                <p className="text-sm text-blue-100 mt-1">Liquidity, profitability, and solvency ratios derived live from your books.</p>
              </div>
            </div>
            <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>FY (P&L window)</p>
            <Select value={selectedFy} onValueChange={setSelectedFy}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Balance Sheet As-Of</p>
            <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-9 w-40" />
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        {/* P&L Summary */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Revenue', value: fmtC(data.revenue), color: 'text-blue-600' },
              { label: 'Net Profit', value: fmtC(data.net_profit), color: data.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600' },
              { label: 'Total Assets', value: fmtC(data.total_assets), color: isDark ? 'text-slate-200' : 'text-slate-900' },
              { label: 'Working Capital', value: fmtC(data.working_capital), color: data.working_capital >= 0 ? 'text-emerald-600' : 'text-rose-600' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-4 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
                <p className={`text-lg font-bold mt-1 font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {loading ? <ContentLoader /> : data ? (
          <div className="space-y-6">
            <Section title="Liquidity Ratios" isDark={isDark}>
              <RatioCard label="Current Ratio" value={data.liquidity?.current_ratio} target={2} description="Current assets ÷ Current liabilities. Ideal ≥ 2:1" isDark={isDark} />
              <RatioCard label="Quick Ratio" value={data.liquidity?.quick_ratio} target={1} description="(Current assets − Cash) ÷ Current liabilities. Ideal ≥ 1:1" isDark={isDark} />
              <RatioCard label="Cash Ratio" value={data.liquidity?.cash_ratio} description="Cash & bank ÷ Current liabilities" isDark={isDark} />
            </Section>

            <Section title="Profitability Ratios" isDark={isDark}>
              <RatioCard label="Gross Profit Margin" value={data.profitability?.gross_profit_margin} format="pct" target={0.2} description="Net profit ÷ Revenue" isDark={isDark} />
              <RatioCard label="Net Profit Margin" value={data.profitability?.net_profit_margin} format="pct" target={0.1} description="Net profit ÷ Revenue" isDark={isDark} />
              <RatioCard label="Return on Assets" value={data.profitability?.return_on_assets} format="pct" target={0.05} description="Net profit ÷ Total assets" isDark={isDark} />
              <RatioCard label="Return on Equity" value={data.profitability?.return_on_equity} format="pct" target={0.15} description="Net profit ÷ Total equity" isDark={isDark} />
            </Section>

            <Section title="Solvency Ratios" isDark={isDark}>
              <RatioCard label="Debt-to-Equity" value={data.solvency?.debt_to_equity} description="Total liabilities ÷ Total equity. Lower is safer." isDark={isDark} />
              <RatioCard label="Debt-to-Assets" value={data.solvency?.debt_to_assets} format="pct" description="Total liabilities ÷ Total assets" isDark={isDark} />
              <RatioCard label="Equity Ratio" value={data.solvency?.equity_ratio} format="pct" target={0.4} description="Total equity ÷ Total assets. Ideal ≥ 40%" isDark={isDark} />
            </Section>
          </div>
        ) : (
          <div className={`rounded-2xl p-10 text-center text-sm border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'}`}>
            Apply filters above to compute ratios.
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinancialRatios() {
  return (
    <RequestAccessGate module="financial_ratios" moduleLabel="Financial Ratios" permissionFlag="can_view_accounting_reports">
      <FinancialRatiosInner />
    </RequestAccessGate>
  );
}
