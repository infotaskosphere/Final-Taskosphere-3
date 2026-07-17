import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, RefreshCw, ShieldCheck, PlusCircle, X } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function AdjustmentDrawer({ entry, isDark, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([
    { account_id: '', account_name: '', debit: 0, credit: 0, memo: '' },
    { account_id: '', account_name: '', debit: 0, credit: 0, memo: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const updateLine = (i, field, value) => {
    const next = [...lines];
    next[i] = { ...next[i], [field]: field === 'debit' || field === 'credit' ? Number(value || 0) : value };
    setLines(next);
  };

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const submit = async () => {
    if (reason.trim().length < 10) { toast.error('Reason must be at least 10 characters.'); return; }
    if (!balanced) { toast.error('Correcting lines must balance (debit = credit).'); return; }
    if (lines.some(l => !l.account_id.trim())) { toast.error('Every line needs an Account ID.'); return; }
    setSaving(true);
    try {
      await api.post('/accounting-integrity/adjustment-note', {
        original_entry_id: entry.id,
        company_id: entry.company_id || '',
        reason: reason.trim(),
        correcting_lines: lines,
      });
      toast.success('Adjustment Note Override posted.');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not post adjustment note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl p-6 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Adjustment Note Override</h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className={`text-sm mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Correcting entry <span className="font-mono">{entry.id.slice(0, 8)}…</span> ({entry.narration}) — this posts a new,
          separately-tracked correcting voucher; the original stays untouched and permanently visible.
        </p>
        <Textarea placeholder="Reason for this adjustment (min 10 characters)…" value={reason} onChange={(e) => setReason(e.target.value)} className="mb-4" />

        <div className="space-y-2 mb-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-5 gap-2">
              <Input placeholder="Account ID" value={l.account_id} onChange={(e) => updateLine(i, 'account_id', e.target.value)} className="col-span-2" />
              <Input placeholder="Debit" type="number" value={l.debit} onChange={(e) => updateLine(i, 'debit', e.target.value)} />
              <Input placeholder="Credit" type="number" value={l.credit} onChange={(e) => updateLine(i, 'credit', e.target.value)} />
              <Input placeholder="Memo" value={l.memo} onChange={(e) => updateLine(i, 'memo', e.target.value)} />
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setLines([...lines, { account_id: '', account_name: '', debit: 0, credit: 0, memo: '' }])}>
          <PlusCircle className="h-4 w-4 mr-1" /> Add Line
        </Button>

        <div className={`flex items-center justify-between mt-4 text-sm ${balanced ? 'text-emerald-500' : 'text-red-500'}`}>
          <span>Debit: {fmtC(totalDebit)} · Credit: {fmtC(totalCredit)}</span>
          <span>{balanced ? 'Balanced ✓' : 'Debits must equal credits'}</span>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Posting…' : 'Post Adjustment Note'}</Button>
        </div>
      </div>
    </div>
  );
}

function AccountingIntegrityInner() {
  const isDark = useDark();
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeEntry, setActiveEntry] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [le, an] = await Promise.allSettled([
        api.get('/accounting-integrity/locked-entries'),
        api.get('/accounting-integrity/adjustment-notes'),
      ]);
      setLocked(le.status === 'fulfilled' ? le.value.data : []);
      setNotes(an.status === 'fulfilled' ? an.value.data : []);
    } catch {
      toast.error('Failed to load integrity data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  if (loading) return <ContentLoader />;

  const notesByEntry = notes.reduce((acc, n) => {
    (acc[n.original_entry_id] = acc[n.original_entry_id] || []).push(n);
    return acc;
  }, {});

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Lock className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">AI Accounting · Module 4</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">System Integrity &amp; Audit Trail</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">System-generated journal entries are locked — corrections go through a tracked Adjustment Note Override, never a silent edit.</p>
              </div>
            </div>
            <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
          </div>
        </div>

        <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h3 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Locked Entries (system-generated)</h3>
          </div>
          {locked.length === 0 ? (
            <p className={`p-6 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No locked entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Adjustments</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locked.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.entry_date}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{e.narration}</TableCell>
                    <TableCell><Badge variant="outline">{e.source}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{fmtC(e.total_debit)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtC(e.total_credit)}</TableCell>
                    <TableCell>
                      {notesByEntry[e.id]?.length
                        ? <Badge className="bg-amber-500 hover:bg-amber-500">{notesByEntry[e.id].length} note(s)</Badge>
                        : <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>—</span>}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setActiveEntry(e)}>Raise Adjustment</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="p-4 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
            <h3 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Adjustment Note History</h3>
          </div>
          {notes.length === 0 ? (
            <p className={`p-6 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No adjustment notes raised yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raised At</TableHead>
                  <TableHead>Original Entry</TableHead>
                  <TableHead>Correcting Entry</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="text-xs">{new Date(n.raised_at).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="font-mono text-xs">{n.original_entry_id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-xs">{n.correcting_entry_id.slice(0, 8)}…</TableCell>
                    <TableCell className="max-w-[320px] truncate">{n.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {activeEntry && (
        <AdjustmentDrawer
          entry={activeEntry}
          isDark={isDark}
          onClose={() => setActiveEntry(null)}
          onSaved={() => { setActiveEntry(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function AccountingIntegrity() {
  return (
    <RequestAccessGate module="manage_chart_of_accounts" moduleLabel="Accounting Integrity" permissionFlag="can_manage_chart_of_accounts">
      <AccountingIntegrityInner />
    </RequestAccessGate>
  );
}

export default AccountingIntegrity;
