import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { TrendingDown, Plus, RefreshCw, ChevronDown, Play } from 'lucide-react';
import { ContentLoader, MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

function AssetCard({ asset, isDark }) {
  const [open, setOpen] = useState(false);
  const pct = asset.cost > 0 ? Math.round((asset.accumulated_depreciation / asset.cost) * 100) : 0;

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <button onClick={() => setOpen(o => !o)} className={`w-full px-5 py-4 flex items-center gap-4 ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} transition-colors`}>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{asset.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${asset.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{asset.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700`}>{asset.method?.replace('_', ' ')}</span>
          </div>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Purchased {fmtDate(asset.purchase_date)} · {asset.useful_life_years} yrs useful life
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8 text-right flex-shrink-0">
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cost</p>
            <p className={`font-mono font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{fmtC(asset.cost)}</p>
          </div>
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Accum Dep</p>
            <p className="font-mono font-semibold text-sm text-amber-600">{fmtC(asset.accumulated_depreciation)}</p>
          </div>
          <div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Book Value</p>
            <p className="font-mono font-bold text-sm text-emerald-600">{fmtC(asset.book_value)}</p>
          </div>
        </div>
      </button>

      {/* Depreciation bar */}
      <div className="px-5 pb-3">
        <div className={`h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <div className="h-1.5 rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{pct}% depreciated</p>
      </div>

      {open && (
        <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/30' : 'text-slate-500 bg-slate-50'}`}>
                  <th className="px-4 py-2 text-left">Year</th>
                  <th className="px-4 py-2 text-right">Depreciation</th>
                  <th className="px-4 py-2 text-right">Closing Book Value</th>
                </tr>
              </thead>
              <tbody>
                {(asset.schedule || []).map(row => (
                  <tr key={row.year} className={`border-t ${isDark ? 'border-slate-700 text-slate-200' : 'border-slate-100 text-slate-800'}`}>
                    <td className="px-4 py-2.5">Year {row.year}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-600">{fmtC(row.depreciation)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtC(row.closing_book_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DepreciationScheduleInner() {
  const isDark = useDark();
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [running, setRunning] = useState(false);
  const [runPeriod, setRunPeriod] = useState(new Date().toISOString().slice(0, 7) + '-28');
  const [form, setForm] = useState({
    name: '', purchase_date: '', cost: '', salvage_value: '0',
    useful_life_years: '5', method: 'straight_line',
    asset_account_id: '', depreciation_account_id: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [schedR, acctsR] = await Promise.allSettled([
        api.get('/depreciation/schedule'),
        api.get('/chart-of-accounts'),
      ]);
      setAssets(schedR.status === 'fulfilled' ? (schedR.value.data?.assets || []) : []);
      setAccounts(acctsR.status === 'fulfilled' ? (acctsR.value.data || []) : []);
    } catch { toast.error('Failed to load depreciation schedule'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addAsset = async () => {
    if (!form.name || !form.purchase_date || !form.cost) { toast.error('Name, purchase date and cost are required'); return; }
    setSaving(true);
    try {
      await api.post('/depreciation/asset', {
        ...form, cost: Number(form.cost), salvage_value: Number(form.salvage_value),
        useful_life_years: Number(form.useful_life_years),
      });
      toast.success('Fixed asset added');
      setShowAdd(false);
      setForm({ name: '', purchase_date: '', cost: '', salvage_value: '0', useful_life_years: '5', method: 'straight_line', asset_account_id: '', depreciation_account_id: '' });
      await load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to add asset'); }
    finally { setSaving(false); }
  };

  const runDep = async () => {
    setRunning(true);
    try {
      const form = new FormData();
      form.append('period_end', runPeriod);
      const { data: res } = await api.post('/depreciation/run', form);
      toast.success(`Depreciation posted for ${res.posted} asset(s)`);
      await load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to run depreciation'); }
    finally { setRunning(false); }
  };

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalAccumDep = assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  const totalBookValue = assets.reduce((s, a) => s + a.book_value, 0);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <TrendingDown className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Depreciation Schedule</h1>
                <p className="text-sm text-blue-100 mt-1">Fixed assets register with straight-line, declining balance and WDV methods.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowAdd(true)} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Plus className="h-4 w-4 mr-2" />Add Asset</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Cost', value: fmtC(totalCost), color: isDark ? 'text-slate-100' : 'text-slate-900' },
            { label: 'Accumulated Dep', value: fmtC(totalAccumDep), color: 'text-amber-600' },
            { label: 'Net Book Value', value: fmtC(totalBookValue), color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl p-4 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
              <p className={`text-xl font-bold mt-1 font-mono ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Run Depreciation */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Run Depreciation — Period End Date</p>
            <Input type="date" value={runPeriod} onChange={e => setRunPeriod(e.target.value)} className="h-9 w-44" />
          </div>
          <Button onClick={runDep} disabled={running || !runPeriod} className="h-9 rounded-xl px-5" style={{ background: COLORS.emeraldGreen }}>
            {running ? <MiniLoader height={16} /> : <><Play className="h-4 w-4 mr-2" />Post Depreciation</>}
          </Button>
          <p className={`text-xs self-end pb-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Automatically posts journal entries for all active assets. Idempotent — safe to re-run.</p>
        </div>

        {/* Asset List */}
        {loading ? <ContentLoader /> : (
          <div className="space-y-3">
            {assets.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center text-sm border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                No fixed assets found. Click "Add Asset" to register one.
              </div>
            ) : assets.map(a => <AssetCard key={a.id} asset={a} isDark={isDark} />)}
          </div>
        )}
      </div>

      {/* Add Asset Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Fixed Asset</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label className="text-xs">Asset Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Office Laptop" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Purchase Date *</Label><Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Cost (₹) *</Label><Input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Salvage Value (₹)</Label><Input type="number" value={form.salvage_value} onChange={e => setForm(f => ({ ...f, salvage_value: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Useful Life (years)</Label><Input type="number" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Depreciation Method</Label>
              <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Straight Line (SLM)</SelectItem>
                  <SelectItem value="declining_balance">Declining Balance</SelectItem>
                  <SelectItem value="wdv">Written Down Value (WDV)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Asset COA Account</Label>
                <Select value={form.asset_account_id} onValueChange={v => setForm(f => ({ ...f, asset_account_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts.filter(a => a.sub_type === 'fixed_asset').map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Depreciation Expense Account</Label>
                <Select value={form.depreciation_account_id} onValueChange={v => setForm(f => ({ ...f, depreciation_account_id: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{accounts.filter(a => a.type === 'expense').map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={addAsset} disabled={saving} className="w-full rounded-xl" style={{ background: COLORS.mediumBlue }}>
              {saving ? <MiniLoader height={16} /> : 'Add Fixed Asset'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DepreciationSchedule() {
  return (
    <RequestAccessGate module="depreciation" moduleLabel="Depreciation Schedule" permissionFlag="can_view_accounting_reports">
      <DepreciationScheduleInner />
    </RequestAccessGate>
  );
}
