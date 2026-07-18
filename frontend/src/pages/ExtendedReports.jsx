import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BookOpen, Landmark, Activity, AlertTriangle, ArrowLeftRight, TrendingDown,
  Shield, BarChart3, TrendingUp, CalendarRange, Scale, CheckCircle2, Upload,
  ChevronDown, ChevronRight, Plus, Play, Link2, Unlink, Loader2,
} from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import {
  PageHeader, ReportCard, Row, EmptyState, DateFilterBar,
  fmtC, fmtN, fmtPct, currentFYLabel,
} from '@/components/reports/ReportShared.jsx';

/* ═══════════════════════════════════════════════════════════════════════
   Tab registry — maps each of the 13 old standalone routes to one section
   inside this single consolidated page.
   ═══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'day-book',            label: 'Day Book',            icon: BookOpen,      path: '/day-book' },
  { key: 'cash-bank-book',       label: 'Cash / Bank Book',    icon: Landmark,      path: '/cash-bank-book' },
  { key: 'cash-flow',            label: 'Cash Flow',          icon: Activity,      path: '/cash-flow' },
  { key: 'outstanding',          label: 'Outstanding',        icon: AlertTriangle, path: '/outstanding-report' },
  { key: 'bank-reconciliation',  label: 'Bank Reconciliation',icon: ArrowLeftRight,path: '/bank-reconciliation' },
  { key: 'depreciation',         label: 'Depreciation',       icon: TrendingDown,  path: '/depreciation' },
  { key: 'tds-tcs',              label: 'TDS / TCS',          icon: Shield,        path: '/tds-tcs' },
  { key: 'financial-ratios',     label: 'Financial Ratios',   icon: BarChart3,     path: '/financial-ratios' },
  { key: 'comparative',          label: 'Comparative',        icon: TrendingUp,    path: '/comparative-report' },
  { key: 'yearly',               label: 'Yearly Report',      icon: CalendarRange, path: '/yearly-report' },
  { key: 'opening-balances',     label: 'Opening Balances',   icon: Scale,         path: '/opening-balances' },
  { key: 'audit-trail',          label: 'Audit Trail',        icon: CheckCircle2,  path: '/accounting-audit-trail' },
  { key: 'bulk-import',          label: 'Bulk Import',        icon: Upload,        path: '/bulk-import' },
];

const inputCls = (isDark) => `px-3 py-2 rounded-xl text-sm border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`;

/* ── 1. Day Book ─────────────────────────────────────────────────────── */
const SOURCES = [
  { value: '', label: 'All Sources' }, { value: 'sale', label: 'Sale' }, { value: 'purchase', label: 'Purchase' },
  { value: 'bank', label: 'Bank' }, { value: 'manual', label: 'Manual' }, { value: 'ai_zero_touch', label: 'AI Zero-Touch' },
];

