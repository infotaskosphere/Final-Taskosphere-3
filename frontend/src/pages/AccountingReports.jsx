import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart3, RefreshCw, CheckCircle2, AlertTriangle, Download, Building2,
  ChevronLeft, ChevronRight, Scale,
} from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import { GuidanceNote } from '@/components/ui/GuidanceNote.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ── Financial-Year helpers (India FY = 1 Apr → 31 Mar) ─────────────────── */
function currentFYStartYear(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 3 ? y : y - 1;   // Apr = month 3
}
function fyDates(startYear) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, label: `FY ${startYear}-${String(startYear + 1).slice(2)}` };
}
function buildFYOptions() {
  const now = currentFYStartYear();
  const out = [];
  for (let y = now + 1; y >= now - 6; y--) out.push({ value: String(y), ...fyDates(y) });
  return out;
}

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
    <div className="flex items-center justify-between py-1.5 gap-3">
      <span className={`text-sm ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-200' : 'text-slate-700'} min-w-0 truncate`}>{label}</span>
      <span className={`text-sm font-mono shrink-0 ${bold ? 'font-bold' : ''} ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(value)}</span>
    </div>
  );
}

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AccountingReportsInner() {
  const isDark = useDark();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trialBalance, setTrialBalance] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [misData, setMisData] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [activeTab, setActiveTab] = useState('trial-balance');

  // Unified date filter — applies to every tab.
  const fyOptions = useMemo(buildFYOptions, []);
  const defaultFY = String(currentFYStartYear());
  const [fyKey, setFyKey] = useState(defaultFY); // 'custom' | year string
  const [dateFrom, setDateFrom] = useState(fyDates(currentFYStartYear()).from);
  const [dateTo, setDateTo] = useState(fyDates(currentFYStartYear()).to);
  const [misSubTab, setMisSubTab] = useState('insights');

  // Trial Balance pagination (client-side).
  const [tbPage, setTbPage] = useState(1);
  const [tbPageSize, setTbPageSize] = useState(25);

  const [parties, setParties] = useState({ customers: [], vendors: [] });
  const [partyType, setPartyType] = useState('customer');
  const [partyName, setPartyName] = useState('');
  const [partyLedger, setPartyLedger] = useState(null);
  const [partyLoading, setPartyLoading] = useState(false);

  const fetchCompanies = async () => {
    try {
      const { data } = await api.get('/companies/list');
      setCompanies(data || []);
      return data || [];
    } catch {
      return [];
    }
  };

  const fetchParties = async (cid = companyId) => {
    try {
      const { data } = await api.get('/reports/parties', { params: { company_id: cid } });
      setParties(data || { customers: [], vendors: [] });
    } catch { /* non-fatal */ }
  };

  const fetchAll = async (opts = {}) => {
    const cid = opts.companyId !== undefined ? opts.companyId : companyId;
    const df = opts.dateFrom !== undefined ? opts.dateFrom : dateFrom;
    const dt = opts.dateTo !== undefined ? opts.dateTo : dateTo;
    setLoading(true);
    try {
      // as_of drives Trial Balance & Balance Sheet snapshot; date_from/to
      // drives P&L range. We pass all three so backend can honor whichever
      // it uses for that endpoint.
      const [tbR, pnlR, bsR, misR] = await Promise.allSettled([
        api.get('/reports/trial-balance', { params: { company_id: cid, as_of: dt || undefined, date_from: df || undefined, date_to: dt || undefined } }),
        api.get('/reports/profit-loss', { params: { company_id: cid, date_from: df || undefined, date_to: dt || undefined } }),
        api.get('/reports/balance-sheet', { params: { company_id: cid, as_of: dt || undefined, date_from: df || undefined, date_to: dt || undefined } }),
        api.get('/reports/mis-compliance', { params: { company_id: cid, date_from: df || undefined, date_to: dt || undefined } }),
      ]);
      setTrialBalance(tbR.status === 'fulfilled' ? tbR.value.data : null);
      setPnl(pnlR.status === 'fulfilled' ? pnlR.value.data : null);
      setBalanceSheet(bsR.status === 'fulfilled' ? bsR.value.data : null);
      setMisData(misR.status === 'fulfilled' ? misR.value.data : null);
      setTbPage(1);
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const list = await fetchCompanies();
      // "All Companies" is the most expensive view — it reconciles and
      // scans every book in the system. Defaulting to it on every single
      // page load (regardless of what the user actually wants to look at)
      // was the main reason Accounting Reports felt slow to open. Instead,
      // remember the last company viewed on this page and reopen straight
      // into it; fall back to the first company only the very first time.
      let initialCid = '';
      try {
        const stored = localStorage.getItem('accountingReports:lastCompanyId') || '';
        if (stored && list.some((c) => c.id === stored)) initialCid = stored;
        else if (list.length) initialCid = list[0].id;
      } catch {
        if (list.length) initialCid = list[0].id;
      }
      setCompanyId(initialCid);
      fetchParties(initialCid);
      fetchAll({ companyId: initialCid });
    })();
  }, []);

  const fetchPartyLedger = async () => {
    if (!partyName) { toast.error('Pick a customer or vendor first'); return; }
    setPartyLoading(true);
    try {
      const { data } = await api.get('/reports/party-ledger', {
        params: { party_name: partyName, party_type: partyType, company_id: companyId, date_from: dateFrom || undefined, date_to: dateTo || undefined },
      });
      setPartyLedger(data);
    } catch {
      toast.error('Failed to load party ledger');
    } finally {
      setPartyLoading(false);
    }
  };

  const onCompanyChange = (cid) => {
    const val = cid === '__all__' ? '' : cid;
    setCompanyId(val);
    try { localStorage.setItem('accountingReports:lastCompanyId', val); } catch { /* non-fatal */ }
    fetchAll({ companyId: val });
    fetchParties(val);
    setPartyLedger(null);
    setPartyName('');
  };

  const onFyChange = (key) => {
    setFyKey(key);
    if (key === 'custom') return;
    const d = fyDates(Number(key));
    setDateFrom(d.from);
    setDateTo(d.to);
    fetchAll({ dateFrom: d.from, dateTo: d.to });
    if (partyLedger) setTimeout(fetchPartyLedger, 0);
  };

  const applyDateFilters = () => { fetchAll(); if (partyLedger) fetchPartyLedger(); };

  const companyLabel = companies.find((c) => c.id === companyId)?.name || 'All Companies';

  const [partyExporting, setPartyExporting] = useState(false);

  const downloadPartyLedger = async (format = 'xlsx') => {
    if (!partyName) { toast.error('Pick a customer or vendor first'); return; }
    if (!partyLedger) { toast.error('Load the ledger first.'); return; }
    setPartyExporting(true);
    try {
      const { data } = await api.get(`/reports/party-ledger/export.${format}`, {
        params: { party_name: partyName, party_type: partyType, company_id: companyId, date_from: dateFrom || undefined, date_to: dateTo || undefined },
        responseType: 'blob',
      });
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeParty = partyName.replace(/[^a-z0-9]+/gi, '_');
      a.href = url;
      a.download = `Party_Ledger_${safeParty}_${dateFrom}_to_${dateTo}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Failed to download ${format.toUpperCase()}`);
    } finally {
      setPartyExporting(false);
    }
  };

  const downloadGeneralLedger = async () => {
    try {
      const { data } = await api.get('/journal-entries', {
        params: { company_id: companyId, date_from: dateFrom || undefined, date_to: dateTo || undefined, page: 1, page_size: 10000 },
      });
      const entries = Array.isArray(data) ? data : (data.entries || []);
      if (!entries.length) { toast.error('Nothing to download yet.'); return; }
      const rows = [['Date', 'Narration', 'Source', 'Account', 'Debit', 'Credit']];
      entries.forEach((e) => (e.lines || []).forEach((l) => rows.push([e.entry_date, e.narration, e.source, l.account_name, l.debit || '', l.credit || ''])));
      const safeCompany = companyLabel.replace(/[^a-z0-9]+/gi, '_');
      downloadCsv(`General_Ledger_${safeCompany}_${dateFrom}_to_${dateTo}.csv`, rows);
    } catch {
      toast.error('Failed to download general ledger');
    }
  };

  const downloadV2Export = async (format = 'xml') => {
    try {
      toast.info(`Preparing ${format.toUpperCase()} export via corporate ledger engine...`);
      const { data } = await api.get('/v2/exports/ledger', {
        params: {
          format,
          company_id: companyId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
        responseType: format === 'pdf' ? 'blob' : 'text',
      });
      
      const mimeTypes = {
        xml: 'application/xml',
        pdf: 'application/pdf',
        json: 'application/json',
      };
      
      const blob = new Blob([data], { type: mimeTypes[format] || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeCompany = companyLabel.replace(/[^a-z0-9]+/gi, '_');
      a.href = url;
      a.download = `Ledger_v2_${safeCompany}_${dateFrom}_to_${dateTo}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} exported successfully!`);
    } catch {
      toast.error(`Failed to export ledger in ${format.toUpperCase()} format.`);
    }
  };

  const downloadActiveReport = () => {
    const safeCompany = companyLabel.replace(/[^a-z0-9]+/gi, '_');
    const period = `${dateFrom}_to_${dateTo}`;
    if (activeTab === 'trial-balance') {
      if (!trialBalance) { toast.error('Nothing to download yet.'); return; }
      const rows = [['Account Code', 'Account Name', 'Debit', 'Credit']];
      (trialBalance.rows || []).forEach((r) => rows.push([r.code, r.name, r.debit || '', r.credit || '']));
      rows.push(['', 'Total', trialBalance.total_debit, trialBalance.total_credit]);
      downloadCsv(`Trial_Balance_${safeCompany}_${period}.csv`, rows);
    } else if (activeTab === 'pnl') {
      if (!pnl) { toast.error('Nothing to download yet.'); return; }
      const rows = [['Section', 'Account', 'Amount']];
      (pnl.income || []).forEach((r) => rows.push(['Income', r.name, r.amount]));
      rows.push(['Income', 'Total Income', pnl.total_income]);
      (pnl.expenses || []).forEach((r) => rows.push(['Expense', r.name, r.amount]));
      rows.push(['Expense', 'Total Expenses', pnl.total_expense]);
      rows.push(['', 'Net Profit / Loss', pnl.net_profit]);
      downloadCsv(`Profit_And_Loss_${safeCompany}_${period}.csv`, rows);
    } else if (activeTab === 'balance-sheet') {
      if (!balanceSheet) { toast.error('Nothing to download yet.'); return; }
      const rows = [['Section', 'Account', 'Amount']];
      (balanceSheet.assets || []).forEach((r) => rows.push(['Asset', r.name, r.amount]));
      rows.push(['Asset', 'Total Assets', balanceSheet.total_assets]);
      (balanceSheet.liabilities || []).forEach((r) => rows.push(['Liability', r.name, r.amount]));
      rows.push(['Liability', 'Total Liabilities', balanceSheet.total_liabilities]);
      (balanceSheet.equity || []).forEach((r) => rows.push(['Equity', r.name, r.amount]));
      rows.push(['Equity', 'Total Equity', balanceSheet.total_equity]);
      downloadCsv(`Balance_Sheet_${safeCompany}_${period}.csv`, rows);
    } else if (activeTab === 'party-ledger') {
      downloadPartyLedger('xlsx');
    }
  };

  // Trial Balance pagination slice.
  const tbRows = trialBalance?.rows || [];
  const tbTotalPages = Math.max(1, Math.ceil(tbRows.length / tbPageSize));
  const tbPageRows = useMemo(() => {
    const start = (tbPage - 1) * tbPageSize;
    return tbRows.slice(start, start + tbPageSize);
  }, [tbRows, tbPage, tbPageSize]);

  if (loading) return <ContentLoader />;

  // NOTE: DashboardLayout already applies page padding + max-width + background.
  // Do NOT wrap this in its own min-h-screen / max-w container or the header
  // shifts out of alignment with the sidebar and Dashboard page.
  return (
    <div className="space-y-5 w-full min-w-0">

      {/* Header — compact so it doesn't dominate the page. Tabs sit below. */}
      <div className="rounded-2xl overflow-hidden shadow-lg" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
        <div className="p-3 md:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold tracking-tight truncate">Accounting Reports</h1>
              <p className="text-[11px] text-blue-100 truncate">Trial Balance, P&amp;L, and Balance Sheet — live from every posted journal entry.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Select value={companyId || '__all__'} onValueChange={onCompanyChange}>
              <SelectTrigger className="h-8 min-w-[160px] bg-white/10 border-white/25 text-white text-xs">
                <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Companies</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fyKey} onValueChange={onFyChange}>
              <SelectTrigger className="h-8 min-w-[130px] bg-white/10 border-white/25 text-white text-xs">
                <SelectValue placeholder="Financial year" />
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setFyKey('custom'); }}
              className="h-8 rounded-md px-2 bg-white/10 border border-white/25 text-white text-xs"
            />
            <span className="text-xs text-blue-100">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setFyKey('custom'); }}
              className="h-8 rounded-md px-2 bg-white/10 border border-white/25 text-white text-xs"
            />
            <Button onClick={applyDateFilters} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-white hover:bg-white/20 text-xs">Apply</Button>
            <Button onClick={downloadActiveReport} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-white hover:bg-white/20 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </Button>
            <Button onClick={downloadGeneralLedger} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-white hover:bg-white/20 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> General Ledger
            </Button>
            <Button onClick={() => downloadV2Export('xml')} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-amber-300 hover:bg-white/25 text-xs font-bold">
              Tally ERP XML
            </Button>
            <Button onClick={() => downloadV2Export('pdf')} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-emerald-300 hover:bg-white/25 text-xs font-bold">
              Corporate PDF
            </Button>
            <Button onClick={() => downloadV2Export('json')} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-blue-300 hover:bg-white/25 text-xs font-bold">
              Structured JSON
            </Button>
            <Button
              onClick={() => {
                const fyLabel = fyOptions.find((f) => f.value === fyKey)?.label?.replace(/^FY\s*/i, '') || '';
                const params = new URLSearchParams();
                if (companyId) params.set('company_id', companyId);
                if (fyLabel) params.set('fy', fyLabel);
                navigate(`/opening-balances${params.toString() ? `?${params.toString()}` : ''}`);
              }}
              size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-white hover:bg-white/20 text-xs"
            >
              <Scale className="h-3.5 w-3.5 mr-1" /> Add Opening Balance
            </Button>
            <Button onClick={() => fetchAll()} size="sm" variant="outline" className="h-8 bg-white/10 border-white/25 text-white hover:bg-white/20 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <GuidanceNote pageKey="accounting-reports" isDark={isDark} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full h-11 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 border border-slate-200/50 dark:border-slate-700/50">
          <TabsTrigger value="trial-balance" className="h-9 text-[10px] xs:text-[11px] sm:text-xs md:text-sm font-semibold rounded-lg transition-all truncate data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">Trial Balance</TabsTrigger>
          <TabsTrigger value="pnl" className="h-9 text-[10px] xs:text-[11px] sm:text-xs md:text-sm font-semibold rounded-lg transition-all truncate data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="balance-sheet" className="h-9 text-[10px] xs:text-[11px] sm:text-xs md:text-sm font-semibold rounded-lg transition-all truncate data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">Balance Sheet</TabsTrigger>
          <TabsTrigger value="party-ledger" className="h-9 text-[10px] xs:text-[11px] sm:text-xs md:text-sm font-semibold rounded-lg transition-all truncate data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">Party Ledger</TabsTrigger>
          <TabsTrigger value="mis-compliance" className="h-9 text-[10px] xs:text-[11px] sm:text-xs md:text-sm font-semibold rounded-lg transition-all truncate data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">MIS &amp; Compliance</TabsTrigger>
        </TabsList>

        {/* ── Trial Balance ── */}
        <TabsContent value="trial-balance" className="mt-4">
          <ReportCard title={`Trial Balance — ${dateFrom} to ${dateTo}`} isDark={isDark}>
            {!trialBalance || tbRows.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No journal entries posted in this period.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {tbRows.length} accounts
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Rows per page</span>
                    <Select value={String(tbPageSize)} onValueChange={(v) => { setTbPageSize(Number(v)); setTbPage(1); }}>
                      <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_120px_120px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
                </div>
                {tbPageRows.map(r => (
                  <div key={r.account_id} className="grid grid-cols-[1fr_120px_120px] gap-2 py-1.5 text-sm">
                    <span className={`${isDark ? 'text-slate-200' : 'text-slate-700'} min-w-0 truncate`}>{r.code} — {r.name}</span>
                    <span className="text-right font-mono">{r.debit ? fmtC(r.debit) : ''}</span>
                    <span className="text-right font-mono">{r.credit ? fmtC(r.credit) : ''}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_120px_120px] gap-2 pt-2 mt-2 border-t font-bold text-sm" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>Total (all pages)</span>
                  <span className="text-right font-mono">{fmtC(trialBalance.total_debit)}</span>
                  <span className="text-right font-mono">{fmtC(trialBalance.total_credit)}</span>
                </div>

                {tbTotalPages > 1 && (
                  <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <span>
                      Showing {((tbPage - 1) * tbPageSize) + 1}–{Math.min(tbPage * tbPageSize, tbRows.length)} of {tbRows.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={tbPage <= 1} onClick={() => setTbPage(p => Math.max(1, p - 1))} className="rounded-lg">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-xs font-semibold px-2">Page {tbPage} of {tbTotalPages}</span>
                      <Button variant="outline" size="sm" disabled={tbPage >= tbTotalPages} onClick={() => setTbPage(p => Math.min(tbTotalPages, p + 1))} className="rounded-lg">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

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
            <ReportCard title={`Income — ${dateFrom} to ${dateTo}`} isDark={isDark}>
              {(pnl?.income || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No income posted in this period.</p> :
                pnl.income.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
              <Row label="Total Income" value={pnl?.total_income} isDark={isDark} bold />
            </ReportCard>
            <ReportCard title={`Expenses — ${dateFrom} to ${dateTo}`} isDark={isDark}>
              {(pnl?.expenses || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No expenses posted in this period.</p> :
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
            <ReportCard title={`Assets — as of ${dateTo}`} isDark={isDark}>
              {(balanceSheet?.assets || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No assets posted yet.</p> :
                balanceSheet.assets.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
              <Row label="Total Assets" value={balanceSheet?.total_assets} isDark={isDark} bold />
            </ReportCard>
            <div className="space-y-4">
              <ReportCard title={`Liabilities — as of ${dateTo}`} isDark={isDark}>
                {(balanceSheet?.liabilities || []).length === 0 ? <p className="text-sm text-slate-400 py-4">No liabilities posted yet.</p> :
                  balanceSheet.liabilities.map(r => <Row key={r.code} label={r.name} value={r.amount} isDark={isDark} />)}
                <Row label="Total Liabilities" value={balanceSheet?.total_liabilities} isDark={isDark} bold />
              </ReportCard>
              <ReportCard title={`Equity — as of ${dateTo}`} isDark={isDark}>
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

        {/* ── Party Ledger ── */}
        <TabsContent value="party-ledger" className="mt-4">
          <ReportCard title={`Party Ledger — ${dateFrom} to ${dateTo}`} isDark={isDark}>
            <div className="flex flex-wrap gap-2 items-end mb-4">
              <Select value={partyType} onValueChange={(v) => { setPartyType(v); setPartyName(''); setPartyLedger(null); }}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                </SelectContent>
              </Select>
              <Select value={partyName || undefined} onValueChange={setPartyName}>
                <SelectTrigger className="h-9 min-w-[220px]"><SelectValue placeholder={partyType === 'vendor' ? 'Select vendor' : 'Select customer'} /></SelectTrigger>
                <SelectContent>
                  {(partyType === 'vendor' ? parties.vendors : parties.customers).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={fetchPartyLedger} disabled={partyLoading}>{partyLoading ? 'Loading…' : 'Load Ledger'}</Button>
              <Button onClick={() => downloadPartyLedger('xlsx')} variant="outline" disabled={partyExporting || !partyLedger}>
                <Download className="h-4 w-4 mr-2" /> Excel
              </Button>
              <Button onClick={() => downloadPartyLedger('pdf')} variant="outline" disabled={partyExporting || !partyLedger}>
                <Download className="h-4 w-4 mr-2" /> PDF
              </Button>
            </div>
            {!partyLedger ? (
              <p className="text-sm text-slate-400 py-6 text-center">Pick a customer or vendor and load their ledger.</p>
            ) : partyLedger.rows.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No transactions found for {partyLedger.party_name} in this period.</p>
            ) : (
              <>
                <div className="grid grid-cols-[100px_1fr_100px_100px_110px] gap-2 text-[11px] uppercase font-bold text-slate-400 pb-2 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                  <span>Date</span><span>Narration</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span className="text-right">Balance</span>
                </div>
                {partyLedger.rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[100px_1fr_100px_100px_110px] gap-2 py-1.5 text-sm">
                    <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{r.date}</span>
                    <span className={`${isDark ? 'text-slate-200' : 'text-slate-700'} min-w-0 truncate`}>{r.narration}</span>
                    <span className="text-right font-mono">{r.debit ? fmtC(r.debit) : ''}</span>
                    <span className="text-right font-mono">{r.credit ? fmtC(r.credit) : ''}</span>
                    <span className="text-right font-mono font-semibold">{fmtC(r.balance)}</span>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-end gap-2 text-sm font-bold">
                  Closing Balance: {fmtC(partyLedger.closing_balance)}
                </div>
              </>
            )}
          </ReportCard>
        </TabsContent>

        {/* ── MIS & Compliance ── */}
        <TabsContent value="mis-compliance" className="mt-4">
          <div className="flex justify-center mb-4">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50">
              <button
                onClick={() => setMisSubTab('insights')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                  misSubTab === 'insights'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                MIS Ratios &amp; Insights
              </button>
              <button
                onClick={() => setMisSubTab('schedule-iii')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                  misSubTab === 'schedule-iii'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Companies Act (Schedule III)
              </button>
              <button
                onClick={() => setMisSubTab('income-tax')}
                className={`px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                  misSubTab === 'income-tax'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Income Tax Act (PGBP)
              </button>
            </div>
          </div>

          {!misData ? (
            <p className="text-sm text-slate-400 py-6 text-center">No compliance or MIS data found for this period.</p>
          ) : (
            <>
              {/* 1. MIS Insights */}
              {misSubTab === 'insights' && (
                <div className="space-y-6">
                  {/* Bento Grid */}
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Profitability Card */}
                    <div className={`rounded-3xl border p-5 shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Profitability (MIS)</h4>
                      <div className="space-y-4">
                        <div>
                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>EBITDA</span>
                          <p className={`text-2xl font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(misData.mis?.ebitda)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <div>
                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Operating Margin</span>
                            <p className="text-sm font-semibold text-indigo-500">{misData.mis?.ratios?.operating_margin_pct}%</p>
                          </div>
                          <div>
                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Net Margin</span>
                            <p className="text-sm font-semibold text-emerald-500">{misData.mis?.ratios?.net_margin_pct}%</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Liquidity Ratios Card */}
                    <div className={`rounded-3xl border p-5 shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Liquidity &amp; Working Capital</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Ratio</span>
                          <span className={`text-sm font-bold font-mono ${misData.mis?.ratios?.current_ratio >= 1.5 ? 'text-emerald-500' : 'text-amber-500'}`}>{misData.mis?.ratios?.current_ratio} <span className="text-xs font-normal text-slate-400">(Ideal: 2.0)</span></span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Quick Ratio</span>
                          <span className={`text-sm font-bold font-mono ${misData.mis?.ratios?.quick_ratio >= 1.0 ? 'text-emerald-500' : 'text-amber-500'}`}>{misData.mis?.ratios?.quick_ratio} <span className="text-xs font-normal text-slate-400">(Ideal: 1.0)</span></span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Avg. Collection Period</span>
                          <span className={`text-sm font-bold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{misData.mis?.ratios?.collection_period_days} Days</span>
                        </div>
                      </div>
                    </div>

                    {/* Cash Flow Summary Card */}
                    <div className={`rounded-3xl border p-5 shadow-sm md:col-span-2 lg:col-span-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cash Flow (MIS)</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs py-1">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Operating Activity</span>
                          <span className={`font-mono ${misData.mis?.cash_flow?.operating >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtC(misData.mis?.cash_flow?.operating)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Investing Activity</span>
                          <span className={`font-mono ${misData.mis?.cash_flow?.investing >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtC(misData.mis?.cash_flow?.investing)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Financing Activity</span>
                          <span className={`font-mono ${misData.mis?.cash_flow?.financing >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtC(misData.mis?.cash_flow?.financing)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold pt-2 border-t" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <span className={isDark ? 'text-slate-200' : 'text-slate-700'}>Net cash movement</span>
                          <span className={`font-mono ${misData.mis?.cash_flow?.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{fmtC(misData.mis?.cash_flow?.net)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Debtors Aging Summary */}
                  <ReportCard title="Debtors Aging Analysis (MIS Receivable Buckets)" isDark={isDark}>
                    <div className="space-y-4 py-2">
                      {Object.entries(misData.mis?.debtors_aging || {}).map(([bucket, val]) => {
                        const total = Object.values(misData.mis?.debtors_aging || {}).reduce((a, b) => a + b, 0) || 1;
                        const pct = Math.round((val / total) * 100);
                        return (
                          <div key={bucket} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className={isDark ? 'text-slate-300' : 'text-slate-600'}>{bucket} Days</span>
                              <span className="font-mono">{fmtC(val)} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ReportCard>
                </div>
              )}

              {/* 2. Companies Act Schedule III */}
              {misSubTab === 'schedule-iii' && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* BS */}
                    <ReportCard title="Schedule III — Balance Sheet (Equity &amp; Liabilities)" isDark={isDark}>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Shareholders' Funds</p>
                          <Row label="Share Capital" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.shareholders_funds?.share_capital} isDark={isDark} />
                          <Row label="Reserves and Surplus" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.shareholders_funds?.reserves_and_surplus} isDark={isDark} />
                          <Row label="Subtotal: Shareholders' Funds" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.shareholders_funds?.total} isDark={isDark} bold />
                        </div>
                        <div className="border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">2. Non-Current Liabilities</p>
                          <Row label="Long-term Borrowings / Liabilities" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.non_current_liabilities?.long_term_borrowings} isDark={isDark} />
                          <Row label="Subtotal: Non-Current Liabilities" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.non_current_liabilities?.total} isDark={isDark} bold />
                        </div>
                        <div className="border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">3. Current Liabilities</p>
                          <Row label="Trade Payables (Sundry Creditors)" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.current_liabilities?.trade_payables} isDark={isDark} />
                          <Row label="Other Current Liabilities (including GST &amp; TDS Payable)" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.current_liabilities?.other_current_liabilities} isDark={isDark} />
                          <Row label="Subtotal: Current Liabilities" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.current_liabilities?.total} isDark={isDark} bold />
                        </div>
                        <div className="border-t pt-3 mt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <Row label="TOTAL EQUITY AND LIABILITIES" value={misData.schedule_iii?.balance_sheet?.equity_and_liabilities?.total_equity_and_liabilities} isDark={isDark} bold />
                        </div>
                      </div>
                    </ReportCard>

                    <ReportCard title="Schedule III — Balance Sheet (Assets)" isDark={isDark}>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Non-Current Assets</p>
                          <Row label="Property, Plant and Equipment (Fixed Assets)" value={misData.schedule_iii?.balance_sheet?.assets?.non_current_assets?.property_plant_equipment} isDark={isDark} />
                          <Row label="Subtotal: Non-Current Assets" value={misData.schedule_iii?.balance_sheet?.assets?.non_current_assets?.total} isDark={isDark} bold />
                        </div>
                        <div className="border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">2. Current Assets</p>
                          <Row label="Inventories" value={misData.schedule_iii?.balance_sheet?.assets?.current_assets?.inventories} isDark={isDark} />
                          <Row label="Trade Receivables (Sundry Debtors)" value={misData.schedule_iii?.balance_sheet?.assets?.current_assets?.trade_receivables} isDark={isDark} />
                          <Row label="Cash and Cash Equivalents (Bank &amp; Cash in Hand)" value={misData.schedule_iii?.balance_sheet?.assets?.current_assets?.cash_and_cash_equivalents} isDark={isDark} />
                          <Row label="Short-term Loans &amp; Advances (including GST Input)" value={misData.schedule_iii?.balance_sheet?.assets?.current_assets?.short_term_loans_advances} isDark={isDark} />
                          <Row label="Subtotal: Current Assets" value={misData.schedule_iii?.balance_sheet?.assets?.current_assets?.total} isDark={isDark} bold />
                        </div>
                        <div className="border-t pt-3 mt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                          <Row label="TOTAL ASSETS" value={misData.schedule_iii?.balance_sheet?.assets?.total_assets} isDark={isDark} bold />
                        </div>
                      </div>
                    </ReportCard>
                  </div>

                  <ReportCard title="Schedule III — Statement of Profit &amp; Loss" isDark={isDark}>
                    <div className="space-y-3">
                      <Row label="I. Revenue from Operations (Gross Sales)" value={misData.schedule_iii?.pnl?.revenue_from_operations} isDark={isDark} />
                      <Row label="II. Other Income" value={misData.schedule_iii?.pnl?.other_income} isDark={isDark} />
                      <Row label="III. Total Income (I + II)" value={misData.schedule_iii?.pnl?.revenue_from_operations + misData.schedule_iii?.pnl?.other_income} isDark={isDark} bold />
                      
                      <div className="border-t pt-2 mt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">IV. Expenses</p>
                        <Row label="Cost of materials consumed / purchases" value={misData.schedule_iii?.pnl?.expenses?.cost_of_purchases} isDark={isDark} />
                        <Row label="Employee benefits expense (Salaries &amp; Wages)" value={misData.schedule_iii?.pnl?.expenses?.employee_benefits} isDark={isDark} />
                        <Row label="Finance costs (Bank charges/interests)" value={misData.schedule_iii?.pnl?.expenses?.finance_costs} isDark={isDark} />
                        <Row label="Depreciation &amp; amortization expense" value={misData.schedule_iii?.pnl?.expenses?.depreciation} isDark={isDark} />
                        <Row label="Other expenses" value={misData.schedule_iii?.pnl?.expenses?.other_operating_expenses} isDark={isDark} />
                        <Row label="Total Expenses" value={misData.schedule_iii?.pnl?.expenses?.total} isDark={isDark} bold />
                      </div>

                      <div className="border-t pt-2 mt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <Row label="V. Profit before Tax (III - IV)" value={misData.schedule_iii?.pnl?.profit_before_tax} isDark={isDark} bold />
                        <Row label="VI. Provision for Tax (estimated corporate rate 25%)" value={misData.schedule_iii?.pnl?.simulated_tax_provision} isDark={isDark} />
                        <Row label="VII. Profit after Tax (V - VI)" value={misData.schedule_iii?.pnl?.profit_after_tax} isDark={isDark} bold />
                      </div>
                    </div>
                  </ReportCard>
                </div>
              )}

              {/* 3. Income Tax Act */}
              {misSubTab === 'income-tax' && (
                <div className="space-y-6">
                  <ReportCard title="Income Tax Act — Computation of Taxable Business Income (PGBP)" isDark={isDark}>
                    <div className="space-y-3">
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} italic mb-2`}>
                        This calculation reconciles your Net Profit as per books to your Net Taxable Business Income under Profits and Gains of Business or Profession (PGBP) rules.
                      </p>

                      <Row label="Net Profit as per Book of Accounts" value={misData.income_tax?.book_net_profit} isDark={isDark} bold />
                      
                      <div className="border-t pt-2 mt-1" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Additions:</p>
                        <Row label="Add: Depreciation debited as per Companies Act rates" value={misData.income_tax?.depreciation_add_back} isDark={isDark} />
                        <Row label="Add: Section 43B Disallowances (unpaid statutory dues like GST/TDS)" value={misData.income_tax?.disallowance_43b} isDark={isDark} />
                      </div>

                      <div className="border-t pt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Deductions:</p>
                        <Row label="Less: Depreciation allowable as per Income Tax Rules, Section 32" value={misData.income_tax?.depreciation_it_deduction} isDark={isDark} />
                      </div>

                      <div className="border-t pt-3 mt-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <Row label="NET TAXABLE BUSINESS INCOME (PGBP)" value={misData.income_tax?.taxable_pgbp_income} isDark={isDark} bold />
                      </div>

                      <div className="border-t pt-3 mt-4" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Estimated Income Tax Computation</p>
                        <Row label={`Base Corporate/Proprietor Tax (${misData.income_tax?.tax_rate_pct}%)`} value={misData.income_tax?.base_tax} isDark={isDark} />
                        <Row label={`Add: Health and Education Cess (${misData.income_tax?.cess_pct}%)`} value={misData.income_tax?.cess_amount} isDark={isDark} />
                        <Row label="TOTAL ESTIMATED INCOME TAX PAYABLE" value={misData.income_tax?.total_tax_payable} isDark={isDark} bold />
                      </div>
                    </div>
                  </ReportCard>
                </div>
              )}
            </>
          )}
        </TabsContent>

      </Tabs>
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
