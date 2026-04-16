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
      const r = await api.get(`/accounting/ledger/${selected}?from_date=${filter.from}&to_date=${filter.to}`);
      setLedger(r.data);
    } catch(e) { toast.error('Failed to load ledger'); }
    finally { setLoading(false); }
  }, [selected, filter]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const exportExcel = async () => {
    if (!selected) return;
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const url = `/accounting/reports/export/ledger/${selected}?from_date=${filter.from}&to_date=${filter.to}`;
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