function DayBookSection({ isDark }) {
  const [mode, setMode] = useState('fy');
  const [fy, setFy] = useState(currentFYLabel());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [source, setSource] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { source: source || undefined };
      if (mode === 'fy') params.fy = fy; else { params.from_date = fromDate; params.to_date = toDate; }
      const { data } = await api.get('/reports/day-book', { params });
      setData(data);
    } catch { toast.error('Failed to load Day Book'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [mode, fy, source]);
  const toggle = (date) => setExpanded((e) => ({ ...e, [date]: !e[date] }));

  return (
    <div className="space-y-4">
      <DateFilterBar
        mode={mode} setMode={setMode} fy={fy} setFy={setFy} fromDate={fromDate} setFromDate={setFromDate}
        toDate={toDate} setToDate={setToDate} isDark={isDark}
        extra={<select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls(isDark)}>
          {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>}
      />
      <ReportCard title={`Transactions (${data?.from_date || ''} to ${data?.to_date || ''})`} isDark={isDark}>
        {loading ? <ContentLoader /> : !data || data.days.length === 0 ? (
          <EmptyState text="No journal entries posted in this period." />
        ) : (
          <div className="space-y-2">
            {data.days.map((day) => (
              <div key={day.date} className={`rounded-2xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <button onClick={() => toggle(day.date)} className={`w-full flex items-center justify-between px-4 py-3 text-left ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-center gap-2">
                    {expanded[day.date] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{day.date}</span>
                    <span className="text-xs text-slate-400">({day.entries.length} entries)</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">Dr {fmtC(day.day_debit)} · Cr {fmtC(day.day_credit)}</span>
                </button>
                {expanded[day.date] && (
                  <div className="px-4 pb-3 space-y-2">
                    {day.entries.map((e) => (
                      <div key={e.id} className={`rounded-xl p-3 text-sm ${isDark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>
                            {e.narration || '(no narration)'}
                            {e.ref_no && <span className="text-xs text-slate-400 ml-2">Ref: {e.ref_no}</span>}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-semibold uppercase">{e.source}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_100px_100px] gap-2 text-xs text-slate-400">
                          <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                        </div>
                        {e.lines.map((l) => (
                          <div key={l.id} className="grid grid-cols-[1fr_100px_100px] gap-2 text-xs py-0.5">
                            <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{l.account_id}{l.memo ? ` — ${l.memo}` : ''}</span>
                            <span className="text-right font-mono">{l.debit ? fmtC(l.debit) : ''}</span>
                            <span className="text-right font-mono">{l.credit ? fmtC(l.credit) : ''}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className={`grid grid-cols-[1fr_150px] gap-2 pt-3 mt-2 border-t font-bold text-sm ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>Total (Debit / Credit)</span>
              <span className="text-right font-mono">{fmtC(data.total_debit)} / {fmtC(data.total_credit)}</span>
            </div>
          </div>
        )}
      </ReportCard>
    </div>
  );
}

/* ── 2. Cash / Bank Book ─────────────────────────────────────────────── */
function CashBankBookSection({ isDark }) {
  const [mode, setMode] = useState('fy');
  const [fy, setFy] = useState(currentFYLabel());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (mode === 'fy') params.fy = fy; else { params.from_date = fromDate; params.to_date = toDate; }
      const { data } = await api.get('/reports/cash-bank-book', { params });
      setData(data);
    } catch { toast.error('Failed to load Cash / Bank Book'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [mode, fy]);

  return (
    <div className="space-y-4">
      <DateFilterBar mode={mode} setMode={setMode} fy={fy} setFy={setFy} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} isDark={isDark} />
      {loading ? <ContentLoader /> : !data || data.accounts.length === 0 ? (
        <ReportCard title="Cash / Bank Accounts" isDark={isDark}><EmptyState text="No cash or bank accounts found in the Chart of Accounts for this period." /></ReportCard>
      ) : (
        data.accounts.map((acct) => (
          <ReportCard key={acct.account_id} title={`${acct.account_code} — ${acct.account_name}`} isDark={isDark}
            action={<span className="text-xs font-mono text-slate-500">Opening {fmtC(acct.opening_balance)} · Closing {fmtC(acct.closing_balance)}</span>}>
            {acct.rows.length === 0 ? <EmptyState text="No transactions in this period." /> : (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[100px_1fr_90px_100px_100px_110px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <span>Date</span><span>Narration</span><span>Source</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span className="text-right">Balance</span>
                </div>
                {acct.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[100px_1fr_90px_100px_100px_110px] gap-2 py-1.5 text-sm">
                    <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{r.date}</span>
                    <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.narration || '—'}</span>
                    <span className="text-xs text-slate-400 uppercase">{r.source}</span>
                    <span className="text-right font-mono">{r.debit ? fmtC(r.debit) : ''}</span>
                    <span className="text-right font-mono">{r.credit ? fmtC(r.credit) : ''}</span>
                    <span className="text-right font-mono font-semibold">{fmtC(r.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportCard>
        ))
      )}
    </div>
  );
}

/* ── 3. Cash Flow ────────────────────────────────────────────────────── */
function CashFlowSection({ isDark }) {
  const [mode, setMode] = useState('fy');
  const [fy, setFy] = useState(currentFYLabel());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (mode === 'fy') params.fy = fy; else { params.from_date = fromDate; params.to_date = toDate; }
      const { data } = await api.get('/reports/cash-flow', { params });
      setData(data);
    } catch { toast.error('Failed to load Cash Flow Statement'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [mode, fy]);

  return (
    <div className="space-y-4">
      <DateFilterBar mode={mode} setMode={setMode} fy={fy} setFy={setFy} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} isDark={isDark} />
      {loading ? <ContentLoader /> : !data ? (
        <ReportCard title="Cash Flow" isDark={isDark}><EmptyState text="No data available." /></ReportCard>
      ) : (
        <>
          <ReportCard title="Operating Activities" isDark={isDark}>
            <Row label="Net Profit" value={data.operating.net_profit} isDark={isDark} />
            {data.operating.working_capital_changes.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No working-capital movements posted.</p>
            ) : data.operating.working_capital_changes.map((w, i) => <Row key={i} label={`Δ ${w.name}`} value={w.change} isDark={isDark} />)}
            <Row label="Net Cash from Operating Activities" value={data.operating.total} isDark={isDark} bold />
          </ReportCard>
          <ReportCard title="Investing Activities" isDark={isDark}>
            {data.investing.items.length === 0 ? <EmptyState text="No investing activity in this period." /> :
              data.investing.items.map((it, i) => <Row key={i} label={it.name} value={it.amount} isDark={isDark} />)}
            <Row label="Net Cash from Investing Activities" value={data.investing.total} isDark={isDark} bold />
          </ReportCard>
          <ReportCard title="Financing Activities" isDark={isDark}>
            {data.financing.items.length === 0 ? <EmptyState text="No financing activity in this period." /> :
              data.financing.items.map((it, i) => <Row key={i} label={it.name} value={it.amount} isDark={isDark} />)}
            <Row label="Net Cash from Financing Activities" value={data.financing.total} isDark={isDark} bold />
          </ReportCard>
          <div className={`rounded-2xl p-5 text-center font-bold text-lg ${data.net_change_in_cash >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            Net {data.net_change_in_cash >= 0 ? 'Increase' : 'Decrease'} in Cash: {fmtC(Math.abs(data.net_change_in_cash))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── 4. Outstanding (Receivable / Payable) ──────────────────────────────*/
const BUCKET_LABELS = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '91_plus': '91+ days' };

function AgingBar({ aging, isDark }) {
  const total = Object.values(aging).reduce((a, b) => a + b, 0) || 1;
  const colors = { current: '#1FAF5A', '1_30': '#F59E0B', '31_60': '#FF6B6B', '61_90': '#dc2626', '91_plus': '#7f1d1d' };
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {Object.entries(aging).map(([k, v]) => v > 0 && <div key={k} style={{ width: `${(v / total) * 100}%`, background: colors[k] }} title={`${BUCKET_LABELS[k]}: ${fmtC(v)}`} />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Object.entries(aging).map(([k, v]) => (
          <div key={k} className={`rounded-xl p-2.5 border ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-[11px] uppercase font-bold text-slate-400">{BUCKET_LABELS[k]}</p>
            <p className={`text-sm font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(v)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutstandingTable({ rows, isDark, partyLabel }) {
  if (rows.length === 0) return <EmptyState text="Nothing outstanding — all invoices are settled." />;
  return (
    <div className="overflow-x-auto mt-4">
      <div className="grid grid-cols-[110px_1fr_100px_100px_100px_100px_90px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        <span>Invoice</span><span>{partyLabel}</span><span>Date</span><span>Due</span><span className="text-right">Total</span><span className="text-right">Outstanding</span><span className="text-right">Bucket</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[110px_1fr_100px_100px_100px_100px_90px] gap-2 py-1.5 text-sm">
          <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.invoice_no}</span>
          <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.client_name || r.supplier_name}</span>
          <span className="text-xs text-slate-400">{r.invoice_date}</span>
          <span className="text-xs text-slate-400">{r.due_date}</span>
          <span className="text-right font-mono">{fmtC(r.grand_total)}</span>
          <span className="text-right font-mono font-semibold">{fmtC(r.outstanding)}</span>
          <span className="text-right text-xs text-slate-400">{BUCKET_LABELS[r.bucket]}</span>
        </div>
      ))}
    </div>
  );
}

function OutstandingSection({ isDark }) {
  const [side, setSide] = useState('receivable');
  const [receivable, setReceivable] = useState(null);
  const [payable, setPayable] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rR, rP] = await Promise.allSettled([api.get('/reports/outstanding/receivable'), api.get('/reports/outstanding/payable')]);
      setReceivable(rR.status === 'fulfilled' ? rR.value.data : null);
      setPayable(rP.status === 'fulfilled' ? rP.value.data : null);
    } catch { toast.error('Failed to load Outstanding Report'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const active = side === 'receivable' ? receivable : payable;

  return (
    <div className="space-y-4">
      <div className={`inline-flex rounded-xl overflow-hidden border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
        <button onClick={() => setSide('receivable')} className={`px-4 py-2 text-sm font-semibold ${side === 'receivable' ? 'text-white bg-blue-600' : (isDark ? 'text-slate-300' : 'text-slate-600')}`}>Receivable</button>
        <button onClick={() => setSide('payable')} className={`px-4 py-2 text-sm font-semibold ${side === 'payable' ? 'text-white bg-blue-600' : (isDark ? 'text-slate-300' : 'text-slate-600')}`}>Payable</button>
      </div>
      {loading ? <ContentLoader /> : (
        <ReportCard title={side === 'receivable' ? 'Customer Outstanding' : 'Vendor Outstanding'} isDark={isDark}
          action={<span className="text-sm font-mono font-bold text-slate-500">Total {fmtC(active?.total_outstanding)}</span>}>
          {active && <AgingBar aging={active.aging} isDark={isDark} />}
          {active && <OutstandingTable rows={active.rows} isDark={isDark} partyLabel={side === 'receivable' ? 'Client' : 'Supplier'} />}
        </ReportCard>
      )}
    </div>
  );
}

/* ── 5. Bank Reconciliation ─────────────────────────────────────────────*/
function BankReconciliationSection({ isDark }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [recon, setRecon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadBankAccounts = async () => {
    try {
      const { data } = await api.get('/bank-accounts');
      setBankAccounts(data || []);
      if (data && data.length > 0) setSelectedBank((prev) => prev || data[0].id);
      else setLoading(false);
    } catch { toast.error('Failed to load bank accounts'); setLoading(false); }
  };
  const loadRecon = async (bankId) => {
    if (!bankId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/bank-reconciliation/${bankId}`);
      setRecon(data);
    } catch { toast.error('Failed to load reconciliation data'); } finally { setLoading(false); }
  };
  useEffect(() => { loadBankAccounts(); }, []);
  useEffect(() => { if (selectedBank) loadRecon(selectedBank); }, [selectedBank]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBank) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('bank_account_id', selectedBank);
      form.append('file', file);
      await api.post('/bank-reconciliation/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Statement uploaded');
      loadRecon(selectedBank);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Upload failed — ensure the file is CSV or Excel with date/narration/debit/credit columns.');
    } finally { setUploading(false); e.target.value = ''; }
  };
  const matchRow = async (statementId, rowId, entryId) => {
    try {
      await api.post(`/bank-reconciliation/${selectedBank}/match`, { statement_id: statementId, row_id: rowId, entry_id: entryId });
      toast.success('Matched'); loadRecon(selectedBank);
    } catch { toast.error('Failed to match'); }
  };
  const unmatchRow = async (statementId, rowId) => {
    try {
      await api.post(`/bank-reconciliation/${selectedBank}/unmatch`, { statement_id: statementId, row_id: rowId, entry_id: '' });
      toast.success('Unmatched'); loadRecon(selectedBank);
    } catch { toast.error('Failed to unmatch'); }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} className={inputCls(isDark)}>
          {bankAccounts.length === 0 && <option value="">No bank accounts found</option>}
          {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.account_name || b.bank_name} ({fmtC(b.current_balance)})</option>)}
        </select>
        <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer border ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
          <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload Statement (CSV / Excel)'}
          <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleUpload} disabled={!selectedBank || uploading} />
        </label>
      </div>
      {loading ? <ContentLoader /> : !recon || recon.statements.length === 0 ? (
        <ReportCard title="Statements" isDark={isDark}><EmptyState text="No statement uploaded yet for this bank account." /></ReportCard>
      ) : (
        recon.statements.map((stmt) => (
          <ReportCard key={stmt.id} title={stmt.filename} isDark={isDark}
            action={<span className="text-xs text-slate-400">{stmt.matched_rows}/{stmt.total_rows} matched · uploaded {new Date(stmt.uploaded_at).toLocaleDateString('en-IN')}</span>}>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[90px_1fr_90px_90px_90px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                <span>Date</span><span>Narration</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span className="text-right">Action</span>
              </div>
              {(stmt.rows || []).map((r) => (
                <div key={r.id} className="grid grid-cols-[90px_1fr_90px_90px_90px] gap-2 py-1.5 text-sm items-center">
                  <span className="text-xs text-slate-400">{r.statement_date}</span>
                  <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.narration || '—'}</span>
                  <span className="text-right font-mono">{r.debit ? fmtC(r.debit) : ''}</span>
                  <span className="text-right font-mono">{r.credit ? fmtC(r.credit) : ''}</span>
                  <span className="text-right">
                    {r.matched ? (
                      <button onClick={() => unmatchRow(stmt.id, r.id)} className="text-xs inline-flex items-center gap-1 text-emerald-600 hover:text-rose-600"><Unlink className="h-3.5 w-3.5" /> Matched</button>
                    ) : (
                      <button onClick={() => { const entryId = window.prompt('Enter journal entry ID to match this row to:'); if (entryId) matchRow(stmt.id, r.id, entryId); }} className="text-xs inline-flex items-center gap-1 text-slate-400 hover:text-blue-600"><Link2 className="h-3.5 w-3.5" /> Match</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </ReportCard>
        ))
      )}
      {recon && recon.unmatched_journal_lines?.length > 0 && (
        <ReportCard title="Recent Unreconciled Journal Lines" isDark={isDark}>
          <p className="text-xs text-slate-400 mb-2">Use these entry IDs when matching a statement row above.</p>
          {recon.unmatched_journal_lines.slice(0, 50).map((l) => (
            <div key={l.id} className="grid grid-cols-[90px_1fr_90px_90px] gap-2 py-1 text-xs">
              <span className="text-slate-400">{l.entry_date}</span>
              <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>Entry {l.entry_id} — {l.memo || ''}</span>
              <span className="text-right font-mono">{l.debit ? fmtC(l.debit) : ''}</span>
              <span className="text-right font-mono">{l.credit ? fmtC(l.credit) : ''}</span>
            </div>
          ))}
        </ReportCard>
      )}
    </div>
  );
}

/* ── 6. Depreciation ─────────────────────────────────────────────────── */
const emptyAsset = { name: '', purchase_date: '', cost: '', salvage_value: '0', useful_life_years: '5', method: 'straight_line', asset_account_id: '', depreciation_account_id: '' };

function DepreciationSection({ isDark }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyAsset);
  const [saving, setSaving] = useState(false);
  const [periodEnd, setPeriodEnd] = useState('');
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/depreciation/schedule');
      setAssets(data.assets || []);
    } catch { toast.error('Failed to load depreciation schedule'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const addAsset = async () => {
    if (!form.name || !form.purchase_date || !form.cost) { toast.error('Name, purchase date and cost are required'); return; }
    setSaving(true);
    try {
      await api.post('/depreciation/asset', { ...form, cost: Number(form.cost), salvage_value: Number(form.salvage_value || 0), useful_life_years: Number(form.useful_life_years || 5) });
      toast.success('Fixed asset registered'); setForm(emptyAsset); setShowForm(false); fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to register asset'); } finally { setSaving(false); }
  };
  const runDepreciation = async () => {
    if (!periodEnd) { toast.error('Choose a period-end date first'); return; }
    setRunning(true);
    try {
      const fd = new FormData(); fd.append('period_end', periodEnd);
      const { data } = await api.post('/depreciation/run', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Depreciation posted for ${data.posted} asset(s)`); fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to run depreciation'); } finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <ReportCard title="Fixed Assets" isDark={isDark} action={<Button size="sm" onClick={() => setShowForm((s) => !s)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Asset</Button>}>
        {showForm && (
          <div className={`mb-4 p-3 rounded-2xl border grid md:grid-cols-3 gap-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <input placeholder="Asset name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls(isDark)} />
            <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="Cost (₹)" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="Salvage value" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="Useful life (years)" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })} className={inputCls(isDark)} />
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputCls(isDark)}>
              <option value="straight_line">Straight Line</option>
              <option value="wdv">Written Down Value (WDV)</option>
            </select>
            <input placeholder="Asset A/c ID (optional)" value={form.asset_account_id} onChange={(e) => setForm({ ...form, asset_account_id: e.target.value })} className={inputCls(isDark)} />
            <input placeholder="Depreciation A/c ID (optional)" value={form.depreciation_account_id} onChange={(e) => setForm({ ...form, depreciation_account_id: e.target.value })} className={inputCls(isDark)} />
            <div className="flex justify-end md:col-span-3"><Button onClick={addAsset} disabled={saving}>{saving ? 'Saving…' : 'Save Asset'}</Button></div>
          </div>
        )}
        <div className={`mb-4 p-3 rounded-2xl border flex flex-wrap items-center gap-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <span className="text-xs text-slate-400">Run depreciation up to:</span>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputCls(isDark)} />
          <Button onClick={runDepreciation} disabled={running} size="sm"><Play className="h-3.5 w-3.5 mr-1" /> {running ? 'Running…' : 'Run Depreciation'}</Button>
        </div>
        {loading ? <ContentLoader /> : assets.length === 0 ? <EmptyState text="No fixed assets registered yet." /> : (
          <div className="space-y-2">
            {assets.map((a) => (
              <div key={a.id} className={`rounded-2xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <button onClick={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))} className={`w-full flex items-center justify-between px-4 py-3 text-left ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-center gap-2">
                    {expanded[a.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{a.name}</span>
                    <span className="text-xs text-slate-400">{a.method === 'straight_line' ? 'Straight Line' : 'WDV'} · {a.useful_life_years} yrs</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500">Cost {fmtC(a.cost)} · Book Value {fmtC(a.book_value)}</span>
                </button>
                {expanded[a.id] && (
                  <div className="px-4 pb-3">
                    <div className="grid grid-cols-3 gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                      <span>Year</span><span className="text-right">Depreciation</span><span className="text-right">Closing Book Value</span>
                    </div>
                    {a.schedule.map((s) => (
                      <div key={s.year} className="grid grid-cols-3 gap-2 py-1 text-sm">
                        <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>Year {s.year}</span>
                        <span className="text-right font-mono">{fmtC(s.depreciation)}</span>
                        <span className="text-right font-mono">{fmtC(s.closing_book_value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ReportCard>
    </div>
  );
}

/* ── 7. TDS / TCS ────────────────────────────────────────────────────── */
const emptyTds = { entry_date: '', party_name: '', party_pan: '', section: '', base_amount: '', tds_rate: '', tds_amount: '', payment_type: 'tds', status: 'deducted', challan_no: '' };

function TdsTcsSection({ isDark }) {
  const [mode, setMode] = useState('fy');
  const [fy, setFy] = useState(currentFYLabel());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyTds);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (mode === 'fy') params.fy = fy; else { params.from_date = fromDate; params.to_date = toDate; }
      const { data } = await api.get('/tds-tcs', { params });
      setData(data);
    } catch { toast.error('Failed to load TDS/TCS ledger'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [mode, fy]);

  const addEntry = async () => {
    if (!form.entry_date || !form.party_name || !form.section || !form.base_amount || !form.tds_amount) {
      toast.error('Date, party, section, base amount and TDS amount are required'); return;
    }
    setSaving(true);
    try {
      await api.post('/tds-tcs/entry', { ...form, base_amount: Number(form.base_amount), tds_rate: Number(form.tds_rate || 0), tds_amount: Number(form.tds_amount) });
      toast.success('Entry recorded'); setForm(emptyTds); setShowForm(false); fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to record entry'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <DateFilterBar mode={mode} setMode={setMode} fy={fy} setFy={setFy} fromDate={fromDate} setFromDate={setFromDate} toDate={toDate} setToDate={setToDate} isDark={isDark}
        extra={<Button size="sm" onClick={() => setShowForm((s) => !s)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Entry</Button>} />

      {showForm && (
        <ReportCard title="Record TDS / TCS Entry" isDark={isDark}>
          <div className="grid md:grid-cols-3 gap-3">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className={inputCls(isDark)} />
            <input placeholder="Party name" value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} className={inputCls(isDark)} />
            <input placeholder="Party PAN (optional)" value={form.party_pan} onChange={(e) => setForm({ ...form, party_pan: e.target.value })} className={inputCls(isDark)} />
            <input placeholder="Section e.g. 194C" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="Base amount" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="TDS rate %" value={form.tds_rate} onChange={(e) => setForm({ ...form, tds_rate: e.target.value })} className={inputCls(isDark)} />
            <input type="number" placeholder="TDS amount" value={form.tds_amount} onChange={(e) => setForm({ ...form, tds_amount: e.target.value })} className={inputCls(isDark)} />
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className={inputCls(isDark)}>
              <option value="tds">TDS</option><option value="tcs">TCS</option>
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls(isDark)}>
              <option value="deducted">Deducted</option><option value="deposited">Deposited</option>
            </select>
            <input placeholder="Challan no. (optional)" value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} className={inputCls(isDark)} />
          </div>
          <div className="mt-3 flex justify-end"><Button onClick={addEntry} disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</Button></div>
        </ReportCard>
      )}

      {loading ? <ContentLoader /> : !data ? <EmptyState text="No data available." /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ReportCard title="TDS Total" isDark={isDark}><p className="text-lg font-bold font-mono">{fmtC(data.summary.tds_total)}</p></ReportCard>
            <ReportCard title="TCS Total" isDark={isDark}><p className="text-lg font-bold font-mono">{fmtC(data.summary.tcs_total)}</p></ReportCard>
            <ReportCard title="Deposited" isDark={isDark}><p className="text-lg font-bold font-mono text-emerald-600">{fmtC(data.summary.deposited)}</p></ReportCard>
            <ReportCard title="Pending Deposit" isDark={isDark}><p className="text-lg font-bold font-mono text-amber-600">{fmtC(data.summary.pending_deposit)}</p></ReportCard>
          </div>
          <ReportCard title="Entries" isDark={isDark}>
            {data.entries.length === 0 ? <EmptyState text="No TDS/TCS entries in this period." /> : (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-[90px_1fr_90px_100px_90px_90px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <span>Date</span><span>Party</span><span>Section</span><span className="text-right">TDS Amount</span><span>Type</span><span>Status</span>
                </div>
                {data.entries.map((e, i) => (
                  <div key={i} className="grid grid-cols-[90px_1fr_90px_100px_90px_90px] gap-2 py-1.5 text-sm">
                    <span className="text-xs text-slate-400">{e.entry_date}</span>
                    <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{e.party_name}</span>
                    <span className="text-xs text-slate-400">{e.section}</span>
                    <span className="text-right font-mono">{fmtC(e.tds_amount)}</span>
                    <span className="text-xs uppercase">{e.payment_type}</span>
                    <span className={`text-xs uppercase font-semibold ${e.status === 'deposited' ? 'text-emerald-600' : 'text-amber-600'}`}>{e.status}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportCard>
        </>
      )}
    </div>
  );
}

/* ── 8. Financial Ratios ─────────────────────────────────────────────── */
function FinancialRatiosSection({ isDark }) {
  const [fy, setFy] = useState(currentFYLabel());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/financial-ratios', { params: { fy } });
      setData(data);
    } catch { toast.error('Failed to load Financial Ratios'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [fy]);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <span className="text-sm text-slate-400">Financial Year:</span>
        <select value={fy} onChange={(e) => setFy(e.target.value)} className={inputCls(isDark)}>
          {Array.from({ length: 8 }).map((_, i) => {
            const [start] = currentFYLabel().split('-').map(Number);
            const y = start - i;
            return <option key={y} value={`${y}-${String(y + 1).slice(-2)}`}>{y}-{String(y + 1).slice(-2)}</option>;
          })}
        </select>
      </div>
      {loading ? <ContentLoader /> : !data ? <EmptyState text="No data available." /> : (
        <div className="grid md:grid-cols-3 gap-4">
          <ReportCard title="Liquidity" isDark={isDark}>
            <Row label="Current Ratio" value={data.liquidity.current_ratio} isDark={isDark} fmt={fmtN} />
            <Row label="Quick Ratio" value={data.liquidity.quick_ratio} isDark={isDark} fmt={fmtN} />
            <Row label="Cash Ratio" value={data.liquidity.cash_ratio} isDark={isDark} fmt={fmtN} />
          </ReportCard>
          <ReportCard title="Profitability" isDark={isDark}>
            <Row label="Net Profit Margin" value={data.profitability.net_profit_margin} isDark={isDark} fmt={fmtPct} />
            <Row label="Return on Assets" value={data.profitability.return_on_assets} isDark={isDark} fmt={fmtPct} />
            <Row label="Return on Equity" value={data.profitability.return_on_equity} isDark={isDark} fmt={fmtPct} />
          </ReportCard>
          <ReportCard title="Solvency" isDark={isDark}>
            <Row label="Debt to Equity" value={data.solvency.debt_to_equity} isDark={isDark} fmt={fmtN} />
            <Row label="Debt to Assets" value={data.solvency.debt_to_assets} isDark={isDark} fmt={fmtN} />
            <Row label="Equity Ratio" value={data.solvency.equity_ratio} isDark={isDark} fmt={fmtN} />
          </ReportCard>
          <ReportCard title="Key Figures" isDark={isDark}>
            <Row label="Revenue" value={data.revenue} isDark={isDark} />
            <Row label="Net Profit" value={data.net_profit} isDark={isDark} />
            <Row label="Working Capital" value={data.working_capital} isDark={isDark} />
          </ReportCard>
          <ReportCard title="Balance Sheet Snapshot" isDark={isDark}>
            <Row label="Total Assets" value={data.total_assets} isDark={isDark} />
            <Row label="Total Liabilities" value={data.total_liabilities} isDark={isDark} />
            <Row label="Total Equity" value={data.total_equity} isDark={isDark} />
          </ReportCard>
        </div>
      )}
    </div>
  );
}

/* ── 9. Comparative Report ──────────────────────────────────────────────*/
function ComparativeSection({ isDark }) {
  const cur = currentFYLabel();
  const [start] = cur.split('-').map(Number);
  const [fy1, setFy1] = useState(`${start - 1}-${String(start).slice(-2)}`);
  const [fy2, setFy2] = useState(cur);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/comparative', { params: { fy1, fy2 } });
      setData(data);
    } catch { toast.error('Failed to load Comparative Report'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [fy1, fy2]);

  const yearOptions = Array.from({ length: 8 }).map((_, i) => start - i).map((y) => `${y}-${String(y + 1).slice(-2)}`);

  const CompTable = ({ title, rows }) => (
    <ReportCard title={title} isDark={isDark}>
      {rows.length === 0 ? <EmptyState text="No entries in either period." /> : (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
            <span>Account</span><span className="text-right">FY {fy1}</span><span className="text-right">FY {fy2}</span><span className="text-right">Change</span><span className="text-right">% Chg</span>
          </div>
          {rows.map((r) => (
            <div key={r.code} className="grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 py-1.5 text-sm">
              <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.name}</span>
              <span className="text-right font-mono">{fmtC(r.fy1)}</span>
              <span className="text-right font-mono">{fmtC(r.fy2)}</span>
              <span className={`text-right font-mono ${r.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtC(r.change)}</span>
              <span className="text-right text-xs text-slate-400">{fmtPct(r.change_pct)}</span>
            </div>
          ))}
        </div>
      )}
    </ReportCard>
  );

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <span className="text-sm text-slate-400">Compare</span>
        <select value={fy1} onChange={(e) => setFy1(e.target.value)} className={inputCls(isDark)}>{yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <span className="text-sm text-slate-400">vs</span>
        <select value={fy2} onChange={(e) => setFy2(e.target.value)} className={inputCls(isDark)}>{yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      {loading ? <ContentLoader /> : !data ? <EmptyState text="No data available." /> : (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            <ReportCard title={`Net Profit — FY ${data.fy1}`} isDark={isDark}><p className="text-lg font-bold font-mono">{fmtC(data.summary.fy1.net_profit)}</p></ReportCard>
            <ReportCard title={`Net Profit — FY ${data.fy2}`} isDark={isDark}><p className="text-lg font-bold font-mono">{fmtC(data.summary.fy2.net_profit)}</p></ReportCard>
            <ReportCard title="Change" isDark={isDark}><p className={`text-lg font-bold font-mono ${data.summary.change.net_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtC(data.summary.change.net_profit)}</p></ReportCard>
          </div>
          <CompTable title="Income" rows={data.income} />
          <CompTable title="Expenses" rows={data.expenses} />
        </>
      )}
    </div>
  );
}

/* ── 10. Yearly Report ───────────────────────────────────────────────── */
function YearlySection({ isDark }) {
  const [years, setYears] = useState(5);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/yearly', { params: { years } });
      setData(data.years || []);
    } catch { toast.error('Failed to load Yearly Report'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [years]);

  const maxProfit = Math.max(1, ...data ? data.map((y) => Math.abs(y.net_profit)) : [1]);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <span className="text-sm text-slate-400">Show last</span>
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} className={inputCls(isDark)}>
          {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} years</option>)}
        </select>
      </div>
      {loading ? <ContentLoader /> : (
        <ReportCard title="Year-wise Summary" isDark={isDark}>
          {!data || data.length === 0 ? <EmptyState text="No data available." /> : (
            <div className="space-y-3">
              {data.map((y) => (
                <div key={y.fy}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>FY {y.fy}</span>
                    <span className="font-mono text-xs text-slate-400">Income {fmtC(y.total_income)} · Expense {fmtC(y.total_expense)} · Net {fmtC(y.net_profit)}</span>
                  </div>
                  <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    <div className={`h-full rounded-full ${y.net_profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${(Math.abs(y.net_profit) / maxProfit) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportCard>
      )}
    </div>
  );
}

/* ── 11. Opening Balances ────────────────────────────────────────────── */
function OpeningBalancesSection({ isDark }) {
  const [fy, setFy] = useState(currentFYLabel());
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const [obDate, setObDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [obR, coaR] = await Promise.allSettled([api.get('/opening-balances', { params: { fy } }), api.get('/chart-of-accounts')]);
      const ob = obR.status === 'fulfilled' ? obR.value.data.opening_balances : [];
      setRows(ob || []);
      setAccounts(coaR.status === 'fulfilled' ? coaR.value.data : []);
      const initEdit = {};
      (ob || []).forEach((r) => { initEdit[r.account_id] = { debit: r.debit, credit: r.credit }; });
      setEditing(initEdit);
      setObDate(`${fy.split('-')[0]}-04-01`);
    } catch { toast.error('Failed to load opening balances'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [fy]);

  const setCell = (accountId, field, value) => setEditing((e) => ({ ...e, [accountId]: { ...e[accountId], [field]: value } }));

  const totalDr = Object.values(editing).reduce((s, v) => s + (Number(v?.debit) || 0), 0);
  const totalCr = Object.values(editing).reduce((s, v) => s + (Number(v?.credit) || 0), 0);

  const save = async () => {
    const lines = Object.entries(editing)
      .filter(([, v]) => Number(v?.debit) || Number(v?.credit))
      .map(([account_id, v]) => ({ account_id, debit: Number(v.debit) || 0, credit: Number(v.credit) || 0 }));
    if (lines.length === 0) { toast.error('Enter at least one opening balance'); return; }
    setSaving(true);
    try {
      await api.post('/opening-balances', { fy, date: obDate, lines });
      toast.success('Opening balances saved'); fetchData();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to save opening balances'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <span className="text-sm text-slate-400">Financial Year:</span>
        <input value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2024-25" className={inputCls(isDark)} style={{ width: 100 }} />
        <span className="text-sm text-slate-400">Opening date:</span>
        <input type="date" value={obDate} onChange={(e) => setObDate(e.target.value)} className={inputCls(isDark)} />
      </div>
      {loading ? <ContentLoader /> : (
        <ReportCard title={`Opening Balances — FY ${fy}`} isDark={isDark}
          action={<span className={`text-xs font-mono font-semibold ${Math.abs(totalDr - totalCr) < 0.05 ? 'text-emerald-600' : 'text-amber-600'}`}>Dr {fmtC(totalDr)} · Cr {fmtC(totalCr)}</span>}>
          {accounts.length === 0 ? <EmptyState text="No chart of accounts found." /> : (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_120px_120px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
              </div>
              {accounts.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_120px_120px] gap-2 py-1.5 items-center text-sm">
                  <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{a.code} — {a.name}</span>
                  <input type="number" value={editing[a.id]?.debit ?? ''} onChange={(e) => setCell(a.id, 'debit', e.target.value)} className={`${inputCls(isDark)} text-right`} />
                  <input type="number" value={editing[a.id]?.credit ?? ''} onChange={(e) => setCell(a.id, 'credit', e.target.value)} className={`${inputCls(isDark)} text-right`} />
                </div>
              ))}
              <div className="mt-3 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Opening Balances'}</Button></div>
            </div>
          )}
        </ReportCard>
      )}
    </div>
  );
}

/* ── 12. Audit Trail ─────────────────────────────────────────────────── */
function AuditTrailSection({ isDark }) {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/audit-trail', { params: { page, page_size: 50, entity: entity || undefined } });
      setData(data);
    } catch { toast.error('Failed to load Audit Trail'); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [page, entity]);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} className={inputCls(isDark)}>
          <option value="">All Entities</option>
          <option value="opening_balances">Opening Balances</option>
          <option value="bank_reconciliation">Bank Reconciliation</option>
          <option value="fixed_assets">Fixed Assets</option>
          <option value="depreciation">Depreciation</option>
        </select>
      </div>
      {loading ? <ContentLoader /> : !data || data.rows.length === 0 ? (
        <ReportCard title="Audit Trail" isDark={isDark}><EmptyState text="No audit records found." /></ReportCard>
      ) : (
        <ReportCard title={`Audit Trail (${data.total} records)`} isDark={isDark}>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[140px_1fr_120px_1fr] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              <span>When</span><span>Action</span><span>Entity</span><span>Details</span>
            </div>
            {data.rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[140px_1fr_120px_1fr] gap-2 py-1.5 text-sm">
                <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString('en-IN')}</span>
                <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>{r.action}</span>
                <span className="text-xs text-slate-400">{r.entity}</span>
                <span className="text-xs text-slate-400 truncate">{JSON.stringify(r.payload || {})}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span>Page {data.page}</span>
            <Button size="sm" variant="outline" disabled={data.rows.length < 50} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </ReportCard>
      )}
    </div>
  );
}

/* ── 13. Bulk Import ─────────────────────────────────────────────────── */
const SAMPLE_JSON = `[
  {
    "entry_date": "2025-04-01",
    "narration": "Opening stock purchase",
    "ref_no": "PO-1001",
    "lines": [
      { "account_id": "5000", "debit": 10000, "credit": 0, "memo": "Stock" },
      { "account_id": "2000", "debit": 0, "credit": 10000, "memo": "Cash" }
    ]
  }
]`;

function BulkImportSection({ isDark }) {
  const [fy, setFy] = useState(currentFYLabel());
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/bulk-import/status/${job.job_id}`);
        setJob(data);
        if (data.status !== 'running') { clearInterval(t); setPolling(false); }
      } catch { clearInterval(t); setPolling(false); }
    }, 2000);
    return () => clearInterval(t);
  }, [job]);

  const submit = async () => {
    let entries;
    try { entries = JSON.parse(jsonText); } catch { toast.error('Invalid JSON'); return; }
    if (!Array.isArray(entries) || entries.length === 0) { toast.error('Provide a non-empty array of entries'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/bulk-import/journals', { fy, entries });
      toast.success(`Import job started — ${data.total} entries`);
      setJob(data); setPolling(true);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to start import'); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <ReportCard title="Bulk Import Journal Entries" isDark={isDark}>
        <p className="text-xs text-slate-400 mb-3">Paste a JSON array of journal entries below. Each entry must have balanced debit/credit lines. Import runs in the background — up to 100,000 entries per job.</p>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-slate-400">Financial Year:</span>
          <input value={fy} onChange={(e) => setFy(e.target.value)} className={inputCls(isDark)} style={{ width: 100 }} />
        </div>
        <textarea
          value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={12}
          className={`w-full rounded-xl border p-3 text-xs font-mono ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={submit} disabled={submitting}>{submitting ? 'Starting…' : 'Start Import'}</Button>
        </div>
      </ReportCard>

      {job && (
        <ReportCard title="Import Job Status" isDark={isDark}>
          <div className="flex items-center gap-2 mb-2">
            {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            <span className={`text-sm font-semibold ${job.status === 'done' ? 'text-emerald-600' : 'text-blue-500'}`}>
              {job.status === 'running' ? 'Running…' : 'Done'}
            </span>
          </div>
          <Row label="Total" value={job.total} isDark={isDark} fmt={fmtN} />
          <Row label="Done" value={job.done ?? 0} isDark={isDark} fmt={fmtN} />
          <Row label="Skipped (duplicate)" value={job.skipped ?? 0} isDark={isDark} fmt={fmtN} />
          <Row label="Errors" value={job.errors ?? 0} isDark={isDark} fmt={fmtN} />
        </ReportCard>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Main consolidated page
   ═══════════════════════════════════════════════════════════════════════ */
function ExtendedReportsInner() {
  const isDark = useDark();
  const location = useLocation();
  const initialTab = TABS.find((t) => t.path === location.pathname)?.key || 'day-book';
  const [tab, setTab] = useState(initialTab);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
        <PageHeader
          icon={BarChart3}
          title="Extended Accounting Reports"
          subtitle="Day book, cash flow, aging, bank reconciliation, depreciation, TDS/TCS, ratios and more — all in one place."
          isDark={isDark}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-2">
          {tab === 'day-book' && <DayBookSection isDark={isDark} />}
          {tab === 'cash-bank-book' && <CashBankBookSection isDark={isDark} />}
          {tab === 'cash-flow' && <CashFlowSection isDark={isDark} />}
          {tab === 'outstanding' && <OutstandingSection isDark={isDark} />}
          {tab === 'bank-reconciliation' && <BankReconciliationSection isDark={isDark} />}
          {tab === 'depreciation' && <DepreciationSection isDark={isDark} />}
          {tab === 'tds-tcs' && <TdsTcsSection isDark={isDark} />}
          {tab === 'financial-ratios' && <FinancialRatiosSection isDark={isDark} />}
          {tab === 'comparative' && <ComparativeSection isDark={isDark} />}
          {tab === 'yearly' && <YearlySection isDark={isDark} />}
          {tab === 'opening-balances' && <OpeningBalancesSection isDark={isDark} />}
          {tab === 'audit-trail' && <AuditTrailSection isDark={isDark} />}
          {tab === 'bulk-import' && <BulkImportSection isDark={isDark} />}
        </div>
      </div>
    </div>
  );
}

export default function ExtendedReports() {
  return (
    <RequestAccessGate module="accounting_reports" moduleLabel="Accounting Reports" permissionFlag="can_view_accounting_reports">
      <ExtendedReportsInner />
    </RequestAccessGate>
  );
}
