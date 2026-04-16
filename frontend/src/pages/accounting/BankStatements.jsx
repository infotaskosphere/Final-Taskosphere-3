import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Trash2, Eye, X, CheckCircle, AlertCircle,
  RefreshCw, Download, Building2, Hash,
  CalendarDays, Clock, Database, Search, Pencil, Check, Plus
} from 'lucide-react';
import { FY_STRINGS, getCurrentFY } from '@/lib/financialYears';

const COLORS = { deepBlue:'#0D3B66', mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B', teal:'#0D9488' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(n||0);

const BANKS = ['SBI','HDFC','ICICI','Axis','Kotak','Bank of Baroda','Punjab National Bank','Canara Bank','Union Bank','Other'];

const DEFAULT_ACCT_CODES = [
  {code:'1002',label:'Bank Account – SBI'},
  {code:'1003',label:'Bank Account – HDFC'},
  {code:'1004',label:'Bank Account – ICICI'},
  {code:'1005',label:'Bank Account – Axis'},
  {code:'1006',label:'Bank Account – Others'},
];

// ── Default category heads (editable by user) ────────────────────────────────
const DEFAULT_HEADS = [
  'Sales Revenue','Purchase','Salary & Wages','Rent','Office Expenses',
  'Bank Charges','GST Payment','TDS Payment','Loan Repayment','Capital',
  'Drawings','Utilities','Travel & Conveyance','Professional Fees','Miscellaneous',
];

const STORAGE_KEY = 'taskosphere_category_heads';

function loadHeads() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_HEADS; }
  catch { return DEFAULT_HEADS; }
}
function saveHeads(heads) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(heads));
}

