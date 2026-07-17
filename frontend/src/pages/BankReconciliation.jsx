import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeftRight, UploadCloud, RefreshCw, CheckCircle2, X, Link2 } from 'lucide-react';
import { ContentLoader, MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

function BankReconciliationInner() {
  const isDark = useDark();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState(null);
  const [activeStatement, setActiveStatement] = useState(null);
  const [file, setFile] = useState(null);
  const [matchDialog, setMatchDialog] = useState(null); // { row, journalLines }
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    api.get('/bank-accounts').then(r => {
      const accts = r.data || [];
      setAccounts(accts);
      if (accts.length) setSelectedAccountId(accts[0].id);
    }).catch(() => {});
  }, []);

  const load = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get(`/bank-reconciliation/${selectedAccountId}`);
      setData(res);
      if (res.statements?.length) setActiveStatement(res.statements[0]);
    } catch { toast.error('Failed to load reconciliation data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (selectedAccountId) load(); }, [selectedAccountId]);

  const handleUpload = async () => {
    if (!file || !selectedAccountId) { toast.error('Select a bank account and a statement file'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    form.append('bank_account_id', selectedAccountId);
    try {
      const { data: res } = await api.post('/bank-reconciliation/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Uploaded ${res.total_rows} rows from ${res.filename}`);
      setFile(null);
      await load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const openMatchDialog = (row) => {
    const journalLines = data?.unmatched_journal_lines || [];
    setMatchDialog({ row, journalLines });
  };

  const handleMatch = async (row, entryId, lineId) => {
    if (!activeStatement) return;
    setMatching(true);
    try {
      await api.post(`/bank-reconciliation/${selectedAccountId}/match`, {
        statement_id: activeStatement.id,
        row_id: row.id,
        entry_id: entryId,
        line_id: lineId,
      });
      toast.success('Transaction matched');
      setMatchDialog(null);
      await load();
    } catch { toast.error('Match failed'); }
    finally { setMatching(false); }
  };

  const handleUnmatch = async (row) => {
    if (!activeStatement) return;
    try {
      await api.post(`/bank-reconciliation/${selectedAccountId}/unmatch`, {
        statement_id: activeStatement.id,
        row_id: row.id,
        entry_id: row.matched_entry_id || '',
        line_id: '',
      });
      toast.success('Unmatched');
      await load();
    } catch { toast.error('Unmatch failed'); }
  };

  const statementRows = activeStatement?.rows || [];
  const matchedCount = statementRows.filter(r => r.matched).length;
  const unmatchedCount = statementRows.length - matchedCount;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <ArrowLeftRight className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Bank Reconciliation</h1>
                <p className="text-sm text-blue-100 mt-1">Upload a bank statement (CSV/Excel/PDF) and match rows to journal entries.</p>
              </div>
            </div>
            <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          </div>
        </div>

        {/* Upload & Account Selector */}
        <div className={`rounded-2xl p-5 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <p className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Upload Bank Statement</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Bank Account</p>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_number?.slice(-4)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Statement File (CSV / Excel / PDF)</p>
              <Input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={e => setFile(e.target.files[0])} className="h-9 w-60" />
            </div>
            <Button onClick={handleUpload} disabled={uploading || !file || !selectedAccountId} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
              {uploading ? <MiniLoader height={16} /> : <><UploadCloud className="h-4 w-4 mr-2" />Upload</>}
            </Button>
          </div>
        </div>

        {/* Statement selector */}
        {data?.statements?.length > 0 && (
          <div className={`rounded-2xl p-4 border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className={`text-xs mb-2 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Uploaded Statements</p>
            <div className="flex flex-wrap gap-2">
              {data.statements.map(s => (
                <button key={s.id} onClick={() => setActiveStatement(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${activeStatement?.id === s.id ? 'border-blue-500 bg-blue-50 text-blue-700' : isDark ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {s.filename} · {s.total_rows} rows · {fmtDate(s.uploaded_at?.slice(0, 10))}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {activeStatement && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Rows', value: statementRows.length, color: isDark ? 'text-slate-100' : 'text-slate-900' },
              { label: 'Matched', value: matchedCount, color: 'text-emerald-600' },
              { label: 'Unmatched', value: unmatchedCount, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-4 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm text-center`}>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Statement Rows Table */}
        {loading ? <ContentLoader /> : activeStatement ? (
          <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Narration</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map((row, i) => (
                    <tr key={row.id || i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(row.statement_date)}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-xs">{row.narration || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.debit ? fmtC(row.debit) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{row.credit ? fmtC(row.credit) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtC(row.balance)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {row.matched ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Matched
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Unmatched</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.matched ? (
                          <button onClick={() => handleUnmatch(row)} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <button onClick={() => openMatchDialog(row)} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 mx-auto">
                            <Link2 className="h-3 w-3" /> Match
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl p-10 text-center text-sm border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'}`}>
            Upload a bank statement to begin reconciliation.
          </div>
        )}
      </div>

      {/* Match Dialog */}
      <Dialog open={!!matchDialog} onOpenChange={() => setMatchDialog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match Bank Row to Journal Entry</DialogTitle>
          </DialogHeader>
          {matchDialog && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="font-semibold">{fmtDate(matchDialog.row.statement_date)}</p>
                <p className="text-slate-600 mt-1">{matchDialog.row.narration}</p>
                <div className="flex gap-6 mt-2 font-mono text-sm">
                  {matchDialog.row.debit > 0 && <span className="text-rose-600">Dr {fmtC(matchDialog.row.debit)}</span>}
                  {matchDialog.row.credit > 0 && <span className="text-emerald-600">Cr {fmtC(matchDialog.row.credit)}</span>}
                </div>
              </div>
              <p className="text-sm font-semibold text-slate-700">Select matching journal entry:</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {matchDialog.journalLines.length === 0 ? (
                  <p className="text-sm text-slate-400">No unmatched journal lines for this bank account.</p>
                ) : matchDialog.journalLines.map((l, i) => (
                  <button key={l.id || i} onClick={() => handleMatch(matchDialog.row, l.entry_id, l.id)}
                    disabled={matching}
                    className="w-full text-left rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 px-4 py-3 text-sm transition-colors">
                    <div className="flex justify-between">
                      <span className="font-medium">{fmtDate(l.entry_date)}</span>
                      <span className="font-mono text-sm">Dr {fmtC(l.debit)} / Cr {fmtC(l.credit)}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">{l.memo || '—'}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BankReconciliation() {
  return (
    <RequestAccessGate module="bank_reconciliation" moduleLabel="Bank Reconciliation" permissionFlag="can_view_accounting_reports">
      <BankReconciliationInner />
    </RequestAccessGate>
  );
}
