import React, { useState, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  BarChart3, Scale, Receipt, PieChart, Download, RefreshCw,
  TrendingUp, TrendingDown, Printer, FileSpreadsheet
} from 'lucide-react';
import FinancialYearSelect from '@/components/ui/FinancialYearSelect';
import { FY_OPTIONS, getCurrentFY } from '@/lib/financialYears';

const COLORS = { mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B', purple:'#7C3AED', teal:'#0D9488' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Math.abs(n)||0);
const fmtRs = n => `₹${fmt(n)}`;

const REPORTS = [
  { id:'pl',     label:'Profit & Loss',  icon:TrendingUp,  color:COLORS.emerald  },
  { id:'bs',     label:'Balance Sheet',  icon:Scale,        color:COLORS.mediumBlue },
  { id:'tb',     label:'Trial Balance',  icon:Receipt,      color:COLORS.amber     },
  { id:'trading',label:'Trading A/c',    icon:PieChart,     color:COLORS.purple    },
];

// FY_OPTIONS imported from @/lib/financialYears — auto-generates all years
// as_on is last day of the FY (March 31 of endYear)
const FYS = FY_OPTIONS.map(o => ({ ...o, as_on: o.to }));

const EXPORT_URLS = {
  pl:      (fy) => `/accounting/reports/export/profit-loss?from_date=${fy.from}&to_date=${fy.to}`,
  bs:      (fy) => `/accounting/reports/export/balance-sheet?as_on=${fy.as_on}`,
  tb:      (fy) => `/accounting/reports/export/trial-balance?from_date=${fy.from}&to_date=${fy.to}`,
  trading: (fy) => null,
};

async function downloadExcel(url, filename) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('Export failed');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  } catch { toast.error('Export failed'); }
}