export default function BankStatements() {
  const dark = useDark();
  const fileRef  = useRef(null);
  const [stmts,    setStmts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [uploading,setUploading]= useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    bank_name:'SBI', account_number:'',
    bank_account_code:'1002', financial_year: getCurrentFY().label
  });
  const [search,   setSearch]   = useState('');

  // ── Category heads management ─────────────────────────────────────────────
  const [heads,       setHeads]       = useState(loadHeads);
  const [headsOpen,   setHeadsOpen]   = useState(false);
  const [newHead,     setNewHead]     = useState('');
  const [editHeadIdx, setEditHeadIdx] = useState(null);
  const [editHeadVal, setEditHeadVal] = useState('');

  // ── Per-transaction inline edit ───────────────────────────────────────────
  const [editingTxn,  setEditingTxn]  = useState(null);  // { index, field }
  const [txnDraft,    setTxnDraft]    = useState({});
  const [savingTxn,   setSavingTxn]   = useState(false);

  const fetchStmts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/accounting/bank-statements');
      setStmts(r.data || []);
    } catch { toast.error('Failed to load statements'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { fetchStmts(); }, [fetchStmts]);

  // persist heads to localStorage whenever they change
  useEffect(() => { saveHeads(heads); }, [heads]);

  const getStmtId = s => s.statement_id || s._id || s.id || s.stmt_id;

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
      const r = await api.post(`/accounting/bank-statements/upload?${params}`, fd, {
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
      await api.delete(`/accounting/bank-statements/${id}`);
      toast.success('Deleted');
      setStmts(s => s.filter(x => getStmtId(x) !== id));
      if (selected && getStmtId(selected) === id) setSelected(null);
    } catch { toast.error('Delete failed'); }
  };

  const viewDetail = async id => {
    if (!id) { toast.error('Invalid statement ID'); return; }
    try {
      const r = await api.get(`/accounting/bank-statements/${id}`);
      setSelected(r.data);
    } catch(err) {
      toast.error(err?.response?.data?.detail || 'Failed to load detail');
    }
  };

  const filtered = stmts.filter(s =>
    !search ||
    s.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.account_number?.includes(search) ||
    s.filename?.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = txns => {
    if (!txns?.length) return;
    const rows = [['Date','Description','Ref No','Debit','Credit','Balance','Category','Dr Account','Cr Account']];
    txns.forEach(t => rows.push([t.date,t.description,t.ref_no||'',t.debit,t.credit,t.balance,t.category||'',t.debit_account||'',t.credit_account||'']));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'bank_statement_categorised.csv';
    a.click();
  };

  // ── Heads CRUD ────────────────────────────────────────────────────────────
  const addHead = () => {
    const h = newHead.trim();
    if (!h || heads.includes(h)) return;
    setHeads(prev => [...prev, h]);
    setNewHead('');
    toast.success(`Head "${h}" added`);
  };
  const deleteHead = idx => {
    setHeads(prev => prev.filter((_,i) => i !== idx));
  };
  const startEditHead = (idx) => {
    setEditHeadIdx(idx);
    setEditHeadVal(heads[idx]);
  };
  const saveEditHead = () => {
    const h = editHeadVal.trim();
    if (!h) return;
    setHeads(prev => prev.map((v,i) => i === editHeadIdx ? h : v));
    setEditHeadIdx(null);
  };

  // ── Transaction inline edit ───────────────────────────────────────────────
  const startEditTxn = (idx, txn) => {
    setEditingTxn(idx);
    setTxnDraft({ category: txn.category||'', debit_account: txn.debit_account||'', credit_account: txn.credit_account||'' });
  };
  const cancelEditTxn = () => { setEditingTxn(null); setTxnDraft({}); };

  const saveTxn = async (idx) => {
    const stmtId = getStmtId(selected);
    if (!stmtId) return;
    setSavingTxn(true);
    try {
      const r = await api.patch(`/accounting/bank-statements/${stmtId}/transactions/${idx}`, txnDraft);
      // update local selected state
      setSelected(prev => {
        const txns = [...(prev.transactions||[])];
        txns[idx] = { ...txns[idx], ...r.data.transaction };
        return { ...prev, transactions: txns };
      });
      toast.success('Transaction updated');
      setEditingTxn(null);
    } catch(err) {
      toast.error(err?.response?.data?.detail || 'Update failed');
    } finally { setSavingTxn(false); }
  };

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Database size={22} style={{color:COLORS.mediumBlue}}/> Bank Statements
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Upload PDF/Excel bank statements for AI categorisation</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setHeadsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Hash size={14}/> Manage Heads
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
            style={{ background: COLORS.mediumBlue }}>
            {uploading ? <RefreshCw size={15} className="animate-spin"/> : <Upload size={15}/>}
            {uploading ? 'Processing…' : 'Upload Statement'}
          </button>
        </div>
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
              {DEFAULT_ACCT_CODES.map(a=><option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Financial Year</label>
            <select value={form.financial_year} onChange={e=>setForm(f=>({...f,financial_year:e.target.value}))}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
              {FY_STRINGS.map(y=><option key={y}>{y}</option>)}
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
              const sid = getStmtId(s);
              return (
                <div key={sid || s.filename} className="p-4">
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

      {/* ── Manage Heads Modal ── */}
      <AnimatePresence>
        {headsOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/50" onClick={()=>setHeadsOpen(false)}/>
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Category Heads</p>
                  <p className="text-xs text-gray-500 mt-0.5">Manage heads used to categorise bank transactions</p>
                </div>
                <button onClick={()=>setHeadsOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16}/></button>
              </div>
              <div className="p-5 max-h-80 overflow-y-auto space-y-1.5">
                {heads.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    {editHeadIdx === idx ? (
                      <>
                        <input autoFocus value={editHeadVal} onChange={e=>setEditHeadVal(e.target.value)}
                          onKeyDown={e=>{ if(e.key==='Enter') saveEditHead(); if(e.key==='Escape') setEditHeadIdx(null); }}
                          className="flex-1 text-sm rounded-lg border border-blue-400 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1"/>
                        <button onClick={saveEditHead} className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600"><Check size={13}/></button>
                        <button onClick={()=>setEditHeadIdx(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={13}/></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 py-1 px-2 rounded-lg group-hover:bg-gray-50 dark:group-hover:bg-gray-800/60">{h}</span>
                        <button onClick={()=>startEditHead(idx)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><Pencil size={12}/></button>
                        <button onClick={()=>deleteHead(idx)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><X size={12}/></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
                <input value={newHead} onChange={e=>setNewHead(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') addHead(); }}
                  placeholder="Add new category head…"
                  className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-3 py-1.5"/>
                <button onClick={addHead} disabled={!newHead.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90"
                  style={{background:COLORS.mediumBlue}}>
                  <Plus size={14}/> Add
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detail Drawer ── */}
      <AnimatePresence>
        {selected && (
          <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/40" onClick={()=>{ setSelected(null); cancelEditTxn(); }}/>
            <motion.div initial={{x:600}} animate={{x:0}} exit={{x:600}} transition={{type:'spring',damping:28}}
              className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl">
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Statement Detail</p>
                  <p className="text-xs text-gray-500">{selected.transactions?.length||selected.transactions_found||0} transactions · click <Pencil size={10} className="inline"/> to edit head</p>
                </div>
                <div className="flex gap-2">
                  {selected.transactions?.length > 0 && (
                    <button onClick={()=>exportCSV(selected.transactions)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Download size={12}/> Export CSV
                    </button>
                  )}
                  <button onClick={()=>{ setSelected(null); cancelEditTxn(); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X size={16}/></button>
                </div>
              </div>
              <div className="p-4">
                {(!selected.transactions || selected.transactions.length === 0) && (
                  <div className="text-center text-gray-400 text-sm py-10">No transactions found in this statement.</div>
                )}
                {selected.transactions?.map((t,i) => (
                  <div key={i} className={`p-3 mb-2 rounded-xl border ${dark?'border-gray-800 bg-gray-800/50':'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{t.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t.date} {t.ref_no ? `· ${t.ref_no}` : ''}</p>

                        {/* ── Inline edit for this transaction ── */}
                        {editingTxn === i ? (
                          <div className="mt-2 space-y-1.5">
                            <div>
                              <label className="text-xs text-gray-500 block mb-0.5">Category Head</label>
                              <select value={txnDraft.category} onChange={e=>setTxnDraft(d=>({...d,category:e.target.value}))}
                                className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white px-2 py-1">
                                {heads.map(h=><option key={h}>{h}</option>)}
                                <option value={txnDraft.category}>{txnDraft.category}</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="text-xs text-gray-500 block mb-0.5">Debit Account</label>
                                <input value={txnDraft.debit_account} onChange={e=>setTxnDraft(d=>({...d,debit_account:e.target.value}))}
                                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white px-2 py-1"/>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 block mb-0.5">Credit Account</label>
                                <input value={txnDraft.credit_account} onChange={e=>setTxnDraft(d=>({...d,credit_account:e.target.value}))}
                                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white px-2 py-1"/>
                              </div>
                            </div>
                            <div className="flex gap-1.5 pt-0.5">
                              <button onClick={()=>saveTxn(i)} disabled={savingTxn}
                                className="flex items-center gap-1 px-3 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                                style={{background:COLORS.emerald}}>
                                {savingTxn ? <RefreshCw size={11} className="animate-spin"/> : <Check size={11}/>} Save
                              </button>
                              <button onClick={cancelEditTxn} className="px-3 py-1 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-1">
                            <p className="text-xs text-blue-500 dark:text-blue-400">{t.category}</p>
                            <button onClick={()=>startEditTxn(i,t)}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition">
                              <Pencil size={10}/>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {t.credit > 0 && <p className="text-sm font-bold text-green-600 dark:text-green-400">+₹{fmt(t.credit)}</p>}
                        {t.debit  > 0 && <p className="text-sm font-bold text-red-500 dark:text-red-400">-₹{fmt(t.debit)}</p>}
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
