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
    try { const r = await api.get('/api/accounting/accounts'); setAccounts(r.data||[]); } catch {}
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
      await api.post('/api/accounting/journal-entries', form);
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