export default function FinancialReports({ defaultTab }) {
  const dark = useDark();
  const [activeTab, setActiveTab] = useState(defaultTab || 'pl');
  const [fy,        setFy]        = useState(() => { const c = getCurrentFY(); return {...c, as_on: c.to}; });
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(false);

  const fetchReport = useCallback(async (tab = activeTab, fyObj = fy) => {
    setLoading(true);
    try {
      let r;
      if (tab === 'pl')      r = await api.get(`/accounting/reports/profit-loss?from_date=${fyObj.from}&to_date=${fyObj.to}`);
      if (tab === 'bs')      r = await api.get(`/accounting/reports/balance-sheet?as_on=${fyObj.as_on}`);
      if (tab === 'tb')      r = await api.get(`/accounting/reports/trial-balance?from_date=${fyObj.from}&to_date=${fyObj.to}`);
      if (tab === 'trading') r = await api.get(`/accounting/reports/trading-account?from_date=${fyObj.from}&to_date=${fyObj.to}`);
      setData(d => ({...d, [tab]: r?.data}));
    } catch(e) { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [activeTab, fy]);

  const handleTab = tab => { setActiveTab(tab); fetchReport(tab); };
  const handleFy  = fyObj => { setFy(fyObj); fetchReport(activeTab, fyObj); };

  const print = () => window.print();

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 size={22} style={{color:COLORS.mediumBlue}}/> Financial Reports
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Indian Accounting Standards – Ind AS compliant</p>
        </div>
        <div className="flex items-center gap-2">
          <FinancialYearSelect value={fy.label} onChange={f => handleFy({...f, as_on: f.to})} />
          <button onClick={print} className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 text-gray-500" title="Print">
            <Printer size={14}/>
          </button>
          {EXPORT_URLS[activeTab] && EXPORT_URLS[activeTab](fy) && (
            <button
              onClick={() => downloadExcel(EXPORT_URLS[activeTab](fy), `${activeTab}_${fy.label}.xlsx`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              title="Download Excel">
              <FileSpreadsheet size={14} style={{color: COLORS.emerald}}/> Excel
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {REPORTS.map(r => (
          <button key={r.id} onClick={()=>handleTab(r.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab===r.id?'text-white shadow':'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
            style={activeTab===r.id?{background:r.color}:{}}>
            <r.icon size={14}/>{r.label}
          </button>
        ))}
        <button onClick={()=>fetchReport()}
          className="ml-auto p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400">
          <RefreshCw size={14} className={loading?'animate-spin':''}/>
        </button>
      </div>

      {/* Load prompt */}
      {!data[activeTab] && !loading && (
        <div className={`${card} p-10 text-center`}>
          <BarChart3 size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"/>
          <p className="text-gray-500 text-sm mb-3">Click to generate the report</p>
          <button onClick={()=>fetchReport()} className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition" style={{background:COLORS.mediumBlue}}>
            Generate {REPORTS.find(r=>r.id===activeTab)?.label}
          </button>
        </div>
      )}

      {loading && (
        <div className={`${card} p-8 text-center text-gray-400 text-sm`}>
          <RefreshCw size={20} className="animate-spin mx-auto mb-2"/>Generating report…
        </div>
      )}

      {/* ── P&L ── */}
      {!loading && activeTab === 'pl' && data.pl && <PLReport data={data.pl} dark={dark}/>}
      {!loading && activeTab === 'bs' && data.bs && <BSReport data={data.bs} dark={dark}/>}
      {!loading && activeTab === 'tb' && data.tb && <TBReport data={data.tb} dark={dark}/>}
      {!loading && activeTab === 'trading' && data.trading && <TradingReport data={data.trading} dark={dark}/>}
    </div>
  );
}

// ─── P & L ────────────────────────────────────────────────────────────────────
function PLReport({ data, dark }) {
  const isProfit = data.net_profit >= 0;
  return (
    <div className="space-y-4 print:space-y-2">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Income',   value: fmtRs(data.total_income),   color: COLORS.emerald, icon: TrendingUp },
          { label:'Total Expenses', value: fmtRs(data.total_expense),  color: COLORS.coral,   icon: TrendingDown },
          { label: isProfit?'Net Profit':'Net Loss', value: fmtRs(data.net_profit), color: isProfit?COLORS.emerald:COLORS.coral, icon: isProfit?TrendingUp:TrendingDown },
        ].map(m => (
          <div key={m.label} className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <m.icon size={16} style={{color:m.color}}/>
              <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
            </div>
            <p className="text-xl font-bold" style={{color:m.color}}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Income */}
        <ReportTable title="Income" color={COLORS.emerald} rows={data.income} totalLabel="Total Income" total={data.total_income}/>
        {/* Expenses */}
        <ReportTable title="Expenses" color={COLORS.coral} rows={data.expenses} totalLabel="Total Expenses" total={data.total_expense}/>
      </div>

      {/* Net */}
      <div className={`${card} p-4`} style={{borderLeft:`4px solid ${isProfit?COLORS.emerald:COLORS.coral}`}}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-800 dark:text-white text-sm">{isProfit ? '✅ Net Profit' : '❌ Net Loss'} for the period {data.from_date} to {data.to_date}</p>
          <p className="text-xl font-bold" style={{color:isProfit?COLORS.emerald:COLORS.coral}}>{fmtRs(data.net_profit)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Balance Sheet ─────────────────────────────────────────────────────────────
function BSReport({ data, dark }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className={`${card} p-4`}><p className="text-xs text-gray-500 dark:text-gray-400">Total Assets</p><p className="text-xl font-bold" style={{color:COLORS.mediumBlue}}>{fmtRs(data.total_assets)}</p></div>
        <div className={`${card} p-4`}><p className="text-xs text-gray-500 dark:text-gray-400">Total Liabilities + Capital</p><p className="text-xl font-bold" style={{color:COLORS.amber}}>{fmtRs(data.total_liabilities)}</p></div>
      </div>
      {!data.balanced && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs">
          ⚠ Balance sheet may not be balanced — some transactions might be missing opening entries.
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Assets */}
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800" style={{borderLeft:`4px solid ${COLORS.mediumBlue}`}}>
            <p className="font-bold text-gray-800 dark:text-white text-sm">ASSETS</p>
            <p className="text-xs text-gray-400">As on {data.as_on}</p>
          </div>
          {Object.entries(data.assets||{}).map(([grp,items]) => items.length > 0 && (
            <div key={grp} className="px-4 py-2 border-b border-gray-50 dark:border-gray-800/50 last:border-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{grp}</p>
              {items.map(item => (
                <div key={item.code} className="flex justify-between py-1">
                  <span className="text-xs text-gray-700 dark:text-gray-300">{item.name}</span>
                  <span className="text-xs font-medium text-gray-800 dark:text-white">{fmtRs(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sub-Total</span>
                <span className="text-xs font-bold" style={{color:COLORS.mediumBlue}}>{fmtRs(items.reduce((s,i)=>s+i.amount,0))}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
            <span className="font-bold text-gray-800 dark:text-white text-sm">TOTAL ASSETS</span>
            <span className="font-bold text-lg" style={{color:COLORS.mediumBlue}}>{fmtRs(data.total_assets)}</span>
          </div>
        </div>
        {/* Liabilities */}
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800" style={{borderLeft:`4px solid ${COLORS.amber}`}}>
            <p className="font-bold text-gray-800 dark:text-white text-sm">LIABILITIES & CAPITAL</p>
            <p className="text-xs text-gray-400">As on {data.as_on}</p>
          </div>
          {Object.entries(data.liabilities||{}).map(([grp,items]) => items.length > 0 && (
            <div key={grp} className="px-4 py-2 border-b border-gray-50 dark:border-gray-800/50 last:border-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{grp}</p>
              {items.map(item => (
                <div key={item.code||item.name} className="flex justify-between py-1">
                  <span className="text-xs text-gray-700 dark:text-gray-300">{item.name}</span>
                  <span className="text-xs font-medium text-gray-800 dark:text-white">{fmtRs(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between py-1 border-t border-gray-100 dark:border-gray-700 mt-1">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sub-Total</span>
                <span className="text-xs font-bold" style={{color:COLORS.amber}}>{fmtRs(items.reduce((s,i)=>s+i.amount,0))}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
            <span className="font-bold text-gray-800 dark:text-white text-sm">TOTAL LIABILITIES</span>
            <span className="font-bold text-lg" style={{color:COLORS.amber}}>{fmtRs(data.total_liabilities)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trial Balance ─────────────────────────────────────────────────────────────
function TBReport({ data, dark }) {
  const TYPE_COLORS = { Asset:'#1F6FB2', Liability:'#F59E0B', Capital:'#7C3AED', Revenue:'#1FAF5A', Expense:'#EF4444' };
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <p className="font-bold text-gray-800 dark:text-white text-sm">Trial Balance</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.balanced?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400':'bg-red-100 text-red-700'}`}>
          {data.balanced ? '✓ Balanced' : '⚠ Not Balanced'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">Account Name</th>
              <th className="text-left px-4 py-2 hidden md:table-cell">Type</th>
              <th className="text-right px-4 py-2 text-blue-500">Debit (₹)</th>
              <th className="text-right px-4 py-2 text-amber-500">Credit (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {(data.rows||[]).filter(r=>r.dr>0||r.cr>0).map(r => (
              <tr key={r.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-1.5 font-mono font-semibold" style={{color:TYPE_COLORS[r.type]||'#888'}}>{r.code}</td>
                <td className="px-4 py-1.5 text-gray-700 dark:text-gray-200">{r.name}</td>
                <td className="px-4 py-1.5 text-gray-400 hidden md:table-cell">{r.type}</td>
                <td className="px-4 py-1.5 text-right text-blue-600 dark:text-blue-400 font-medium">{r.dr > 0 ? fmt(r.dr) : '—'}</td>
                <td className="px-4 py-1.5 text-right text-amber-600 dark:text-amber-400 font-medium">{r.cr > 0 ? fmt(r.cr) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 font-bold">
              <td colSpan={3} className="px-4 py-2 text-gray-800 dark:text-white">TOTAL</td>
              <td className="px-4 py-2 text-right text-blue-600 dark:text-blue-400 text-sm">{fmtRs(data.total_dr)}</td>
              <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400 text-sm">{fmtRs(data.total_cr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Trading Account ───────────────────────────────────────────────────────────
function TradingReport({ data, dark }) {
  const isGrossProfit = data.gross_profit >= 0;
  return (
    <div className="space-y-4">
      <div className={`${card} p-4`} style={{borderLeft:`4px solid ${isGrossProfit?COLORS.emerald:COLORS.coral}`}}>
        <p className="text-xs text-gray-500 dark:text-gray-400">{isGrossProfit?'Gross Profit':'Gross Loss'}</p>
        <p className="text-2xl font-bold" style={{color:isGrossProfit?COLORS.emerald:COLORS.coral}}>{fmtRs(data.gross_profit)}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <ReportTable title="Dr Side (Expenses)" color={COLORS.coral}   rows={data.debit_side}  totalLabel="Total" total={data.total_debit}  gpLabel={!isGrossProfit?'Gross Loss':undefined} gpValue={!isGrossProfit?data.gross_profit:undefined}/>
        <ReportTable title="Cr Side (Income)"   color={COLORS.emerald} rows={data.credit_side} totalLabel="Total" total={data.total_credit} gpLabel={isGrossProfit?'Gross Profit':undefined} gpValue={isGrossProfit?data.gross_profit:undefined}/>
      </div>
    </div>
  );
}

// ─── Shared Table ─────────────────────────────────────────────────────────────
function ReportTable({ title, color, rows=[], totalLabel, total, gpLabel, gpValue }) {
  const card2 = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm overflow-hidden";
  return (
    <div className={card2}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800" style={{borderLeft:`4px solid ${color}`}}>
        <p className="font-bold text-gray-800 dark:text-white text-sm">{title}</p>
      </div>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
          {rows.map((r,i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-4 py-2 text-gray-700 dark:text-gray-200">{r.label||r.name}</td>
              <td className="px-4 py-2 text-right font-medium text-gray-800 dark:text-white">{fmtRs(r.amount)}</td>
            </tr>
          ))}
          {gpLabel && <tr className="border-t border-dashed border-gray-200 dark:border-gray-700">
            <td className="px-4 py-2 font-semibold" style={{color}}>{gpLabel}</td>
            <td className="px-4 py-2 text-right font-bold" style={{color}}>{fmtRs(gpValue)}</td>
          </tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <td className="px-4 py-2 font-bold text-gray-800 dark:text-white">{totalLabel}</td>
            <td className="px-4 py-2 text-right font-bold text-sm" style={{color}}>{fmtRs(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
