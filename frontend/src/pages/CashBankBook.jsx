import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Landmark, RefreshCw, Download, ChevronDown } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

function LedgerTable({ account, isDark }) {
  const [open, setOpen] = useState(true);
  const isPositive = account.closing_balance >= 0;

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full px-5 py-4 flex items-center justify-between ${isDark ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'} ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
          <div className="text-left">
            <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{account.account_name}</p>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{account.account_code} · {account.rows.length} transactions</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-8 text-right">
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Opening</p>
            <p className={`font-mono font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{fmtC(account.opening_balance)}</p>
          </div>
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dr / Cr</p>
            <p className={`font-mono font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{fmtC(account.total_debit)} / {fmtC(account.total_credit)}</p>
          </div>
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Closing</p>
            <p className={`font-mono font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtC(account.closing_balance)}</p>
          </div>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/30' : 'text-slate-500 bg-slate-50'}`}>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Narration</th>
                <th className="px-4 py-2 text-left">Ref / Source</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {account.rows.length === 0 ? (
                <tr><td colSpan={6} className={`px-4 py-6 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No transactions in this period.</td></tr>
              ) : account.rows.map((r, i) => (
                <tr key={i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2.5 max-w-xs truncate">{r.narration || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{r.source || 'manual'}</span>
                    {r.ref_no && <span className={`ml-1 text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{r.ref_no}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.debit ? fmtC(r.debit) : <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.credit ? fmtC(r.credit) : <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtC(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 font-bold text-sm ${isDark ? 'border-slate-600 text-slate-100' : 'border-slate-300 text-slate-900'}`}>
                <td colSpan={3} className="px-4 py-2.5">Closing Balance</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmtC(account.total_debit)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmtC(account.total_credit)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${account.closing_balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtC(account.closing_balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function CashBankBookInner() {
  const isDark = useDark();
  const fy = (() => { const y = new Date(); return y.getMonth() >= 3 ? `${y.getFullYear()}-${String(y.getFullYear() + 1).slice(2)}` : `${y.getFullYear() - 1}-${String(y.getFullYear()).slice(2)}`; })();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedFy, setSelectedFy] = useState(fy);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const curYear = new Date().getFullYear();
  const fyOptions = Array.from({ length: 5 }, (_, i) => {
    const y = curYear - i; return `${y}-${String(y + 1).slice(2)}`;
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (fromDate && toDate) { params.from_date = fromDate; params.to_date = toDate; }
      else params.fy = selectedFy;
      const { data: res } = await api.get('/reports/cash-bank-book', { params });
      setData(res);
    } catch { toast.error('Failed to load Cash/Bank Book'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    const rows = [['Account', 'Date', 'Narration', 'Ref', 'Debit', 'Credit', 'Balance']];
    for (const acct of data?.accounts || []) {
      for (const r of acct.rows) {
        rows.push([acct.account_name, r.date, r.narration, r.ref_no, r.debit, r.credit, r.balance]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cash-bank-book.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Landmark className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Cash / Bank Book</h1>
                <p className="text-sm text-blue-100 mt-1">Running balance ledger for all cash and bank accounts.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20" disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} shadow-sm`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Financial Year</p>
            <Select value={selectedFy} onValueChange={v => { setSelectedFy(v); setFromDate(''); setToDate(''); }}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className={`text-xs font-medium flex items-center pb-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>or custom range:</div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>From</p>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>To</p>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-38" />
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        {/* Accounts */}
        {loading ? <ContentLoader /> : (
          <div className="space-y-4">
            {(data?.accounts || []).length === 0 ? (
              <div className={`rounded-2xl p-10 text-center text-sm ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'} border`}>
                No cash/bank accounts found. Add accounts in Chart of Accounts with codes 1000 (Cash) or 1010 (Bank).
              </div>
            ) : (data.accounts || []).map(a => <LedgerTable key={a.account_id} account={a} isDark={isDark} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CashBankBook() {
  return (
    <RequestAccessGate module="cash_bank_book" moduleLabel="Cash / Bank Book" permissionFlag="can_view_accounting_reports">
      <CashBankBookInner />
    </RequestAccessGate>
  );
}
