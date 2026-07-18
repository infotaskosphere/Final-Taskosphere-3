/**
 * ReportShared.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared building blocks for the 13 Accounting → Extended Reports pages
 * (Day Book, Cash/Bank Book, Cash Flow, Outstanding, Bank Reconciliation,
 * Depreciation, TDS/TCS, Financial Ratios, Comparative, Yearly, Opening
 * Balances, Audit Trail, Bulk Import).
 *
 * Keeping this in one file avoids repeating the header / card / date-filter
 * markup across 13 separate pages.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import FinancialYearSelect from '@/components/ui/FinancialYearSelect.jsx';
import { getCurrentFY } from '@/lib/financialYears';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber: '#F59E0B',
  coral: '#FF6B6B',
};

export const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const fmtN = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const fmtPct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`);

export function currentFYLabel() {
  try {
    return getCurrentFY().label;
  } catch {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
  }
}

/** Page header: icon, title, subtitle, back button, optional right-side actions */
export function PageHeader({ icon: Icon, title, subtitle, isDark, onRefresh, refreshing, extra }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
      <div className="p-5 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-white">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/accounting-reports')}
            className="h-9 w-9 shrink-0 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition"
            aria-label="Back to Accounting Reports"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {Icon && (
            <div className="h-12 w-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg shrink-0">
              <Icon className="h-6 w-6" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts · Extended Report</p>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight mt-1">{title}</h1>
            {subtitle && <p className="text-sm text-blue-100 mt-1 max-w-2xl">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {extra}
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportCard({ title, children, isDark, action }) {
  return (
    <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="p-4 border-b flex items-center justify-between gap-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        <h3 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Row({ label, value, isDark, bold, fmt = fmtC }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-sm ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmt(value)}</span>
    </div>
  );
}

export function EmptyState({ text }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{text}</p>;
}

/** Date range / FY filter bar. Two modes: "fy" (Financial Year dropdown) or "custom" (from/to date inputs). */
export function DateFilterBar({ mode, setMode, fy, setFy, fromDate, setFromDate, toDate, setToDate, isDark, extra }) {
  return (
    <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
        <button
          onClick={() => setMode('fy')}
          className={`px-3 py-1.5 text-xs font-semibold ${mode === 'fy' ? 'text-white' : (isDark ? 'text-slate-300' : 'text-slate-600')}`}
          style={mode === 'fy' ? { background: COLORS.mediumBlue } : {}}
        >
          Financial Year
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-3 py-1.5 text-xs font-semibold ${mode === 'custom' ? 'text-white' : (isDark ? 'text-slate-300' : 'text-slate-600')}`}
          style={mode === 'custom' ? { background: COLORS.mediumBlue } : {}}
        >
          Custom Range
        </button>
      </div>
      {mode === 'fy' ? (
        <FinancialYearSelect value={fy} onChange={(opt) => setFy(opt.label)} />
      ) : (
        <>
          <input
            type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className={`px-3 py-2 rounded-xl text-sm border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
          />
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>to</span>
          <input
            type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className={`px-3 py-2 rounded-xl text-sm border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
          />
        </>
      )}
      {extra}
    </div>
  );
}

export function PageShell({ children, isDark }) {
  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">{children}</div>
    </div>
  );
}
