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
      const r = await api.get(`/api/accounting/reports/summary?from_date=${fy.from}&to_date=${fy.to}`);
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Upload, FileText, Trash2, Eye, X, CheckCircle, AlertCircle,
  RefreshCw, Download, ChevronDown, ChevronUp, Building2, Hash,
  CalendarDays, Clock, Database, ArrowUpDown, Search, Filter
} from 'lucide-react';

const COLORS = { deepBlue:'#0D3B66', mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B', teal:'#0D9488' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n||0);

const BANKS = ['SBI','HDFC','ICICI','Axis','Kotak','Bank of Baroda','Punjab National Bank','Canara Bank','Union Bank','Other'];
const FYS   = ['2024-25','2023-24','2022-23','2021-22'];
const ACCT_CODES = [
  {code:'1002',label:'Bank Account – SBI'},
  {code:'1003',label:'Bank Account – HDFC'},
  {code:'1004',label:'Bank Account – ICICI'},
  {code:'1005',label:'Bank Account – Axis'},
  {code:'1006',label:'Bank Account – Others'},
];

export default function BankStatements() {
  const dark = useDark();
  const fileRef  = useRef(null);
  const [stmts,  setStmts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState(null);   // statement detail view
  const [form, setForm] = useState({ bank_name:'SBI', account_number:'', bank_account_code:'1002', financial_year:'2024-25' });
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchStmts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/accounting/bank-statements');
      setStmts(r.data || []);
    } catch { toast.error('Failed to load statements'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStmts(); }, [fetchStmts]);

  const handleUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf','xlsx','xls','csv'].includes(ext)) {
      toast.error('Only PDF, Excel, or CSV files are supported');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    const params = new URLSearchParams(form).toString();
    setUploading(true);
    try {
      const r = await api.post(`/api/accounting/bank-statements/upload?${params}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`✅ Parsed ${r.data.transactions_found} transactions → ${r.data.entries_created} journal entries created`);
      setSelected(r.data);
      fetchStmts();
    } catch(err) {
      toast.error(err?.response?.data?.detail || 'Upload failed. Check file format.');
    } finally { setUploading(false); e.target.value=''; }
  };

  const deleteStmt = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this bank statement and all its journal entries?')) return;
    try {
      await api.delete(`/api/accounting/bank-statements/${id}`);
      toast.success('Deleted');
      setStmts(s => s.filter(x => x.id !== id && x.stmt_id !== id));
    } catch { toast.error('Delete failed'); }
  };

  const viewDetail = async id => {
    try {
      const r = await api.get(`/api/accounting/bank-statements/${id}`);
      setSelected(r.data);
    } catch { toast.error('Failed to load detail'); }
  };

  const filtered = stmts.filter(s =>
    !search || s.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.account_number?.includes(search) || s.filename?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = txns => {
    if (!txns?.length) return;
    const rows = [['Date','Description','Ref No','Debit','Credit','Balance','Category']];
    txns.forEach(t => rows.push([t.date,t.description,t.ref_no||'',t.debit,t.credit,t.balance,t.category||'']));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'bank_statement_categorised.csv';
    a.click();
  };

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Database size={22} style={{color:COLORS.mediumBlue}}/> Bank Statements
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upload PDF/Excel bank statements for AI categorisation</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
          style={{ background: COLORS.mediumBlue }}>
          {uploading ? <RefreshCw size={15} className="animate-spin"/> : <Upload size={15}/>}
          {uploading ? 'Processing…' : 'Upload Statement'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleUpload}/>
      </div>

      {/* ── Upload Config ── */}
      <div className={`${card} p-4 mb-5`}>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Upload Settings</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Bank</label>
            <select value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
              {BANKS.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Account Number</label>
            <input value={form.account_number} onChange={e=>setForm(f=>({...f,account_number:e.target.value}))}
              placeholder="Optional" className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5"/>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Ledger Account</label>
            <select value={form.bank_account_code} onChange={e=>setForm(f=>({...f,bank_account_code:e.target.value}))}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
              {ACCT_CODES.map(a=><option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Financial Year</label>
            <select value={form.financial_year} onChange={e=>setForm(f=>({...f,financial_year:e.target.value}))}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
              {FYS.map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Supported: SBI PDF, HDFC PDF, ICICI PDF, Axis PDF, Excel (.xlsx), CSV</p>
      </div>

      {/* ── Statements List ── */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <p className="font-semibold text-gray-800 dark:text-white text-sm">Uploaded Statements ({filtered.length})</p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-white w-44"/>
          </div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Database size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"/>
            <p className="text-gray-500 dark:text-gray-400 text-sm">No statements uploaded yet</p>
            <p className="text-gray-400 text-xs mt-1">Upload a bank statement PDF or Excel file to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map(s => {
              const sid = s._id || s.id || s.stmt_id;
              return (
                <div key={sid} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={()=>viewDetail(sid)}>
                      <div className="p-2 rounded-xl" style={{background: COLORS.mediumBlue+'18'}}>
                        <Building2 size={16} style={{color:COLORS.mediumBlue}}/>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{s.bank_name} – {s.account_number || 'N/A'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.filename} · {s.financial_year} · {fmt(s.transaction_count)} transactions · {fmt(s.entries_created)} entries</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status==='done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700'}`}>
                        {s.status==='done' ? '✓ Done' : 'Processing'}
                      </span>
                      <button onClick={()=>viewDetail(sid)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><Eye size={14}/></button>
                      <button onClick={e=>deleteStmt(sid,e)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail Drawer ── */}
      <AnimatePresence>
        {selected && (
          <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/40" onClick={()=>setSelected(null)}/>
            <motion.div initial={{x:600}} animate={{x:0}} exit={{x:600}} transition={{type:'spring',damping:28}}
              className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl">
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Statement Detail</p>
                  <p className="text-xs text-gray-500">{selected.transactions?.length||selected.transactions_found||0} transactions</p>
                </div>
                <div className="flex gap-2">
                  {selected.transactions?.length > 0 && (
                    <button onClick={()=>exportCSV(selected.transactions)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Download size={12}/> Export CSV
                    </button>
                  )}
                  <button onClick={()=>setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16}/></button>
                </div>
              </div>
              <div className="p-4">
                {selected.transactions?.map((t,i) => (
                  <div key={i} className={`p-3 mb-2 rounded-xl border ${dark?'border-gray-800 bg-gray-800/50':'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{t.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.date} {t.ref_no ? `· ${t.ref_no}` : ''}</p>
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{t.category}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {t.credit > 0 && <p className="text-sm font-bold text-green-600 dark:text-green-400">+₹{fmt(t.credit)}</p>}
                        {t.debit > 0  && <p className="text-sm font-bold text-red-500 dark:text-red-400">-₹{fmt(t.debit)}</p>}
                        <p className="text-xs text-gray-400">Bal: ₹{fmt(t.balance)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, ChevronDown, ChevronUp, X, Save, Layers } from 'lucide-react';

const COLORS = { mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B', purple:'#7C3AED', teal:'#0D9488' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";

const TYPE_COLORS = {
  Asset:'#1F6FB2', Liability:'#F59E0B', Capital:'#7C3AED', Revenue:'#1FAF5A', Expense:'#EF4444',
};

const TYPES    = ['Asset','Liability','Capital','Revenue','Expense'];
const SUB_TYPES= {
  Asset:    ['Bank','Cash','Receivable','Current Asset','Fixed Asset','Prepaid','Investment','Tax Asset'],
  Liability:['Current Liability','Long Term Liability','Payable','Tax Liability'],
  Capital:  ['Equity','Retained Earnings'],
  Revenue:  ['Operating Revenue','Other Income'],
  Expense:  ['Direct Expense','Indirect Expense','Depreciation','Tax Expense'],
};

const emptyForm = { code:'', name:'', type:'Asset', sub_type:'Current Asset', normal_balance:'Dr', opening_balance:0, description:'' };

export default function ChartOfAccounts() {
  const dark = useDark();
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filterType, setFT]     = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(emptyForm);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState({});

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/accounting/accounts'); setAccounts(r.data||[]); }
    catch { toast.error('Failed to load accounts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const save = async () => {
    if (!form.code || !form.name) { toast.error('Code and Name are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/api/accounting/accounts/${editing}`, form);
        toast.success('Account updated');
      } else {
        await api.post('/accounting/accounts', form);
        toast.success('Account created');
      }
      setShowForm(false); setEditing(null); setForm(emptyForm); fetch();
    } catch(e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const startEdit = a => {
    setForm({ code:a.code,name:a.name,type:a.type,sub_type:a.sub_type,normal_balance:a.normal_balance||'Dr',opening_balance:a.opening_balance||0,description:a.description||'' });
    setEditing(a.code); setShowForm(true);
  };

  // Group by type
  const filtered = accounts.filter(a => {
    const matchSearch = !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'All' || a.type === filterType;
    return matchSearch && matchType;
  });

  const grouped = TYPES.reduce((acc, t) => { acc[t] = filtered.filter(a => a.type === t); return acc; }, {});

  const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n||0);

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers size={22} style={{color:COLORS.mediumBlue}}/> Chart of Accounts
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Indian Accounting Standards – Double Entry System</p>
        </div>
        <button onClick={()=>{setForm(emptyForm);setEditing(null);setShowForm(true);}}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition"
          style={{background:COLORS.mediumBlue}}>
          <Plus size={15}/> Add Account
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code or name…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white w-48"/>
        </div>
        <div className="flex gap-1">
          {['All',...TYPES].map(t => (
            <button key={t} onClick={()=>setFT(t)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${filterType===t?'text-white':'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
              style={filterType===t?{background:TYPE_COLORS[t]||COLORS.mediumBlue}:{}}>{t}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} accounts</span>
      </div>

      {/* Account Groups */}
      {loading ? (
        <div className={`${card} p-8 text-center text-gray-400 text-sm`}>Loading accounts…</div>
      ) : (
        <div className="space-y-3">
          {TYPES.map(type => {
            const accs = grouped[type] || [];
            if (accs.length === 0) return null;
            const isOpen = expanded[type] !== false;
            const total = accs.reduce((s,a) => s + (a.running_balance||0), 0);
            return (
              <div key={type} className={card}>
                <button className="w-full flex items-center justify-between p-4" onClick={()=>setExpanded(e=>({...e,[type]:!isOpen}))}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{background:TYPE_COLORS[type]}}/>
                    <span className="font-semibold text-gray-800 dark:text-white text-sm">{type}</span>
                    <span className="text-xs text-gray-400">({accs.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Balance: ₹{fmt(total)}</span>
                    {isOpen ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="overflow-hidden">
                      <div className="border-t border-gray-100 dark:border-gray-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase tracking-wide">
                              <th className="text-left px-4 py-2">Code</th>
                              <th className="text-left px-4 py-2">Account Name</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Sub Type</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Normal</th>
                              <th className="text-right px-4 py-2">Opening Bal</th>
                              <th className="text-right px-4 py-2">Running Bal</th>
                              <th className="px-4 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {accs.map(a => (
                              <tr key={a.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2 font-mono font-semibold" style={{color:TYPE_COLORS[a.type]}}>{a.code}</td>
                                <td className="px-4 py-2 text-gray-800 dark:text-white font-medium">{a.name}</td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">{a.sub_type}</td>
                                <td className="px-4 py-2 hidden md:table-cell">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${a.normal_balance==='Dr'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                    {a.normal_balance}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">₹{fmt(a.opening_balance)}</td>
                                <td className="px-4 py-2 text-right font-semibold" style={{color: (a.running_balance||0)>=0?TYPE_COLORS[a.type]:COLORS.coral}}>
                                  ₹{fmt(Math.abs(a.running_balance||0))}
                                </td>
                                <td className="px-4 py-2">
                                  <button onClick={()=>startEdit(a)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                                    <Edit2 size={12}/>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/40" onClick={()=>setShowForm(false)}/>
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-gray-900 dark:text-white">{editing ? 'Edit Account' : 'New Account'}</h2>
                <button onClick={()=>setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
              </div>
              <div className="space-y-3">
                {[
                  {label:'Account Code *',key:'code',type:'text',placeholder:'e.g. 1010',disabled:!!editing},
                  {label:'Account Name *',key:'name',type:'text',placeholder:'e.g. Sundry Debtors'},
                  {label:'Description',key:'description',type:'text',placeholder:'Optional'},
                  {label:'Opening Balance (₹)',key:'opening_balance',type:'number',placeholder:'0'},
                ].map(f=>(
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{f.label}</label>
                    <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:f.type==='number'?parseFloat(e.target.value)||0:e.target.value}))}
                      placeholder={f.placeholder} disabled={f.disabled}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-3 py-1.5 disabled:opacity-50"/>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                    <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value,sub_type:SUB_TYPES[e.target.value][0]}))}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      {TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sub Type</label>
                    <select value={form.sub_type} onChange={e=>setForm(p=>({...p,sub_type:e.target.value}))}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      {(SUB_TYPES[form.type]||[]).map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Normal Balance</label>
                  <div className="flex gap-3">
                    {['Dr','Cr'].map(b=>(
                      <label key={b} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={form.normal_balance===b} onChange={()=>setForm(p=>({...p,normal_balance:b}))} className="accent-blue-500"/>
                        <span className="text-sm text-gray-700 dark:text-gray-200">{b} ({b==='Dr'?'Debit':'Credit'})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={()=>setShowForm(false)} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  style={{background:COLORS.mediumBlue}}>
                  {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RefreshCw({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  );
}

import React, { useState, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  BarChart3, Scale, Receipt, PieChart, Download, RefreshCw,
  TrendingUp, TrendingDown, Printer, FileSpreadsheet
} from 'lucide-react';

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

const FYS = [
  { label:'2024-25', from:'2024-04-01', to:'2025-03-31', as_on:'2025-03-31' },
  { label:'2023-24', from:'2023-04-01', to:'2024-03-31', as_on:'2024-03-31' },
  { label:'2022-23', from:'2022-04-01', to:'2023-03-31', as_on:'2023-03-31' },
];

const EXPORT_URLS = {
  pl:      (fy) => `/api/accounting/reports/export/profit-loss?from_date=${fy.from}&to_date=${fy.to}`,
  bs:      (fy) => `/api/accounting/reports/export/balance-sheet?as_on=${fy.as_on}`,
  tb:      (fy) => `/api/accounting/reports/export/trial-balance?from_date=${fy.from}&to_date=${fy.to}`,
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
  const [fy,        setFy]        = useState(FYS[0]);
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(false);

  const fetchReport = useCallback(async (tab = activeTab, fyObj = fy) => {
    setLoading(true);
    try {
      let r;
      if (tab === 'pl')      r = await api.get(`/api/accounting/reports/profit-loss?from_date=${fyObj.from}&to_date=${fyObj.to}`);
      if (tab === 'bs')      r = await api.get(`/api/accounting/reports/balance-sheet?as_on=${fyObj.as_on}`);
      if (tab === 'tb')      r = await api.get(`/api/accounting/reports/trial-balance?from_date=${fyObj.from}&to_date=${fyObj.to}`);
      if (tab === 'trading') r = await api.get(`/api/accounting/reports/trading-account?from_date=${fyObj.from}&to_date=${fyObj.to}`);
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
          {FYS.map(f => (
            <button key={f.label} onClick={()=>handleFy(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${fy.label===f.label?'text-white border-transparent':'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
              style={fy.label===f.label?{background:COLORS.mediumBlue}:{}}>
              FY {f.label}
            </button>
          ))}
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

import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Search, X, Save, BookMarked, ChevronDown, RefreshCw, Filter, Calendar } from 'lucide-react';

const COLORS = { mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n||0);

const emptyLine = { account_code:'', type:'Dr', amount:0, narration:'' };

export default function JournalEntries() {
  const dark = useDark();
  const [entries,  setEntries]  = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ date: new Date().toISOString().slice(0,10), narration:'', lines:[{...emptyLine},{...emptyLine}] });
  const [saving,   setSaving]   = useState(false);
  const [filter,   setFilter]   = useState({ from:'', to:'' });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit:25 });
      if (filter.from) params.set('from_date', filter.from);
      if (filter.to)   params.set('to_date', filter.to);
      const r = await api.get(`/api/accounting/journal-entries?${params}`);
      setEntries(r.data.entries||[]); setTotal(r.data.total||0);
    } catch { toast.error('Failed to load journal entries'); }
    finally { setLoading(false); }
  }, [page, filter]);

  const fetchAccounts = useCallback(async () => {
    try { const r = await api.get('/accounting/accounts'); setAccounts(r.data||[]); } catch {}
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const addLine  = () => setForm(f => ({...f, lines:[...f.lines, {...emptyLine}]}));
  const remLine  = i  => setForm(f => ({...f, lines: f.lines.filter((_,idx) => idx !== i)}));
  const setLine  = (i, k, v) => setForm(f => {
    const lines = [...f.lines];
    lines[i] = {...lines[i], [k]: k==='amount' ? parseFloat(v)||0 : v};
    return {...f, lines};
  });

  const totalDr = form.lines.reduce((s,l) => l.type==='Dr' ? s + (l.amount||0) : s, 0);
  const totalCr = form.lines.reduce((s,l) => l.type==='Cr' ? s + (l.amount||0) : s, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const save = async () => {
    if (!form.date || !form.narration) { toast.error('Date and Narration are required'); return; }
    if (form.lines.length < 2) { toast.error('At least 2 lines required'); return; }
    if (!balanced) { toast.error(`Entry not balanced: Dr ₹${fmt(totalDr)} ≠ Cr ₹${fmt(totalCr)}`); return; }
    setSaving(true);
    try {
      await api.post('/accounting/journal-entries', form);
      toast.success('Journal entry posted ✓');
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0,10), narration:'', lines:[{...emptyLine},{...emptyLine}] });
      fetchEntries();
    } catch(e) { toast.error(e?.response?.data?.detail || 'Post failed'); }
    finally { setSaving(false); }
  };

  const del = async id => {
    if (!window.confirm('Delete this journal entry?')) return;
    try { await api.delete(`/api/accounting/journal-entries/${id}`); toast.success('Deleted'); fetchEntries(); }
    catch { toast.error('Delete failed'); }
  };

  const accMap = accounts.reduce((m,a) => { m[a.code] = a.name; return m; }, {});

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookMarked size={22} style={{color:COLORS.mediumBlue}}/> Journal Entries
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Double-entry bookkeeping · {total} total entries</p>
        </div>
        <button onClick={()=>setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition"
          style={{background:COLORS.mediumBlue}}>
          <Plus size={15}/> New Entry
        </button>
      </div>

      {/* Filters */}
      <div className={`${card} p-3 mb-4 flex flex-wrap items-center gap-3`}>
        <Filter size={14} className="text-gray-400"/>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From:</label>
          <input type="date" value={filter.from} onChange={e=>setFilter(f=>({...f,from:e.target.value}))}
            className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white px-2 py-1"/>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To:</label>
          <input type="date" value={filter.to} onChange={e=>setFilter(f=>({...f,to:e.target.value}))}
            className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white px-2 py-1"/>
        </div>
        {(filter.from || filter.to) && (
          <button onClick={()=>setFilter({from:'',to:''})} className="text-xs text-red-500 hover:underline">Clear</button>
        )}
        <button onClick={fetchEntries} className="ml-auto text-xs text-blue-500 hover:underline flex items-center gap-1">
          <RefreshCw size={12}/> Refresh
        </button>
        <button onClick={async () => {
          try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
            const params = new URLSearchParams();
            if (filter.from) params.set('from_date', filter.from);
            if (filter.to)   params.set('to_date',   filter.to);
            const resp = await fetch(`/api/accounting/reports/export/journal-entries?${params}`, { headers: { Authorization: `Bearer ${token}` } });
            const blob = await resp.blob();
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = 'journal_entries.xlsx'; a.click();
          } catch { toast.error('Export failed'); }
        }} className="text-xs text-green-600 hover:underline flex items-center gap-1">
          ↓ Excel
        </button>
      </div>

      {/* Entries Table */}
      <div className={`${card} overflow-hidden`}>
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center">
            <BookMarked size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"/>
            <p className="text-gray-500 text-sm">No journal entries yet</p>
            <p className="text-gray-400 text-xs mt-1">Upload a bank statement or create a manual entry</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Narration</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Accounts</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {entries.map(e => {
                  const drLines = e.lines?.filter(l=>l.type==='Dr') || [];
                  const crLines = e.lines?.filter(l=>l.type==='Cr') || [];
                  const amount  = drLines.reduce((s,l)=>s+l.amount,0);
                  return (
                    <tr key={e._id||e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-white max-w-xs">
                        <p className="truncate">{e.narration}</p>
                        {e.ref_no && <p className="text-gray-400 text-xs">Ref: {e.ref_no}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {drLines.map((l,i) => <p key={i} className="text-blue-600 dark:text-blue-400">Dr {accMap[l.account_code]||l.account_code}</p>)}
                        {crLines.map((l,i) => <p key={i} className="text-amber-600 dark:text-amber-400 pl-4">Cr {accMap[l.account_code]||l.account_code}</p>)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-white">₹{fmt(amount)}</td>
                      <td className="px-4 py-3">
                        {!e.bank_statement_id && (
                          <button onClick={()=>del(e._id||e.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-400">{(page-1)*25+1}–{Math.min(page*25,total)} of {total}</span>
            <div className="flex gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">Prev</button>
              <button disabled={page*25>=total} onClick={()=>setPage(p=>p+1)} className="text-xs px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/50" onClick={()=>setShowForm(false)}/>
            <motion.div initial={{scale:0.94}} animate={{scale:1}} exit={{scale:0.94}}
              className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-gray-900 dark:text-white">New Journal Entry</h2>
                <button onClick={()=>setShowForm(false)} className="text-gray-400"><X size={18}/></button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date *</label>
                  <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-3 py-1.5"/>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Narration *</label>
                  <input value={form.narration} onChange={e=>setForm(f=>({...f,narration:e.target.value}))}
                    placeholder="Being amount paid/received for…"
                    className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-3 py-1.5"/>
                </div>
              </div>

              {/* Lines */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lines</p>
                  <button onClick={addLine} className="text-xs text-blue-500 hover:underline flex items-center gap-1"><Plus size={12}/> Add Line</button>
                </div>
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 mb-1 px-1">
                  <span className="col-span-5">Account</span>
                  <span className="col-span-2">Dr/Cr</span>
                  <span className="col-span-3">Amount</span>
                  <span className="col-span-2">Narration</span>
                </div>
                {form.lines.map((line,i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 mb-1 items-center">
                    <select value={line.account_code} onChange={e=>setLine(i,'account_code',e.target.value)}
                      className="col-span-5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      <option value="">Select account</option>
                      {accounts.map(a=><option key={a.code} value={a.code}>{a.code} – {a.name}</option>)}
                    </select>
                    <select value={line.type} onChange={e=>setLine(i,'type',e.target.value)}
                      className="col-span-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      <option value="Dr">Dr</option>
                      <option value="Cr">Cr</option>
                    </select>
                    <input type="number" value={line.amount||''} onChange={e=>setLine(i,'amount',e.target.value)}
                      placeholder="0.00" className="col-span-3 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5"/>
                    <div className="col-span-2 flex gap-1">
                      <input value={line.narration||''} onChange={e=>setLine(i,'narration',e.target.value)}
                        placeholder="Note" className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5"/>
                      {form.lines.length > 2 && (
                        <button onClick={()=>remLine(i)} className="p-1 text-gray-400 hover:text-red-500"><X size={12}/></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Balance check */}
              <div className={`flex items-center justify-between p-3 rounded-xl mb-4 text-xs ${balanced?'bg-green-50 dark:bg-green-900/20':'bg-red-50 dark:bg-red-900/20'}`}>
                <span className={balanced?'text-green-700 dark:text-green-400':'text-red-700 dark:text-red-400'}>
                  {balanced ? '✓ Entry is balanced' : '⚠ Entry is NOT balanced'}
                </span>
                <div className="flex gap-4">
                  <span className="text-blue-600">Dr: ₹{fmt(totalDr)}</span>
                  <span className="text-amber-600">Cr: ₹{fmt(totalCr)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={()=>setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={save} disabled={saving || !balanced}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{background: balanced ? COLORS.mediumBlue : '#9ca3af'}}>
                  {saving ? 'Posting…' : 'Post Entry'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { FileText, Search, Download, RefreshCw, TrendingUp, TrendingDown, FileSpreadsheet } from 'lucide-react';

const COLORS = { mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Math.abs(n)||0);
const fmtRs = n => `₹${fmt(n)}`;

export default function LedgerView() {
  const dark = useDark();
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState('');
  const [ledger,   setLedger]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState({ from:'2024-04-01', to:'2025-03-31' });
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    api.get('/accounting/accounts').then(r => setAccounts(r.data||[])).catch(()=>{});
  }, []);

  const fetchLedger = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const r = await api.get(`/api/accounting/ledger/${selected}?from_date=${filter.from}&to_date=${filter.to}`);
      setLedger(r.data);
    } catch(e) { toast.error('Failed to load ledger'); }
    finally { setLoading(false); }
  }, [selected, filter]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const exportExcel = async () => {
    if (!selected) return;
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const url = `/api/accounting/reports/export/ledger/${selected}?from_date=${filter.from}&to_date=${filter.to}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ledger_${selected}_${filter.from}.xlsx`; a.click();
    } catch { toast.error('Export failed'); }
  };

  const exportCSV = () => {
    if (!ledger) return;
    const rows = [['Date','Narration','Ref No','Dr','Cr','Balance']];
    ledger.rows.forEach(r => rows.push([r.date, r.narration, r.ref_no||'', r.dr||0, r.cr||0, r.balance]));
    const csv = rows.map(r => r.map(c=>`"${c}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `ledger_${selected}.csv`; a.click();
  };

  const filteredAccounts = accounts.filter(a =>
    !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const TYPE_COLORS = { Asset:'#1F6FB2', Liability:'#F59E0B', Capital:'#7C3AED', Revenue:'#1FAF5A', Expense:'#EF4444' };

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText size={22} style={{color:COLORS.mediumBlue}}/> Ledger
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Account-wise transaction history</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {/* Account List */}
        <div className={`${card} md:col-span-1 h-fit`}>
          <div className="p-3 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-white"/>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {filteredAccounts.map(a => (
              <button key={a.code} onClick={()=>setSelected(a.code)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-50 dark:border-gray-800/50 transition ${selected===a.code?'bg-blue-50 dark:bg-blue-900/20':' hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:TYPE_COLORS[a.type]||'#ccc'}}/>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{a.name}</p>
                    <p className="text-xs text-gray-400">{a.code}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ledger Detail */}
        <div className="md:col-span-3 space-y-3">
          {/* Date Filter */}
          <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">From:</label>
              <input type="date" value={filter.from} onChange={e=>setFilter(f=>({...f,from:e.target.value}))}
                className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white px-2 py-1"/>
              <label className="text-xs text-gray-500">To:</label>
              <input type="date" value={filter.to} onChange={e=>setFilter(f=>({...f,to:e.target.value}))}
                className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white px-2 py-1"/>
            </div>
            {ledger && (
              <div className="ml-auto flex items-center gap-2">
                <button onClick={exportCSV} className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                  <Download size={12}/> CSV
                </button>
                <button onClick={exportExcel} className="flex items-center gap-1 text-xs text-green-600 hover:underline">
                  <Download size={12}/> Excel
                </button>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          {ledger && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Opening Balance', value: fmtRs(ledger.opening_balance), color: COLORS.amber },
                { label:'Closing Balance',  value: fmtRs(ledger.closing_balance), color: ledger.closing_balance>=0?COLORS.emerald:COLORS.coral },
                { label:'Transactions',     value: ledger.rows.length, color: COLORS.mediumBlue },
              ].map(m => (
                <div key={m.label} className={`${card} p-3`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                  <p className="text-base font-bold mt-1" style={{color:m.color}}>{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          {!selected ? (
            <div className={`${card} p-10 text-center`}>
              <FileText size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"/>
              <p className="text-gray-500 text-sm">Select an account to view its ledger</p>
            </div>
          ) : loading ? (
            <div className={`${card} p-8 text-center text-gray-400 text-sm`}>Loading ledger…</div>
          ) : ledger ? (
            <div className={`${card} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="font-semibold text-gray-800 dark:text-white text-sm">{ledger.account.name} <span className="text-gray-400 text-xs ml-1">({ledger.account.code})</span></p>
                <p className="text-xs text-gray-400">{ledger.account.type} · Normal balance: {ledger.account.normal_balance}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-left px-4 py-2">Narration</th>
                      <th className="text-right px-4 py-2 text-blue-500">Dr (₹)</th>
                      <th className="text-right px-4 py-2 text-amber-500">Cr (₹)</th>
                      <th className="text-right px-4 py-2">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-500">—</td>
                      <td className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-300" colSpan={3}>Opening Balance</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-700 dark:text-gray-200">{fmtRs(ledger.opening_balance)}</td>
                    </tr>
                    {ledger.rows.map((r,i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-200 max-w-xs">
                          <p className="truncate">{r.narration}</p>
                          {r.ref_no && <p className="text-gray-400 text-xs">Ref: {r.ref_no}</p>}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-blue-600 dark:text-blue-400">{r.dr > 0 ? fmt(r.dr) : '—'}</td>
                        <td className="px-4 py-2 text-right font-medium text-amber-600 dark:text-amber-400">{r.cr > 0 ? fmt(r.cr) : '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-white">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-t-2 border-gray-200 dark:border-gray-700">
                      <td colSpan={4} className="px-4 py-2 font-bold text-gray-700 dark:text-gray-200">Closing Balance</td>
                      <td className="px-4 py-2 text-right font-bold text-lg" style={{color:ledger.closing_balance>=0?COLORS.emerald:COLORS.coral}}>{fmtRs(ledger.closing_balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Search, RefreshCw, Scale, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const COLORS = { mediumBlue: '#1F6FB2', emerald: '#1FAF5A', coral: '#EF4444', amber: '#F59E0B', purple: '#7C3AED' };
const card = 'rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm';

const TYPE_COLORS = {
  Asset: '#1F6FB2', Liability: '#F59E0B', Capital: '#7C3AED', Revenue: '#1FAF5A', Expense: '#EF4444',
};
const TYPES = ['Asset', 'Liability', 'Capital', 'Revenue', 'Expense'];

const fmt = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

export default function OpeningBalances() {
  const dark = useDark();
  const [accounts, setAccounts]   = useState([]);
  const [balances, setBalances]   = useState({});   // { code: value }
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [search,   setSearch]     = useState('');
  const [expanded, setExpanded]   = useState({});
  const [saved,    setSaved]      = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/accounting/accounts');
      const list = r.data || [];
      setAccounts(list);
      // Seed local balances from existing opening_balance values
      const init = {};
      list.forEach(a => { init[a.code] = a.opening_balance ?? 0; });
      setBalances(init);
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleChange = (code, val) => {
    setBalances(prev => ({ ...prev, [code]: parseFloat(val) || 0 }));
    setSaved(false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Build payload: array of { code, opening_balance }
      const payload = Object.entries(balances).map(([code, opening_balance]) => ({ code, opening_balance }));
      await api.post('/accounting/opening-balances', payload);
      toast.success('Opening balances saved successfully');
      setSaved(true);
      fetchAccounts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save opening balances');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const filtered = accounts.filter(a => {
    if (!search) return true;
    return a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase());
  });

  const grouped = TYPES.reduce((acc, t) => {
    acc[t] = filtered.filter(a => a.type === t);
    return acc;
  }, {});

  // Dr-side: Assets + Expenses  /  Cr-side: Liabilities + Capital + Revenue
  const totalDebit  = accounts
    .filter(a => ['Asset', 'Expense'].includes(a.type))
    .reduce((s, a) => s + (balances[a.code] || 0), 0);
  const totalCredit = accounts
    .filter(a => ['Liability', 'Capital', 'Revenue'].includes(a.type))
    .reduce((s, a) => s + (balances[a.code] || 0), 0);
  const difference  = totalDebit - totalCredit;
  const balanced    = Math.abs(difference) < 0.01;

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Scale size={22} style={{ color: COLORS.mediumBlue }} /> Opening Balances
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set opening balances for all accounts at the start of the financial year
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
          style={{ background: COLORS.mediumBlue }}
        >
          {saving
            ? <RefreshCw size={14} className="animate-spin" />
            : saved
              ? <CheckCircle size={14} />
              : <Save size={14} />}
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Debit (Dr)',  value: totalDebit,  color: COLORS.mediumBlue },
          { label: 'Total Credit (Cr)', value: totalCredit, color: COLORS.amber },
          {
            label: balanced ? 'Balanced ✓' : `Difference`,
            value: Math.abs(difference),
            color: balanced ? COLORS.emerald : COLORS.coral,
          },
        ].map(({ label, value, color }) => (
          <div key={label} className={`${card} p-4 text-center`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="text-lg font-bold" style={{ color }}>₹{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Balance-mismatch warning */}
      <AnimatePresence>
        {!balanced && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 mb-4 p-3 rounded-xl text-sm"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.coral }}
          >
            <AlertCircle size={15} />
            Trial balance is out of balance by ₹{fmt(Math.abs(difference))}. Please adjust entries.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative mb-4 w-64">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search account…"
          className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white w-full"
        />
      </div>

      {/* Account Groups */}
      {loading ? (
        <div className={`${card} p-8 text-center text-gray-400 text-sm`}>Loading accounts…</div>
      ) : (
        <div className="space-y-3">
          {TYPES.map(type => {
            const accs  = grouped[type] || [];
            if (accs.length === 0) return null;
            const isOpen = expanded[type] !== false;
            const total  = accs.reduce((s, a) => s + (balances[a.code] || 0), 0);

            return (
              <div key={type} className={card}>
                {/* Group Header */}
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setExpanded(e => ({ ...e, [type]: !isOpen }))}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                    <span className="font-semibold text-gray-800 dark:text-white text-sm">{type}</span>
                    <span className="text-xs text-gray-400">({accs.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Total: ₹{fmt(total)}
                    </span>
                    {isOpen
                      ? <ChevronUp size={14} className="text-gray-400" />
                      : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </button>

                {/* Rows */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-gray-100 dark:border-gray-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase tracking-wide">
                              <th className="text-left px-4 py-2">Code</th>
                              <th className="text-left px-4 py-2">Account Name</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Sub Type</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Dr/Cr</th>
                              <th className="text-right px-4 py-2 w-40">Opening Balance (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {accs.map(a => (
                              <tr key={a.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2 font-mono font-semibold" style={{ color: TYPE_COLORS[a.type] }}>
                                  {a.code}
                                </td>
                                <td className="px-4 py-2 text-gray-800 dark:text-white font-medium">{a.name}</td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                  {a.sub_type}
                                </td>
                                <td className="px-4 py-2 hidden md:table-cell">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    a.normal_balance === 'Dr'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  }`}>
                                    {a.normal_balance || 'Dr'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={balances[a.code] ?? 0}
                                    onChange={e => handleChange(a.code, e.target.value)}
                                    className="w-36 text-right text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Save Bar */}
      {!loading && accounts.length > 0 && (
        <div className="mt-6 flex items-center justify-between p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            {balanced
              ? <><CheckCircle size={16} style={{ color: COLORS.emerald }} /><span className="text-green-600 dark:text-green-400 font-medium">Trial balance is balanced</span></>
              : <><AlertCircle size={16} style={{ color: COLORS.coral }} /><span className="text-red-500 font-medium">Difference: ₹{fmt(Math.abs(difference))}</span></>}
          </div>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
            style={{ background: COLORS.mediumBlue }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Opening Balances'}
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, AlertTriangle, Edit2, Save, X, RefreshCw,
  Filter, ChevronDown, Search, CheckSquare, Square,
  TrendingUp, TrendingDown, ArrowRight, Zap, Eye,
  Calendar, IndianRupee, Tag, Database
} from 'lucide-react';

const COLORS = {
  mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444',
  amber:'#F59E0B', purple:'#7C3AED', teal:'#0D9488',
};
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(n) || 0);

export default function Reconciliation() {
  const dark = useDark();
  const [statements,  setStatements]  = useState([]);
  const [selectedStmt, setSelectedStmt] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [accounts,    setAccounts]    = useState([]);
  const [entries,     setEntries]     = useState({});  // entry_id -> journal entry
  const [loading,     setLoading]     = useState(false);
  const [editingIdx,  setEditingIdx]  = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [saving,      setSaving]      = useState(false);
  const [filter,      setFilter]      = useState('all');  // all | credit | debit | unreviewed
  const [search,      setSearch]      = useState('');
  const [reviewed,    setReviewed]    = useState(new Set());

  // Fetch statements list
  useEffect(() => {
    api.get('/accounting/bank-statements').then(r => setStatements(r.data || [])).catch(() => {});
    api.get('/accounting/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
  }, []);

  const accMap   = accounts.reduce((m, a) => { m[a.code] = a; return m; }, {});
  const accOptions = accounts.sort((a, b) => a.code.localeCompare(b.code));

  const loadStatement = async (stmt) => {
    setLoading(true);
    setSelectedStmt(stmt);
    setReviewed(new Set());
    try {
      const r = await api.get(`/api/accounting/bank-statements/${stmt._id || stmt.id}`);
      const txns = r.data.transactions || [];
      setTransactions(txns);

      // Load journal entries for this statement
      const ents = {};
      const je = await api.get(`/api/accounting/journal-entries?limit=500`);
      (je.data.entries || []).forEach(e => {
        if (e.bank_statement_id === (stmt._id || stmt.id)) ents[e._id] = e;
      });
      setEntries(ents);
    } catch { toast.error('Failed to load statement'); }
    finally { setLoading(false); }
  };

  const startEdit = (idx, txn) => {
    setEditingIdx(idx);
    setEditForm({
      debit_account:  txn.debit_account  || '1002',
      credit_account: txn.credit_account || '4002',
      narration:      txn.category       || '',
    });
  };

  const saveEdit = async (idx, txn) => {
    // Find the matching journal entry
    const matchEntry = Object.values(entries).find(e => {
      const lines = e.lines || [];
      return lines.some(l => l.narration?.includes(txn.description?.slice(0, 30)));
    });

    if (!matchEntry) {
      toast.error('Could not find matching journal entry. Try re-uploading the statement.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/accounting/recategorise', {
        entry_id:           matchEntry._id,
        new_debit_account:  editForm.debit_account,
        new_credit_account: editForm.credit_account,
        new_narration:      editForm.narration,
      });
      // Update local state
      setTransactions(prev => prev.map((t, i) => i === idx ? {
        ...t,
        debit_account:  editForm.debit_account,
        credit_account: editForm.credit_account,
        category:       editForm.narration,
        confidence:     'manual',
      } : t));
      setReviewed(prev => new Set([...prev, idx]));
      setEditingIdx(null);
      toast.success('Re-categorised ✓');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const markReviewed = idx => setReviewed(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  const markAll = () => {
    if (reviewed.size === filtered.length) setReviewed(new Set());
    else setReviewed(new Set(filtered.map(([i]) => i)));
  };

  const filtered = transactions
    .map((t, i) => [i, t])
    .filter(([i, t]) => {
      if (filter === 'credit') return t.credit > 0;
      if (filter === 'debit')  return t.debit > 0;
      if (filter === 'unreviewed') return !reviewed.has(i);
      return true;
    })
    .filter(([i, t]) =>
      !search ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase())
    );

  const totalCredit  = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const totalDebit   = transactions.reduce((s, t) => s + (t.debit  || 0), 0);
  const reviewedCount = reviewed.size;

  const CONFIDENCE_BADGE = {
    rule:    { label: 'Rule', color: COLORS.mediumBlue, bg: '#dbeafe' },
    ai:      { label: 'AI',   color: COLORS.purple,     bg: '#ede9fe' },
    manual:  { label: '✓ Manual', color: COLORS.emerald, bg: '#dcfce7' },
    fallback:{ label: 'Guess', color: COLORS.amber,     bg: '#fef9c3' },
  };

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Zap size={22} style={{ color: COLORS.amber }}/> AI Reconciliation
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Review and correct AI-generated journal entry categorisations
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {/* ── Statement Selector ── */}
        <div className={`${card} h-fit`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bank Statements</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50 max-h-[60vh] overflow-y-auto">
            {statements.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 text-center">No statements found</p>
            ) : statements.map(s => {
              const id = s._id || s.id;
              const active = selectedStmt && (selectedStmt._id || selectedStmt.id) === id;
              return (
                <button key={id} onClick={() => loadStatement(s)}
                  className={`w-full text-left p-3 transition ${active ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                  <p className="text-xs font-semibold text-gray-800 dark:text-white">{s.bank_name}</p>
                  <p className="text-xs text-gray-400">{s.financial_year} · {s.transaction_count} txns</p>
                  <p className="text-xs text-gray-400 truncate">{s.filename}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Transactions ── */}
        <div className="md:col-span-3 space-y-3">
          {!selectedStmt ? (
            <div className={`${card} p-10 text-center`}>
              <Database size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600"/>
              <p className="text-gray-500 text-sm">Select a bank statement to review</p>
            </div>
          ) : (
            <>
              {/* ── Stats ── */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Txns',   value: transactions.length,           color: COLORS.mediumBlue },
                  { label: 'Credits',      value: `₹${fmt(totalCredit)}`,        color: COLORS.emerald    },
                  { label: 'Debits',       value: `₹${fmt(totalDebit)}`,         color: COLORS.coral      },
                  { label: 'Reviewed',     value: `${reviewedCount}/${transactions.length}`, color: COLORS.amber },
                ].map(m => (
                  <div key={m.label} className={`${card} p-3`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: m.color }}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Toolbar ── */}
              <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
                    className="pl-7 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white w-44"/>
                </div>
                <div className="flex gap-1">
                  {['all','credit','debit','unreviewed'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-3 py-1 text-xs rounded-lg font-medium capitalize transition ${filter === f ? 'text-white' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
                      style={filter === f ? { background: COLORS.mediumBlue } : {}}>
                      {f}
                    </button>
                  ))}
                </div>
                <button onClick={markAll} className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500">
                  {reviewed.size === filtered.length ? <CheckSquare size={12}/> : <Square size={12}/>}
                  Mark All Reviewed
                </button>
              </div>

              {/* ── Transaction Cards ── */}
              {loading ? (
                <div className={`${card} p-8 text-center text-gray-400 text-sm`}>
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2"/>Loading transactions…
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(([idx, txn]) => {
                    const isEdit    = editingIdx === idx;
                    const isReviewed = reviewed.has(idx);
                    const conf      = CONFIDENCE_BADGE[txn.confidence] || CONFIDENCE_BADGE.fallback;
                    const isCredit  = (txn.credit || 0) > 0;
                    const amount    = isCredit ? txn.credit : txn.debit;

                    return (
                      <motion.div key={idx} layout
                        className={`${card} overflow-hidden transition-all ${isReviewed ? 'opacity-70' : ''}`}
                        style={isReviewed ? { borderLeft: `3px solid ${COLORS.emerald}` } : {}}>
                        <div className="p-3">
                          <div className="flex items-start gap-3">
                            {/* Review checkbox */}
                            <button onClick={() => markReviewed(idx)} className="mt-0.5 flex-shrink-0">
                              {isReviewed
                                ? <CheckCircle size={16} style={{ color: COLORS.emerald }}/>
                                : <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600"/>}
                            </button>

                            {/* Main info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{txn.description}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{txn.date}{txn.ref_no ? ` · ${txn.ref_no}` : ''}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className={`text-base font-bold ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                    {isCredit ? '+' : '-'}₹{fmt(amount)}
                                  </p>
                                  {txn.balance > 0 && <p className="text-xs text-gray-400">Bal: ₹{fmt(txn.balance)}</p>}
                                </div>
                              </div>

                              {/* Categorization row */}
                              {!isEdit ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: conf.bg, color: conf.color }}>
                                    {conf.label}
                                  </span>
                                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                                      Dr {accMap[txn.debit_account]?.name || txn.debit_account}
                                    </span>
                                    <ArrowRight size={10}/>
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                                      Cr {accMap[txn.credit_account]?.name || txn.credit_account}
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-400 truncate flex-1">{txn.category}</span>
                                  <button onClick={() => startEdit(idx, txn)}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-500 flex-shrink-0">
                                    <Edit2 size={12}/>
                                  </button>
                                </div>
                              ) : (
                                /* Edit form */
                                <div className="mt-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Edit Categorisation</p>
                                  <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Debit Account (Dr)</label>
                                      <select value={editForm.debit_account}
                                        onChange={e => setEditForm(f => ({ ...f, debit_account: e.target.value }))}
                                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                                        {accOptions.map(a => (
                                          <option key={a.code} value={a.code}>{a.code} – {a.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Credit Account (Cr)</label>
                                      <select value={editForm.credit_account}
                                        onChange={e => setEditForm(f => ({ ...f, credit_account: e.target.value }))}
                                        className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                                        {accOptions.map(a => (
                                          <option key={a.code} value={a.code}>{a.code} – {a.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="mb-2">
                                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Narration</label>
                                    <input value={editForm.narration}
                                      onChange={e => setEditForm(f => ({ ...f, narration: e.target.value }))}
                                      className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5"/>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditingIdx(null)}
                                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
                                      Cancel
                                    </button>
                                    <button onClick={() => saveEdit(idx, txn)} disabled={saving}
                                      className="px-3 py-1.5 text-xs rounded-lg text-white font-semibold flex items-center gap-1 disabled:opacity-50"
                                      style={{ background: COLORS.mediumBlue }}>
                                      {saving ? <RefreshCw size={11} className="animate-spin"/> : <Save size={11}/>}
                                      {saving ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className={`${card} p-8 text-center`}>
                      <CheckCircle size={32} className="mx-auto mb-2" style={{ color: COLORS.emerald }}/>
                      <p className="text-gray-500 text-sm">No transactions match your filter</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
