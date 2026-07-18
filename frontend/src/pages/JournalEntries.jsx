import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { NotebookPen, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import GifLoader, { MiniLoader, ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';
import { GuidanceNote } from '@/components/ui/GuidanceNote.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (value) => { if (!value) return '—'; try { return format(parseISO(value), 'dd MMM yyyy'); } catch { return value; } };
const SOURCE_LABEL = { manual: 'Manual', purchase: 'Purchase', sale: 'Sale', bank: 'Bank' };

function emptyLine() { return { account_id: '', account_name: '', debit: '', credit: '', memo: '' }; }

function JournalEntriesInner() {
  const isDark = useDark();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [entriesR, accountsR] = await Promise.allSettled([
        api.get('/journal-entries'),
        api.get('/chart-of-accounts'),
      ]);
      setEntries(entriesR.status === 'fulfilled' ? (entriesR.value.data || []) : []);
      setAccounts(accountsR.status === 'fulfilled' ? (accountsR.value.data || []) : []);
    } catch {
      toast.error('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 && debit > 0 };
  }, [lines]);

  const updateLine = (idx, patch) => {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const submit = async () => {
    const validLines = lines
      .filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map(l => ({ account_id: l.account_id, account_name: l.account_name, debit: Number(l.debit || 0), credit: Number(l.credit || 0), memo: l.memo }));
    if (validLines.length < 2) { toast.error('Add at least two lines'); return; }
    if (!totals.balanced) { toast.error('Debit total must equal credit total'); return; }
    setSaving(true);
    try {
      await api.post('/journal-entries', { entry_date: entryDate, narration, lines: validLines });
      toast.success('Journal entry posted');
      setShowNew(false);
      setNarration('');
      setLines([emptyLine(), emptyLine()]);
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to post journal entry');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
    try {
      await api.delete(`/journal-entries/${id}`);
      toast.success('Journal entry deleted');
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (loading) return <ContentLoader />;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <NotebookPen className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Journal Entries</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">Every Purchase, Sale, and matched Bank transaction posts here automatically. Post manual entries for anything else.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowNew(true)} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Plus className="h-4 w-4 mr-2" /> New entry</Button>
              <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            </div>
          </div>
        </div>

        <GuidanceNote pageKey="journal-entries" isDark={isDark} />

        <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
            {entries.length === 0 ? (
              <div className="py-20 text-center">
                <NotebookPen className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-400">No journal entries yet</p>
              </div>
            ) : entries.map(e => (
              <div key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{e.narration || 'No narration'}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{SOURCE_LABEL[e.source] || e.source}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{fmtDate(e.entry_date)}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(e.total_debit)}</p>
                    <button onClick={() => deleteEntry(e.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-2 pl-1 space-y-1">
                  {(e.lines || []).map(l => (
                    <div key={l.id} className="flex items-center justify-between text-xs text-slate-500">
                      <span>{l.account_name}</span>
                      <span className="font-mono">{l.debit ? `Dr ${fmtC(l.debit)}` : `Cr ${fmtC(l.credit)}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>New journal entry</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
              <Input placeholder="Narration" value={narration} onChange={e => setNarration(e.target.value)} />
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_90px_90px_28px] gap-2 items-center">
                  <Select value={l.account_id} onValueChange={(v) => {
                    const acct = accounts.find(a => a.id === v);
                    updateLine(idx, { account_id: v, account_name: acct ? `${acct.code} ${acct.name}` : '' });
                  }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Debit" className="h-9" value={l.debit} onChange={e => updateLine(idx, { debit: e.target.value, credit: '' })} />
                  <Input type="number" placeholder="Credit" className="h-9" value={l.credit} onChange={e => updateLine(idx, { credit: e.target.value, debit: '' })} />
                  <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, emptyLine()])} className="rounded-lg"><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
            </div>
            <div className={`flex items-center justify-between text-sm font-semibold p-3 rounded-xl ${totals.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <span>Debit {fmtC(totals.debit)}</span>
              <span>Credit {fmtC(totals.credit)}</span>
              <span>{totals.balanced ? 'Balanced ✓' : 'Not balanced'}</span>
            </div>
            <Button onClick={submit} disabled={saving || !totals.balanced} className="w-full rounded-xl">{saving ? <MiniLoader height={18} /> : 'Post entry'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function JournalEntries() {
  return (
    <RequestAccessGate module="journal_entries" moduleLabel="Journal Entries" permissionFlag="can_view_journal_entries">
      <JournalEntriesInner />
    </RequestAccessGate>
  );
}

export default JournalEntries;
