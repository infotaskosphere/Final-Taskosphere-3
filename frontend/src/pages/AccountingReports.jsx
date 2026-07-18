import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart3, RefreshCw, CheckCircle2, AlertTriangle,
  BookOpen, Landmark, Activity, TrendingUp, TrendingDown,
  CalendarRange, Shield, Scale, Upload, ArrowLeftRight, ExternalLink,
} from 'lucide-react';
import GifLoader, { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import { GuidanceNote } from '@/components/ui/GuidanceNote.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ── Shared sub-components ─────────────────────────────────────────────── */
function ReportCard({ title, children, isDark }) {
  return (
    <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="p-4 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        <h3 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ label, value, isDark, bold }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-sm ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{label}</span>
      <span className={`text-sm font-mono ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(value)}</span>
    </div>
  );
}

/* ── Quick-link cards for extended reports ─────────────────────────────── */
const EXTENDED_REPORTS = [
  { path: '/day-book',            icon: BookOpen,      label: 'Day Book',             desc: 'All transactions grouped by date' },
  { path: '/cash-bank-book',      icon: Landmark,      label: 'Cash / Bank Book',     desc: 'Running balance ledger per account' },
  { path: '/cash-flow',           icon: Activity,      label: 'Cash Flow Statement',  desc: 'Indirect method: operating / investing / financing' },
  { path: '/outstanding-report',  icon: AlertTriangle, label: 'Outstanding',          desc: 'Receivable & payable aging buckets' },
  { path: '/bank-reconciliation', icon: ArrowLeftRight,label: 'Bank Reconciliation',  desc: 'Upload statement & match to journal lines' },
  { path: '/depreciation',        icon: TrendingDown,  label: 'Depreciation Schedule',desc: 'Fixed asset register with SLM / WDV schedule' },
  { path: '/tds-tcs',             icon: Shield,        label: 'TDS / TCS',            desc: 'Deduction ledger with auto journal posting' },
  { path: '/financial-ratios',    icon: BarChart3,     label: 'Financial Ratios',     desc: 'Liquidity, profitability & solvency ratios' },
  { path: '/comparative-report',  icon: TrendingUp,    label: 'Comparative Report',   desc: 'Two-year P&L side-by-side with % change' },
  { path: '/yearly-report',       icon: CalendarRange, label: 'Year-wise Report',     desc: 'Multi-year trend with bar chart' },
  { path: '/opening-balances',    icon: Scale,         label: 'Opening Balances',     desc: 'Set per-FY opening balances & post journal' },
  { path: '/accounting-audit-trail', icon: CheckCircle2, label: 'Accounting Audit Trail', desc: 'Immutable log of all accounting actions' },
  { path: '/bulk-import',         icon: Upload,        label: 'Bulk Journal Import',  desc: 'Import hundreds of entries via JSON, async' },
];

function ExtendedReportsGrid({ isDark }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {EXTENDED_REPORTS.map(r => {
        const Icon = r.icon;
        return (
          <button
            key={r.path}
            onClick={() => navigate(r.path)}
            className={`text-left rounded-2xl border p-4 flex items-start gap-3 transition-all hover:shadow-md active:scale-[0.98] ${
              isDark ? 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:bg-slate-700/60' : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
            }`}
          >
            <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${COLORS.mediumBlue}18` }}>
              <Icon className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{r.label}</p>
                <ExternalLink className="h-3 w-3 text-slate-400" />
              </div>
              <p className={`text-xs mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Main inner component ──────────────────────────────────────────────── */
function AccountingReportsInner() {
  const isDark = useDark();
  const [loading, setLoading] = useState(true);
  const [trialBalance, setTrialBalance] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tbR, pnlR, bsR] = await Promise.allSettled([
        api.get('/reports/trial-balance'),
        api.get('/reports/profit-loss'),
        api.get('/reports/balance-sheet'),
      ]);
      setTrialBalance(tbR.status === 'fulfilled' ? tbR.value.data : null);
      setPnl(pnlR.status === 'fulfilled' ? pnlR.value.data : null);
      setBalanceSheet(bsR.status === 'fulfilled' ? bsR.value.data : null);
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  if (loading) return <ContentLoader />;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <BarChart3 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Accounting Reports</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">
                  Trial Balance, P&amp;L, and Balance Sheet — live from every posted journal entry.
                  Plus 13 extended reports for day book, cash flow, aging, depreciation, TDS/TCS and more.
                </p>
              </div>
            </div>
            <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>

        <GuidanceNote pageKey="accounting-reports" isDark={isDark} />

        {/* Tabs */}
        <Tabs defaultValue="trial-balance">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="extended">More Reports ✦</TabsTrigger>
          </TabsList>

          {/* ── Trial Balance ── */}
          <TabsContent value="trial-balance" className="mt-4">
            <ReportCard title="Trial Balance" isDark={isDark}>
              {!trialBalance || trialBalance.rows.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No journal entries posted yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_120px_120px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                  </div>
                  {trialBalance.rows.map(r => (
                    <div key={r.account_id} className="grid grid-cols-[1fr_120px_120px] gap-2 py-1.5 text-sm">
                      <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.code} — {r.name}</span>
                      <span className="text-right font-mono">{r.debit ? fmtC(r.debit) : ''}</span>
                      <span className="text-right font-mono">{r.credit ? fmtC(r.credit) : ''}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_120px_120px] gap-2 pt-2 mt-2 border-t font-bold text-sm" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>Total</span>
                    <span className="text-right font-mono">{fmtC(trialBalance.total_debit)}</span>
                    <span className="text-right font-mono">{fmtC(trialBalance.total_credit)}</span>
                  </div>
                  <div className={`mt-3 flex items-center gap-2 text-sm font-semibold ${trialBalance.balanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {trialBalance.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {trialBalance.balanced ? 'Balanced' : 'Not balanced — check recent entries'}
                  </div>
                </>
              )}
            </ReportCard>
          </TabsContent>

          {/* ── P&L ── */}
          <TabsContent value="pnl" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <ReportCard title="Income" isDark={isDark}>
                {(pnl?.income || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No income posted yet.</p> :
                  pnl.income.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                <Row label="Total Income" value={pnl?.total_income} isDark={isDark} bold />
              </ReportCard>
              <ReportCard title="Expenses" isDark={isDark}>
                {(pnl?.expenses || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No expenses posted yet.</p> :
                  pnl.expenses.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                <Row label="Total Expenses" value={pnl?.total_expense} isDark={isDark} bold />
              </ReportCard>
            </div>
            <div className={`mt-4 rounded-2xl p-5 text-center font-bold text-lg ${pnl?.net_profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              Net {pnl?.net_profit >= 0 ? 'Profit' : 'Loss'}: {fmtC(Math.abs(pnl?.net_profit || 0))}
            </div>
          </TabsContent>

          {/* ── Balance Sheet ── */}
          <TabsContent value="balance-sheet" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <ReportCard title="Assets" isDark={isDark}>
                {(balanceSheet?.assets || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No assets posted yet.</p> :
                  balanceSheet.assets.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                <Row label="Total Assets" value={balanceSheet?.total_assets} isDark={isDark} bold />
              </ReportCard>
              <div className="space-y-4">
                <ReportCard title="Liabilities" isDark={isDark}>
                  {(balanceSheet?.liabilities || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No liabilities posted yet.</p> :
                    balanceSheet.liabilities.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                  <Row label="Total Liabilities" value={balanceSheet?.total_liabilities} isDark={isDark} bold />
                </ReportCard>
                <ReportCard title="Equity" isDark={isDark}>
                  {(balanceSheet?.equity || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No equity posted yet.</p> :
                    balanceSheet.equity.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                  <Row label="Total Equity" value={balanceSheet?.total_equity} isDark={isDark} bold />
                </ReportCard>
              </div>
            </div>
            <div className={`mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-xl ${balanceSheet?.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {balanceSheet?.balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Assets {fmtC(balanceSheet?.total_assets)} = Liabilities + Equity {fmtC((balanceSheet?.total_liabilities || 0) + (balanceSheet?.total_equity || 0))}
            </div>
          </TabsContent>

          {/* ── Extended Reports ── */}
          <TabsContent value="extended" className="mt-4">
            <div className={`mb-4 rounded-2xl px-4 py-3 border text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
              These are standalone full-page reports. Click any card to open it — it will open in the same app with its own filters, date pickers, and export options.
            </div>
            <ExtendedReportsGrid isDark={isDark} />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

function AccountingReports() {
  return (
    <RequestAccessGate module="accounting_reports" moduleLabel="Accounting Reports" permissionFlag="can_view_accounting_reports">
      <AccountingReportsInner />
    </RequestAccessGate>
  );
}

export default AccountingReports;
