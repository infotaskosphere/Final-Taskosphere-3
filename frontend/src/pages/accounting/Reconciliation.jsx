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
