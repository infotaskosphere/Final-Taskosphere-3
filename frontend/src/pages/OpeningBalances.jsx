import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Scale, RefreshCw, Save, Plus, X } from 'lucide-react';
import { ContentLoader, MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function emptyLine() { return { account_id: '', account_name: '', account_code: '', debit: '', credit: '' }; }

function OpeningBalancesInner() {
  const isDark = useDark();
  const curYear = new Date().getFullYear();
  const fy = new Date().getMonth() >= 3 ? `${curYear}-${String(curYear + 1).slice(2)}` : `${curYear - 1}-${String(curYear).slice(2)}`;
  const fyOptions = Array.from({ length: 7 }, (_, i) => { const y = curYear - i; return `${y}-${String(y + 1).slice(2)}`; });

  const [selectedFy, setSelectedFy] = useState(fy);
  const [startDate, setStartDate] = useState(`${curYear}-04-01`);
  const [accounts, setAccounts] = useState([]);
  const [existingOB, setExistingOB] = useState([]);
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const [accR, obR] = await Promise.allSettled([
        api.get('/chart-of-accounts'),
        api.get('/opening-balances', { params: { fy: selectedFy } }),
      ]);
      const accts = accR.status === 'fulfilled' ? (accR.value.data || []) : [];
      setAccounts(accts);
      const obs = obR.status === 'fulfilled' ? (obR.value.data?.opening_balances || []) : [];
      setExistingOB(obs);

      // Pre-fill lines from existing OB if available
      if (obs.length > 0) {
        const prefilled = obs.map(ob => ({
          account_id: ob.account_id,
          account_name: ob.account_name || '',
          account_code: ob.account_code || '',
          debit: ob.debit || '',
          credit: ob.credit || '',
        }));
        prefilled.push(emptyLine());
        setLines(prefilled);
      } else {
        setLines([emptyLine(), emptyLine()]);
      }
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAccounts(); }, [selectedFy]);

  const updateLine = (idx, patch) => setLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.05 };
  }, [lines]);

  const handleSave = async () => {
    const validLines = lines.filter(l => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length === 0) { toast.error('Add at least one balance line'); return; }
    if (!totals.balanced) { toast.error(`Opening balances must be balanced. Difference: ${fmtC(Math.abs(totals.dr - totals.cr))}`); return; }
    setSaving(true);
    try {
      const payload = {
        fy: selectedFy,
        date: startDate,
        lines: validLines.map(l => ({ account_id: l.account_id, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })),
      };
      const { data: res } = await api.post('/opening-balances', payload);
      toast.success(`Saved ${res.saved} opening balance(s) for FY ${res.fy} and posted to ledger`);
      await fetchAccounts();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const acctGroups = useMemo(() => {
    const groups = {};
    for (const a of accounts) {
      const g = a.type || 'other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(a);
    }
    return groups;
  }, [accounts]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Scale className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Opening Balances</h1>
                <p className="text-sm text-blue-100 mt-1">Set opening balances for a new financial year. Auto-posts a balanced journal entry.</p>
              </div>
            </div>
            <Button onClick={fetchAccounts} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          </div>
        </div>

        {/* FY & Date */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Financial Year</p>
            <Select value={selectedFy} onValueChange={setSelectedFy}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>As on Date (Opening)</p>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 w-44" />
          </div>
        </div>

        {/* Existing OB note */}
        {existingOB.length > 0 && (
          <div className="rounded-xl px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <strong>Note:</strong> Opening balances for FY {selectedFy} already exist ({existingOB.length} accounts). Saving will overwrite the existing balances and repost the journal entry.
          </div>
        )}

        {/* Lines Grid */}
        {loading ? <ContentLoader /> : (
          <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`px-5 py-3 border-b flex gap-3 text-xs font-bold uppercase tracking-wider ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
              <span className="flex-1">Account</span>
              <span className="w-32 text-right">Debit (₹)</span>
              <span className="w-32 text-right">Credit (₹)</span>
              <span className="w-8" />
            </div>

            <div className="p-4 space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select
                    value={l.account_id}
                    onValueChange={(v) => {
                      const acct = accounts.find(a => a.id === v);
                      updateLine(idx, { account_id: v, account_name: acct?.name || '', account_code: acct?.code || '' });
                    }}
                  >
                    <SelectTrigger className="flex-1 h-9 text-xs">
                      <SelectValue placeholder="Select account…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Object.entries(acctGroups).map(([type, accts]) => (
                        <React.Fragment key={type}>
                          <div className={`px-2 py-1 text-xs font-bold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{type}</div>
                          {accts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.code} — {a.name}</SelectItem>)}
                        </React.Fragment>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={l.debit}
                    onChange={e => updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                    className="w-32 h-9 text-right font-mono text-sm"
                  />
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={l.credit}
                    onChange={e => updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                    className="w-32 h-9 text-right font-mono text-sm"
                  />
                  <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-500 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, emptyLine()])} className="mt-2 rounded-lg">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
              </Button>
            </div>

            {/* Totals */}
            <div className={`px-5 py-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className={`flex items-center justify-between rounded-xl p-3.5 font-semibold ${totals.balanced && totals.dr > 0 ? 'bg-emerald-50 text-emerald-700' : totals.dr > 0 ? 'bg-red-50 text-red-700' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
                <span>Total Debit: {fmtC(totals.dr)}</span>
                <span>{totals.balanced && totals.dr > 0 ? '✓ Balanced' : totals.dr > 0 ? `Difference: ${fmtC(Math.abs(totals.dr - totals.cr))}` : 'Add balances'}</span>
                <span>Total Credit: {fmtC(totals.cr)}</span>
              </div>
            </div>

            {/* Save */}
            <div className="px-5 pb-5">
              <Button
                onClick={handleSave}
                disabled={saving || !totals.balanced || totals.dr === 0}
                className="w-full rounded-xl h-11 font-semibold"
                style={{ background: totals.balanced && totals.dr > 0 ? COLORS.emeraldGreen : undefined }}
              >
                {saving ? <MiniLoader height={18} /> : <><Save className="h-4 w-4 mr-2" />Save Opening Balances & Post Journal Entry</>}
              </Button>
            </div>
          </div>
        )}

        {/* Existing OB Table */}
        {existingOB.length > 0 && (
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`px-5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <p className={`font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Saved Opening Balances — FY {selectedFy}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-xs font-semibold ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Account</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {existingOB.map((ob, i) => (
                  <tr key={i} className={`border-t ${isDark ? 'border-slate-700 text-slate-200' : 'border-slate-100 text-slate-800'}`}>
                    <td className="px-4 py-2 font-mono text-xs">{ob.account_code}</td>
                    <td className="px-4 py-2">{ob.account_name}</td>
                    <td className="px-4 py-2 text-right font-mono">{ob.debit > 0 ? fmtC(ob.debit) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{ob.credit > 0 ? fmtC(ob.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OpeningBalances() {
  return (
    <RequestAccessGate module="opening_balances" moduleLabel="Opening Balances" permissionFlag="can_manage_chart_of_accounts">
      <OpeningBalancesInner />
    </RequestAccessGate>
  );
}
