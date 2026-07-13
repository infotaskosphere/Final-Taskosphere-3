import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Landmark, Plus, UploadCloud, RefreshCw, CheckCircle2, AlertTriangle,
  Trash2, Link2, Unlink, X, ChevronRight,
} from 'lucide-react';
import GifLoader, { MiniLoader, ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import { mirrorBankToSettings, bankFromAccount } from '@/lib/bankSync';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (value) => { if (!value) return '—'; try { return format(parseISO(value), 'dd MMM yyyy'); } catch { return value; } };

function BankAccountsInner() {
  const isDark = useDark();
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

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/bank-accounts');
      setAccounts(data || []);
      if (data?.length && !selected) setSelected(data[0]);
    } catch {
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (bankAccountId) => {
    if (!bankAccountId) return;
    setTxnLoading(true);
    try {
      const { data } = await api.get(`/bank-accounts/${bankAccountId}/transactions`);
      setTransactions(data || []);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setTxnLoading(false);
    }
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

  const createAccount = async () => {
    if (!form.bank_name.trim()) { toast.error('Bank name is required'); return; }
    setSavingAccount(true);
    try {
      await api.post('/bank-accounts', form);
      // Sync this account into Invoice + Quotation settings for the linked
      // company so the same bank details appear in all three places.
      if (form.company_id) mirrorBankToSettings(form.company_id, bankFromAccount(form));
      toast.success(form.company_id ? 'Bank account added & synced to invoice/quotation settings' : 'Bank account added');
      setShowNewAccount(false);
      setForm({ bank_name: '', account_holder: '', account_number: '', ifsc: '', branch: '', account_type: 'current', opening_balance: 0, upi_id: '', company_id: '' });
      await fetchAccounts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add bank account');
    } finally {
      setSavingAccount(false);
    }
  };

  const deleteAccount = async (id) => {
    if (!window.confirm('Delete this bank account and all its transactions?')) return;
    try {
      await api.delete(`/bank-accounts/${id}`);
      toast.success('Bank account deleted');
      if (selected?.id === id) setSelected(null);
      await fetchAccounts();
    } catch {
      toast.error('Failed to delete bank account');
    }
  };

  const handleUpload = async () => {
    if (!file || !selected) { toast.error('Choose a statement file first'); return; }
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const { data } = await api.post(`/bank-accounts/${selected.id}/upload-statement`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${data.transactions_saved} transactions read · ${data.auto_matched} matched · ${data.auto_posted} posted to ledger`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await fetchAccounts();
      await fetchTransactions(selected.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not read this statement');
    } finally {
      setUploading(false);
    }
  };

  const unmatchTxn = async (txnId) => {
    try {
      await api.post(`/bank-transactions/${txnId}/unmatch`);
      toast.success('Unmatched — journal entry reversed');
      await fetchTransactions(selected.id);
    } catch {
      toast.error('Failed to unmatch');
    }
  };

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
          {/* Accounts list */}
          <div className={`rounded-3xl border shadow-sm p-4 h-fit ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 px-2 mb-2">Your bank accounts</p>
            {accounts.length === 0 ? (
              <p className="text-sm text-slate-400 p-3">No bank accounts yet. Add one to get started.</p>
            ) : accounts.map(a => (
              <button
                key={a.id} onClick={() => setSelected(a)}
                className={`w-full text-left rounded-2xl p-3 mb-2 border transition flex items-center justify-between gap-2 ${
                  selected?.id === a.id
                    ? 'border-blue-300 bg-blue-50/60'
                    : isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
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
                  <Trash2
                    className="h-3.5 w-3.5 text-slate-300 hover:text-rose-500"
                    onClick={(e) => { e.stopPropagation(); deleteAccount(a.id); }}
                  />
                </div>
              </button>
            ))}
          </div>

          {/* Selected account detail */}
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
                      <p className="text-xs text-slate-400">CSV, XLSX, or PDF exports from any bank are supported.</p>
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
                  </div>
                </div>

                <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="p-4 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <h2 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Transactions</h2>
                    <p className="text-xs text-slate-400">{transactions.length} rows</p>
                  </div>
                  <div className="divide-y max-h-[600px] overflow-y-auto" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    {txnLoading ? (
                      <div className="p-10 text-center"><MiniLoader height={24} /></div>
                    ) : transactions.length === 0 ? (
                      <div className="py-16 text-center">
                        <p className="text-sm font-semibold text-slate-400">No transactions yet</p>
                        <p className="text-xs text-slate-400 mt-1">Upload a statement above to get started.</p>
                      </div>
                    ) : transactions.map(t => (
                      <div key={t.id} className={`p-4 flex items-center justify-between gap-4 ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'}`}>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{t.description || 'No description'}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(t.date)} {t.reference ? `· ${t.reference}` : ''}</p>
                          {t.matched_type ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                              <Link2 className="h-3 w-3" /> Matched · {t.matched_label} {t.journal_entry_id ? '· posted' : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-1 inline-block">Unmatched</span>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-3">
                          <p className={`font-bold ${t.debit ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {t.debit ? `- ${fmtC(t.debit)}` : `+ ${fmtC(t.credit)}`}
                          </p>
                          {t.matched_type && (
                            <button onClick={() => unmatchTxn(t.id)} title="Unmatch" className="text-slate-300 hover:text-rose-500">
                              <Unlink className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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
