import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Landmark, Plus, UploadCloud, RefreshCw, CheckCircle2, AlertTriangle,
  Trash2, Link2, Unlink, X, ChevronRight, Search, Edit3, Eye, History, Ban, BookOpen,
} from 'lucide-react';
import GifLoader, { MiniLoader, ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import { mirrorBankToSettings, bankFromAccount } from '@/lib/bankSync';
import { GuidanceNote } from '@/components/ui/GuidanceNote.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (value) => { if (!value) return '—'; try { return format(parseISO(value), 'dd MMM yyyy'); } catch { return value; } };

// ─── Smart suggestion scorer: amount, date, narration, party name, ───
// ─── invoice no, bank reference, GSTIN — returns a 0-99 confidence %. ───
function scoreInvoiceMatch(txn, inv) {
  let score = 0;
  const txnAmt = Number(txn.debit || txn.credit || 0);
  const invAmt = Number(inv.total || inv.grand_total || inv.amount || 0);
  if (txnAmt > 0 && invAmt > 0) {
    const diff = Math.abs(txnAmt - invAmt) / Math.max(txnAmt, invAmt);
    if (diff < 0.001) score += 45;
    else if (diff < 0.02) score += 38;
    else if (diff < 0.05) score += 25;
    else if (diff < 0.1) score += 12;
  }
  try {
    const td = new Date(txn.date), id = new Date(inv.invoice_date || inv.date);
    const days = Math.abs((td - id) / 86400000);
    if (days <= 1) score += 18;
    else if (days <= 7) score += 12;
    else if (days <= 30) score += 6;
  } catch {}
  const desc = ((txn.description || '') + ' ' + (txn.reference || '')).toLowerCase();
  const party = (inv.customer_name || inv.vendor_name || inv.party_name || '').toLowerCase();
  if (party && desc.includes(party.split(' ')[0])) score += 14;
  const invNo = (inv.invoice_number || inv.number || '').toLowerCase();
  if (invNo && desc.includes(invNo)) score += 9;
  // Bank reference number — UTR/cheque/ref on the invoice matching the bank line's own reference column.
  const invRef = (inv.reference_number || inv.utr || inv.payment_reference || '').toLowerCase();
  if (invRef && (txn.reference || '').toLowerCase().includes(invRef)) score += 8;
  // GSTIN — occasionally present in narration for GST-linked NEFT/RTGS transfers.
  const gstin = (inv.gstin || inv.customer_gstin || '').toLowerCase();
  if (gstin && desc.includes(gstin)) score += 6;
  return Math.min(99, Math.max(0, Math.round(score)));
}

function BankAccountsInner() {
  const isDark = useDark();
  const { user, hasPermission } = useAuth();
  const canMatch = user?.role === 'admin' || hasPermission('can_match_bank');
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [form, setForm] = useState({ bank_name: '', account_holder: '', account_number: '', ifsc: '', branch: '', account_type: 'current', opening_balance: 0, upi_id: '', company_id: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  // Manual match state
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState({});
  const [matchDialog, setMatchDialog] = useState(null);
  const [auditDialog, setAuditDialog] = useState(null);
  const [progress, setProgress] = useState(null);
  const [invoiceCache, setInvoiceCache] = useState([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/bank-accounts');
      setAccounts(data || []);
      if (data?.length && !selected) setSelected(data[0]);
    } catch { toast.error('Failed to load bank accounts'); }
    finally { setLoading(false); }
  };

  const fetchTransactions = async (bankAccountId) => {
    if (!bankAccountId) return;
    setTxnLoading(true);
    try {
      const { data } = await api.get(`/bank-accounts/${bankAccountId}/transactions`);
      setTransactions(data || []);
      setSelectedIds({});
    } catch { toast.error('Failed to load transactions'); }
    finally { setTxnLoading(false); }
  };

  useEffect(() => {
    fetchAccounts();
    api.get('/companies/list').then(r => setCompanies(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { if (selected) fetchTransactions(selected.id); }, [selected?.id]);

  const stats = useMemo(() => {
    const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);
    const matched = transactions.filter(t => t.matched_type).length;
    return { totalBalance, accountCount: accounts.length, matched, unmatched: transactions.length - matched };
  }, [accounts, transactions]);

  const visibleTxns = useMemo(() => {
    if (filter === 'matched') return transactions.filter(t => t.matched_type);
    if (filter === 'unmatched') return transactions.filter(t => !t.matched_type && !t.ignored);
    if (filter === 'ignored') return transactions.filter(t => t.ignored);
    return transactions;
  }, [transactions, filter]);

  const createAccount = async () => {
    if (!form.bank_name.trim()) { toast.error('Bank name is required'); return; }
    setSavingAccount(true);
    try {
      await api.post('/bank-accounts', form);
      if (form.company_id) mirrorBankToSettings(form.company_id, bankFromAccount(form));
      toast.success(form.company_id ? 'Bank account added & synced to invoice/quotation settings' : 'Bank account added');
      setShowNewAccount(false);
      setForm({ bank_name: '', account_holder: '', account_number: '', ifsc: '', branch: '', account_type: 'current', opening_balance: 0, upi_id: '', company_id: '' });
      await fetchAccounts();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add bank account'); }
    finally { setSavingAccount(false); }
  };

  const deleteAccount = async (id) => {
    if (!window.confirm('Delete this bank account and all its transactions?')) return;
    try {
      await api.delete(`/bank-accounts/${id}`);
      toast.success('Bank account deleted');
      if (selected?.id === id) setSelected(null);
      await fetchAccounts();
    } catch { toast.error('Failed to delete bank account'); }
  };

  // ─── Live progress driver ────────────────────────────────────────
  const runProgress = () => {
    const steps = [
      { label: 'Preparing Document', pct: 5 },
      { label: 'Converting Pages', pct: 15 },
      { label: 'Reading Batches (OCR)', pct: 45 },
      { label: 'Extracting Transactions', pct: 65 },
      { label: 'Matching Ledger', pct: 82 },
      { label: 'Posting Entries', pct: 94 },
    ];
    let i = 0;
    setProgress({ ...steps[0], step: 1, total: steps.length });
    const timer = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setProgress({ ...steps[i], step: i + 1, total: steps.length });
    }, 1200);
    return () => clearInterval(timer);
  };

  const handleUpload = async () => {
    if (!file || !selected) { toast.error('Choose a statement file first'); return; }
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    const stop = runProgress();
    try {
      const { data } = await api.post(`/bank-accounts/${selected.id}/upload-statement`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProgress({ label: 'Completed', pct: 100, step: 6, total: 6 });
      toast.success(`${data.transactions_saved} transactions read · ${data.auto_matched} matched · ${data.auto_posted} posted to ledger`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await fetchAccounts();
      await fetchTransactions(selected.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not read this statement');
    } finally {
      stop();
      setTimeout(() => setProgress(null), 900);
      setUploading(false);
    }
  };

  const unmatchTxn = async (txnId, silent = false) => {
    let reason = '';
    if (!silent) {
      if (!window.confirm('Unmatch this transaction? The reconciliation link and its journal entry will be removed. The invoice, receipt, voucher, ledger and audit history are preserved.')) return false;
      reason = window.prompt('Optional: reason for unmatching (recorded in the audit trail)') || '';
    }
    try {
      await api.post(`/bank-transactions/${txnId}/unmatch`, { reason });
      if (!silent) toast.success('Unmatched — journal entry reversed');
      await fetchTransactions(selected.id);
      return true;
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to unmatch'); return false; }
  };

  const loadInvoices = async () => {
    if (invoiceCache.length) return;
    setInvoiceLoading(true);
    try {
      const { data } = await api.get('/invoices', { params: { page: 1, page_size: 2000 } });
      const list = Array.isArray(data) ? data : (data?.items || data?.invoices || []);
      setInvoiceCache(list);
    } catch { /* silent */ }
    finally { setInvoiceLoading(false); }
  };

  const openMatch = async (txn, mode) => {
    setInvoiceSearch('');
    setMatchDialog({ txn, mode });
    loadInvoices();
  };

  const confirmMatch = async (txn, inv, score) => {
    try {
      const isDebit = Number(txn.debit || 0) > 0;
      const matched_type = isDebit ? 'purchase' : 'sale';
      const matched_label = `${inv.invoice_number || inv.number || ''} · ${inv.customer_name || inv.vendor_name || inv.party_name || ''}`.trim();
      const payload = { matched_type, matched_id: inv.id, matched_label, post_journal: true, confidence: score ?? null };
      if (txn.matched_type) {
        // Same transaction, changing to a different record — atomic edit-match:
        // reverses the previous mapping and applies the new one in one call.
        await api.post(`/bank-transactions/${txn.id}/edit-match`, payload);
        toast.success('Match updated · ledger updated');
      } else {
        await api.post(`/bank-transactions/${txn.id}/match`, payload);
        toast.success('Matched · ledger updated');
      }
      setMatchDialog(null);
      await fetchTransactions(selected.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to match');
    }
  };

  const viewAudit = async (txn) => {
    try {
      const { data } = await api.get(`/bank-transactions/${txn.id}/audit-trail`);
      setAuditDialog({ txn, entries: Array.isArray(data) ? data : (data?.entries || [data]) });
    } catch { toast.error('No audit trail available'); }
  };

  const viewLedger = (txn) => {
    if (!txn.journal_entry_id) { toast.error('No journal entry posted for this transaction yet'); return; }
    window.open(`/journal-entries?entry=${txn.journal_entry_id}`, '_blank', 'noopener');
  };

  const toggleIgnore = async (txn) => {
    const next = !txn.ignored;
    setTransactions(ts => ts.map(x => x.id === txn.id ? { ...x, ignored: next } : x));
    try {
      await api.post(`/bank-transactions/${txn.id}/ignore`, { ignored: next });
    } catch {
      toast.error('Failed to update — reverting');
      setTransactions(ts => ts.map(x => x.id === txn.id ? { ...x, ignored: !next } : x));
    }
  };

  const selectedList = Object.keys(selectedIds).filter(k => selectedIds[k]);
  const bulkUnmatch = async () => {
    if (!selectedList.length) return;
    if (!window.confirm(`Unmatch ${selectedList.length} transactions? Journal entries will be reversed. Invoices and audit history are preserved.`)) return;
    for (const id of selectedList) { await unmatchTxn(id, true); }
    toast.success(`${selectedList.length} unmatched`);
  };
  const bulkIgnore = async () => {
    if (!selectedList.length) return;
    const ids = [...selectedList];
    setTransactions(ts => ts.map(t => selectedIds[t.id] ? { ...t, ignored: true } : t));
    setSelectedIds({});
    try {
      await Promise.all(ids.map(id => api.post(`/bank-transactions/${id}/ignore`, { ignored: true })));
      toast.success(`${ids.length} marked ignored`);
    } catch {
      toast.error('Some transactions could not be marked ignored');
      await fetchTransactions(selected.id);
    }
  };

  const suggestionsFor = (txn) => {
    if (!invoiceCache.length) return [];
    return invoiceCache
      .map(inv => ({ inv, score: scoreInvoiceMatch(txn, inv) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  };

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    const base = invoiceCache;
    if (!q) return base.slice(0, 200);
    return base.filter(i => {
      const hay = [i.invoice_number, i.number, i.customer_name, i.vendor_name, i.party_name, i.gstin, i.total, i.amount, i.invoice_date, i.date]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 200);
  }, [invoiceCache, invoiceSearch]);

  if (loading) return <ContentLoader />;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Landmark className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Bank Accounts</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">
                  Upload a statement from any bank. Transactions are read automatically, matched to purchase/sale invoices, and posted to the ledger.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowNewAccount(true)} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20">
                <Plus className="h-4 w-4 mr-2" /> Add bank account
              </Button>
              <Button onClick={fetchAccounts} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20">
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </Button>
            </div>
          </div>
        </div>

        <GuidanceNote pageKey="bank-accounts" isDark={isDark} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: 'Bank Accounts', value: stats.accountCount, icon: Landmark, color: COLORS.mediumBlue },
            { label: 'Total Balance', value: fmtC(stats.totalBalance), icon: CheckCircle2, color: COLORS.emeraldGreen },
            { label: 'Matched (this account)', value: stats.matched, icon: Link2, color: COLORS.deepBlue },
            { label: 'Unmatched (this account)', value: Math.max(stats.unmatched, 0), icon: AlertTriangle, color: stats.unmatched ? COLORS.amber : COLORS.emeraldGreen },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-4 shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.value}</p>
                </div>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: s.color }}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[300px_1fr] gap-5">
          <div className={`rounded-3xl border shadow-sm p-4 h-fit ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-2">Your bank accounts</p>
            {accounts.length === 0 ? (
              <p className="text-sm text-slate-400 p-3">No bank accounts yet. Add one to get started.</p>
            ) : accounts.map(a => (
              <button key={a.id} onClick={() => setSelected(a)}
                className={`w-full text-left rounded-2xl p-3 mb-2 border transition flex items-center justify-between gap-2 ${
                  selected?.id === a.id ? 'border-blue-300 bg-blue-50/60'
                  : isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'
                }`}>
                <div className="min-w-0">
                  <p className={`font-bold text-sm truncate ${isDark && selected?.id !== a.id ? 'text-slate-100' : 'text-slate-900'}`}>{a.bank_name}</p>
                  <p className="text-xs text-slate-400 truncate">{a.account_number_masked || a.account_holder}</p>
                  {a.company_id && companies.find(c => c.id === a.company_id) && (
                    <p className="text-[10px] text-blue-500 font-semibold truncate mt-0.5">
                      {companies.find(c => c.id === a.company_id)?.name}
                    </p>
                  )}
                  <p className="text-sm font-bold mt-1" style={{ color: COLORS.emeraldGreen }}>{fmtC(a.current_balance)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                  <Trash2 className="h-3.5 w-3.5 text-slate-300 hover:text-rose-500"
                    onClick={(e) => { e.stopPropagation(); deleteAccount(a.id); }} />
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {!selected ? (
              <div className={`rounded-3xl border shadow-sm py-20 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <Landmark className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-400">Select or add a bank account</p>
              </div>
            ) : (
              <>
                <div className={`rounded-3xl border shadow-sm p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: COLORS.mediumBlue }}>
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Upload statement — {selected.bank_name}</h2>
                      <p className="text-xs text-slate-400">CSV, XLSX, or PDF exports. Large PDFs auto-batch (3 pages/req, parallel).</p>
                    </div>
                  </div>
                  <div className={`border-2 border-dashed rounded-2xl p-5 text-center ${isDark ? 'border-slate-700 bg-slate-900/60' : 'border-blue-100 bg-blue-50/60'}`}>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    <UploadCloud className="h-9 w-9 mx-auto mb-3" style={{ color: COLORS.mediumBlue }} />
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{file ? file.name : 'Choose statement file'}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl">Browse</Button>
                      {file && <Button type="button" variant="ghost" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="rounded-xl"><X className="h-4 w-4" /></Button>}
                      <Button onClick={handleUpload} disabled={uploading || !file} className="rounded-xl text-white" style={{ background: COLORS.deepBlue }}>
                        {uploading ? <MiniLoader height={18} /> : 'Read & Match'}
                      </Button>
                    </div>
                    {progress && (
                      <div className="mt-4 text-left">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>{progress.label}</span>
                          <span>{progress.pct}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress.pct}%`, background: COLORS.mediumBlue }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <div>
                      <h2 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Transactions</h2>
                      <p className="text-xs text-slate-400">{visibleTxns.length} of {transactions.length} rows</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {['all','matched','unmatched','ignored'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                          className={`text-[11px] font-bold px-3 py-1 rounded-full border transition ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                          {f[0].toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                      {selectedList.length > 0 && canMatch && (
                        <>
                          <span className="text-[11px] font-bold text-slate-500 ml-2">{selectedList.length} selected</span>
                          <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={bulkUnmatch}>Bulk Unmatch</Button>
                          <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={bulkIgnore}>Bulk Ignore</Button>
                          <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={() => { setSelectedIds({}); loadInvoices(); toast.success('Suggestions refreshed'); }}>Refresh Suggestions</Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="divide-y max-h-[600px] overflow-y-auto" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    {txnLoading ? (
                      <div className="p-10 text-center"><MiniLoader height={24} /></div>
                    ) : visibleTxns.length === 0 ? (
                      <div className="py-16 text-center">
                        <p className="text-sm font-semibold text-slate-400">No transactions to show</p>
                        <p className="text-xs text-slate-400 mt-1">Upload a statement above or switch the filter.</p>
                      </div>
                    ) : visibleTxns.map(t => {
                      const top = invoiceCache.length ? suggestionsFor(t)[0] : null;
                      return (
                        <div key={t.id} className={`p-4 flex items-start gap-3 ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'} ${t.ignored ? 'opacity-60' : ''}`}>
                          <input type="checkbox" className="mt-1"
                            checked={!!selectedIds[t.id]}
                            onChange={e => setSelectedIds(s => ({ ...s, [t.id]: e.target.checked }))} />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{t.description || 'No description'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {fmtDate(t.date)} {t.reference ? `· ${t.reference}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              {t.ignored ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Ignored</span>
                              ) : t.matched_type ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Link2 className="h-3 w-3" /> Matched · {t.matched_label || t.matched_type} {t.journal_entry_id ? '· posted' : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Unmatched</span>
                              )}
                              {!t.matched_type && top && top.score >= 30 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Suggested: {top.inv.invoice_number || top.inv.number || '—'} · {top.score}%
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {t.matched_type ? (
                                <>
                                  {canMatch && (
                                    <button onClick={() => openMatch(t, 'edit')} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-blue-400 hover:text-blue-600 inline-flex items-center gap-1"><Edit3 className="h-3 w-3" /> Edit Match</button>
                                  )}
                                  {canMatch && (
                                    <button onClick={() => unmatchTxn(t.id)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-rose-400 hover:text-rose-600 inline-flex items-center gap-1"><Unlink className="h-3 w-3" /> Unmatch</button>
                                  )}
                                  {t.matched_id && (
                                    <a href={`/invoicing?open=${t.matched_id}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-400 inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Invoice</a>
                                  )}
                                  {t.journal_entry_id && (
                                    <button onClick={() => viewLedger(t)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-400 inline-flex items-center gap-1"><BookOpen className="h-3 w-3" /> Ledger</button>
                                  )}
                                  <button onClick={() => viewAudit(t)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-400 inline-flex items-center gap-1"><History className="h-3 w-3" /> Audit</button>
                                </>
                              ) : (
                                <>
                                  {canMatch ? (
                                    <>
                                      <button onClick={() => openMatch(t, 'match')} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-emerald-400 hover:text-emerald-600 inline-flex items-center gap-1"><Search className="h-3 w-3" /> Match</button>
                                      <button onClick={() => toggleIgnore(t)} className="text-[11px] font-bold px-2.5 py-1 rounded-md border border-slate-200 hover:border-slate-400 inline-flex items-center gap-1"><Ban className="h-3 w-3" /> {t.ignored ? 'Unignore' : 'Ignore'}</button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">View only — request Match access from your admin</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`font-bold ${t.debit ? 'text-rose-500' : 'text-emerald-600'}`}>
                              {t.debit ? `- ${fmtC(t.debit)}` : `+ ${fmtC(t.credit)}`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Match / Edit Match dialog */}
      <Dialog open={!!matchDialog} onOpenChange={(o) => { if (!o) setMatchDialog(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{matchDialog?.mode === 'edit' ? 'Edit Match' : 'Match Transaction'}</DialogTitle>
          </DialogHeader>
          {matchDialog && (
            <div className="space-y-3">
              <div className="rounded-xl border p-3 bg-slate-50 text-sm">
                <div className="flex justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{matchDialog.txn.description || 'Transaction'}</p>
                    <p className="text-xs text-slate-500">{fmtDate(matchDialog.txn.date)} · {matchDialog.txn.reference || '—'}</p>
                  </div>
                  <p className={`font-bold ${matchDialog.txn.debit ? 'text-rose-500' : 'text-emerald-600'}`}>
                    {matchDialog.txn.debit ? `- ${fmtC(matchDialog.txn.debit)}` : `+ ${fmtC(matchDialog.txn.credit)}`}
                  </p>
                </div>
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <Input placeholder="Search by invoice #, party, GSTIN, amount, date, voucher…" className="pl-9" value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} />
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y border rounded-xl">
                {invoiceLoading ? (
                  <div className="p-6 text-center"><MiniLoader height={22} /></div>
                ) : filteredInvoices.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-400">No invoices found.</p>
                ) : (
                  filteredInvoices
                    .map(inv => ({ inv, score: scoreInvoiceMatch(matchDialog.txn, inv) }))
                    .sort((a, b) => b.score - a.score)
                    .map(({ inv, score }) => (
                      <button key={inv.id} onClick={() => confirmMatch(matchDialog.txn, inv, score)}
                        className="w-full text-left p-3 hover:bg-blue-50 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {inv.invoice_number || inv.number || '—'} · {inv.customer_name || inv.vendor_name || inv.party_name || '—'}
                          </p>
                          <p className="text-xs text-slate-500">{fmtDate(inv.invoice_date || inv.date)} · {inv.gstin || ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-slate-700">{fmtC(inv.total || inv.grand_total || inv.amount)}</p>
                          <p className={`text-[10px] font-bold ${score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-slate-400'}`}>{score}% match</p>
                        </div>
                      </button>
                    ))
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Confirming will {matchDialog.mode === 'edit' ? 'reverse the previous reconciliation and create a new one' : 'create a new reconciliation'} — invoice status, ledger and dashboard update automatically.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit trail dialog */}
      <Dialog open={!!auditDialog} onOpenChange={(o) => { if (!o) setAuditDialog(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Audit trail</DialogTitle></DialogHeader>
          {auditDialog && (
            <div className="space-y-2 max-h-[420px] overflow-y-auto text-sm">
              {(auditDialog.entries || []).length === 0 && <p className="text-slate-400">No audit entries yet.</p>}
              {(auditDialog.entries || []).map((e, i) => {
                const action = e.action || e.match_type || 'event';
                const who = e.performed_by_name || e.matched_by_user || '—';
                const when = e.matched_on || e.edited_on || e.unmatched_on || e.timestamp;
                const badge = action === 'matched' ? { label: 'Matched', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                  : action === 'edited' ? { label: 'Edited', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
                  : action === 'unmatched' ? { label: 'Unmatched', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
                  : { label: action, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                const fmtMatch = (m) => m ? `${m.type || '—'} · ${m.label || m.id || '—'}` : '—';
                return (
                  <div key={i} className="border rounded-lg p-3 bg-slate-50 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                      <span className="text-[11px] text-slate-400">{when ? fmtDate(when) : ''}</span>
                    </div>
                    <p className="text-xs text-slate-600">By <span className="font-semibold text-slate-800">{who}</span></p>
                    {e.previous_match && <p className="text-xs text-slate-600">Previous match: <span className="font-medium">{fmtMatch(e.previous_match)}</span></p>}
                    {e.new_match && <p className="text-xs text-slate-600">New match: <span className="font-medium">{fmtMatch(e.new_match)}</span></p>}
                    {(e.confidence !== undefined && e.confidence !== null) && <p className="text-xs text-slate-600">Confidence: {Math.round(e.confidence)}%</p>}
                    {e.reason && <p className="text-xs text-slate-600">Reason: <span className="italic">{e.reason}</span></p>}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewAccount} onOpenChange={setShowNewAccount}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add bank account</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input placeholder="Bank name (e.g. HDFC Bank)" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
            <Input placeholder="Account holder name" value={form.account_holder} onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))} />
            <Input placeholder="Account number" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
            <Input placeholder="IFSC code" value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))} />
            <Input placeholder="Branch (optional)" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} />
            <Input placeholder="UPI ID (optional)" value={form.upi_id} onChange={e => setForm(f => ({ ...f, upi_id: e.target.value }))} />
            <Input type="number" placeholder="Opening balance" value={form.opening_balance} onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} />
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Link to Company (optional)</Label>
              <Select value={form.company_id || '__none__'} onValueChange={v => setForm(f => ({ ...f, company_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="Select company…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not linked —</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">Links this bank account to a company so Sale &amp; Quotation PDFs can use the same bank details.</p>
            </div>
            <Button onClick={createAccount} disabled={savingAccount} className="w-full rounded-xl">
              {savingAccount ? <MiniLoader height={18} /> : 'Save bank account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BankAccounts() {
  return (
    <RequestAccessGate module="bank" moduleLabel="Bank Accounts" permissionFlag="can_view_bank">
      <BankAccountsInner />
    </RequestAccessGate>
  );
}

export default BankAccounts;
