import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, BookOpen, Upload, FileText,
  BarChart3, PieChart, Scale, ArrowUpRight, ArrowDownRight,
  RefreshCw, IndianRupee, Layers, BookMarked, Receipt, Activity,
  Building2, ChevronRight, AlertCircle, Zap
} from 'lucide-react';

const COLORS = {
  deepBlue: '#0D3B66', mediumBlue: '#1F6FB2',
  emerald: '#1FAF5A',  lightGreen: '#5CCB5F',
  amber: '#F59E0B',    coral: '#EF4444',
  purple: '#7C3AED',   teal: '#0D9488',
};

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0);
const fmtRs = (n) => `₹${fmt(n)}`;

const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";

export default function AccountingDashboard() {
  const dark = useDark();
  const nav  = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fy, setFy] = useState({ from: '2024-04-01', to: '2025-03-31' });

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/accounting/reports/summary?from_date=${fy.from}&to_date=${fy.to}`);
      setSummary(r.data);
    } catch (e) {
      if (e?.response?.status === 422 || e?.response?.status === 500) {
        setSummary({ total_journal_entries:0,total_bank_statements:0,total_accounts:0,net_profit:0,total_income:0,total_expense:0,total_assets:0,total_liabilities:0 });
      } else {
        toast.error('Failed to load accounting summary');
      }
    } finally { setLoading(false); }
  }, [fy]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const metricCards = summary ? [
    { icon: TrendingUp,   label: 'Total Income',     value: fmtRs(summary.total_income),   color: COLORS.emerald,  sub: 'All revenue accounts',  path: '/accounting/pl' },
    { icon: TrendingDown, label: 'Total Expenses',   value: fmtRs(summary.total_expense),  color: COLORS.coral,    sub: 'All expense accounts',  path: '/accounting/pl' },
    { icon: Activity,     label: 'Net Profit/Loss',  value: fmtRs(summary.net_profit),     color: summary.net_profit >= 0 ? COLORS.emerald : COLORS.coral, sub: summary.net_profit >= 0 ? 'Profitable ✓' : 'Loss', path: '/accounting/pl' },
    { icon: Scale,        label: 'Total Assets',     value: fmtRs(summary.total_assets),   color: COLORS.mediumBlue, sub: 'Fixed + Current',      path: '/accounting/balance-sheet' },
    { icon: Building2,    label: 'Total Liabilities',value: fmtRs(summary.total_liabilities), color: COLORS.amber, sub: 'Capital + Payables',   path: '/accounting/balance-sheet' },
    { icon: BookOpen,     label: 'Journal Entries',  value: summary.total_journal_entries, color: COLORS.purple,  sub: 'Posted entries',        path: '/accounting/journal' },
    { icon: Upload,       label: 'Bank Statements',  value: summary.total_bank_statements, color: COLORS.teal,    sub: 'Uploaded & processed',  path: '/accounting/bank-statements' },
    { icon: Layers,       label: 'Accounts',         value: summary.total_accounts,        color: COLORS.deepBlue, sub: 'Chart of Accounts',    path: '/accounting/accounts' },
  ] : [];

  const quickActions = [
    { icon: Upload,    label: 'Upload Bank Statement', desc: 'Import SBI/HDFC/ICICI/Axis PDF or Excel', path: '/accounting/bank-statements', color: COLORS.mediumBlue },
    { icon: BookMarked,label: 'Journal Entry',          desc: 'Post manual double-entry',               path: '/accounting/journal',         color: COLORS.purple },
    { icon: Layers,    label: 'Chart of Accounts',     desc: 'Manage accounts (Ind AS)',                path: '/accounting/accounts',        color: COLORS.teal },
    { icon: BarChart3, label: 'P & L Statement',       desc: 'Profit & Loss account',                  path: '/accounting/pl',              color: COLORS.emerald },
    { icon: Scale,     label: 'Balance Sheet',         desc: 'Assets & Liabilities',                   path: '/accounting/balance-sheet',   color: COLORS.deepBlue },
    { icon: Receipt,   label: 'Trial Balance',         desc: 'Debit & Credit balances',                path: '/accounting/trial-balance',   color: COLORS.amber },
    { icon: FileText,  label: 'Ledger View',           desc: 'Account-wise transactions',              path: '/accounting/ledger',          color: COLORS.coral },
    { icon: PieChart,  label: 'Trading Account',       desc: 'Gross profit computation',               path: '/accounting/trading',         color: '#7C3AED' },
    { icon: Layers,    label: 'AI Reconciliation',      desc: 'Review & fix AI categorisations',        path: '/accounting/reconcile',       color: COLORS.amber },
    { icon: Receipt,   label: 'Opening Balances',       desc: 'Set year-start account balances',        path: '/accounting/opening-balances',color: COLORS.teal },
  ];

  const fyOptions = [
    { label: '2024-25', from: '2024-04-01', to: '2025-03-31' },
    { label: '2023-24', from: '2023-04-01', to: '2024-03-31' },
    { label: '2022-23', from: '2022-04-01', to: '2023-03-31' },
  ];

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={26} style={{ color: COLORS.mediumBlue }} />
            AI Accounting
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Bank statements → Journal entries → Financial statements (Ind AS)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* FY Selector */}
          <div className="flex gap-1">
            {fyOptions.map(o => (
              <button key={o.label}
                onClick={() => setFy({ from: o.from, to: o.to })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  fy.from === o.from
                    ? 'text-white border-transparent'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                }`}
                style={fy.from === o.from ? { background: COLORS.mediumBlue } : {}}
              >
                FY {o.label}
              </button>
            ))}
          </div>
          <button onClick={fetchSummary}
            className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition"
          >
            <RefreshCw size={16} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`${card} p-4 animate-pulse`}>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {metricCards.map((m, i) => (
            <motion.div key={m.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => nav(m.path)}
              className={`${card} p-4 cursor-pointer hover:shadow-md transition-all group`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="p-2 rounded-xl" style={{ background: m.color + '18' }}>
                  <m.icon size={18} style={{ color: m.color }} />
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{m.label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className={`${card} p-5 mb-6`}>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((a, i) => (
            <motion.button key={a.label}
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              onClick={() => nav(a.path)}
              className="flex flex-col items-start gap-1 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow transition-all bg-gray-50 dark:bg-gray-800 text-left group"
            >
              <div className="p-2 rounded-lg mb-1" style={{ background: a.color + '1A' }}>
                <a.icon size={16} style={{ color: a.color }} />
              </div>
              <p className="text-xs font-semibold text-gray-800 dark:text-white leading-tight">{a.label}</p>
              <p className="text-xs text-gray-400 leading-tight">{a.desc}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* ── Info Banner ── */}
      <div className={`${card} p-4`} style={{ borderLeft: `4px solid ${COLORS.mediumBlue}` }}>
        <div className="flex items-start gap-3">
          <AlertCircle size={18} style={{ color: COLORS.mediumBlue, flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">How AI Accounting Works</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              1. Upload your bank statement (SBI / HDFC / ICICI / Axis — PDF or Excel). &nbsp;
              2. AI auto-categorises each transaction using Indian Accounting Standards. &nbsp;
              3. Double-entry journal entries are posted automatically. &nbsp;
              4. View Ledgers, Trial Balance, Trading A/c, P&L and Balance Sheet instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
