import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Shield, Plus, RefreshCw, Download } from 'lucide-react';
import { ContentLoader, MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

const TDS_SECTIONS = [
  '192 — Salary', '194A — Interest', '194B — Lottery', '194C — Contractors',
  '194D — Insurance', '194G — Commission', '194H — Commission', '194I — Rent',
  '194J — Professional/Technical', '194K — Dividends', '194LA — Compensation',
  '194M — Payment to Contractor', '194N — Cash Withdrawal', '194O — E-commerce',
  '194Q — Purchase of Goods', '206C(1) — TCS on Alcohol', '206C(1H) — TCS on Goods',
  '1%TCS — E-commerce Operator',
];

function TDSTCSReportInner() {
  const isDark = useDark();
  const curYear = new Date().getFullYear();
  const fy = new Date().getMonth() >= 3 ? `${curYear}-${String(curYear + 1).slice(2)}` : `${curYear - 1}-${String(curYear).slice(2)}`;
  const fyOptions = Array.from({ length: 5 }, (_, i) => { const y = curYear - i; return `${y}-${String(y + 1).slice(2)}`; });

  const [selectedFy, setSelectedFy] = useState(fy);
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    party_name: '', party_pan: '', section: '194J — Professional/Technical',
    base_amount: '', tds_rate: '10', tds_amount: '', payment_type: 'tds', status: 'deducted', challan_no: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = { fy: selectedFy };
      if (filterType !== 'all') params.payment_type = filterType;
      const { data: res } = await api.get('/tds-tcs', { params });
      setData(res);
    } catch { toast.error('Failed to load TDS/TCS data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [selectedFy, filterType]);

  const autoCalcTDS = (base, rate) => {
    const amt = (Number(base) * Number(rate)) / 100;
    setForm(f => ({ ...f, tds_amount: isNaN(amt) ? '' : amt.toFixed(2) }));
  };

  const submit = async () => {
    if (!form.party_name || !form.base_amount || !form.tds_amount) { toast.error('Party, base amount and TDS amount are required'); return; }
    setSaving(true);
    try {
      await api.post('/tds-tcs/entry', {
        ...form,
        base_amount: Number(form.base_amount),
        tds_rate: Number(form.tds_rate),
        tds_amount: Number(form.tds_amount),
      });
      toast.success('TDS/TCS entry recorded and journal posted');
      setShowAdd(false);
      setForm({ entry_date: new Date().toISOString().slice(0, 10), party_name: '', party_pan: '', section: '194J — Professional/Technical', base_amount: '', tds_rate: '10', tds_amount: '', payment_type: 'tds', status: 'deducted', challan_no: '' });
      await load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record entry'); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    if (!data) return;
    const rows = [['Date', 'Party', 'PAN', 'Section', 'Base Amount', 'Rate %', 'TDS Amount', 'Type', 'Status', 'Challan']];
    for (const e of data.entries || []) {
      rows.push([e.entry_date, e.party_name, e.party_pan, e.section, e.base_amount, e.tds_rate, e.tds_amount, e.payment_type, e.status, e.challan_no]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tds-tcs-${selectedFy}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">TDS / TCS</h1>
                <p className="text-sm text-blue-100 mt-1">Track TDS deductions and TCS collections. Auto-posts journal entries.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowAdd(true)} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Plus className="h-4 w-4 mr-2" />Add Entry</Button>
              <Button onClick={exportCSV} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20" disabled={!data}><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Financial Year</p>
            <Select value={selectedFy} onValueChange={setSelectedFy}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{fyOptions.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Type</p>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="tds">TDS Only</SelectItem>
                <SelectItem value="tcs">TCS Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total TDS', value: fmtC(data.summary.tds_total), color: 'text-blue-600' },
              { label: 'Total TCS', value: fmtC(data.summary.tcs_total), color: 'text-purple-600' },
              { label: 'Deposited', value: fmtC(data.summary.deposited), color: 'text-emerald-600' },
              { label: 'Pending Deposit', value: fmtC(data.summary.pending_deposit), color: 'text-rose-600' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-4 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm`}>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
                <p className={`text-xl font-bold mt-1 font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? <ContentLoader /> : (
          <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Party</th>
                    <th className="px-4 py-3 text-left">PAN</th>
                    <th className="px-4 py-3 text-left">Section</th>
                    <th className="px-4 py-3 text-right">Base Amount</th>
                    <th className="px-4 py-3 text-right">Rate %</th>
                    <th className="px-4 py-3 text-right">TDS / TCS</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Challan</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.entries || []).length === 0 ? (
                    <tr><td colSpan={10} className={`px-4 py-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No entries for this period.</td></tr>
                  ) : (data?.entries || []).map((e, i) => (
                    <tr key={e.id || i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                      <td className="px-4 py-2.5 font-medium">{e.party_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{e.party_pan || '—'}</td>
                      <td className="px-4 py-2.5 text-xs">{e.section}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtC(e.base_amount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{e.tds_rate}%</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">{fmtC(e.tds_amount)}</td>
                      <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e.payment_type === 'tds' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{e.payment_type?.toUpperCase()}</span></td>
                      <td className="px-4 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e.status === 'deposited' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{e.status}</span></td>
                      <td className="px-4 py-2.5 font-mono text-xs">{e.challan_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Record TDS / TCS Entry</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date *</Label><Input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Type</Label>
                <Select value={form.payment_type} onValueChange={v => setForm(f => ({ ...f, payment_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="tds">TDS</SelectItem><SelectItem value="tcs">TCS</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Party Name *</Label><Input value={form.party_name} onChange={e => setForm(f => ({ ...f, party_name: e.target.value }))} placeholder="Vendor / Customer name" className="mt-1" /></div>
              <div><Label className="text-xs">Party PAN</Label><Input value={form.party_pan} onChange={e => setForm(f => ({ ...f, party_pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Section</Label>
              <Select value={form.section} onValueChange={v => setForm(f => ({ ...f, section: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TDS_SECTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Base Amount (₹) *</Label>
                <Input type="number" value={form.base_amount} onChange={e => { setForm(f => ({ ...f, base_amount: e.target.value })); autoCalcTDS(e.target.value, form.tds_rate); }} className="mt-1" /></div>
              <div><Label className="text-xs">Rate (%)</Label>
                <Input type="number" value={form.tds_rate} onChange={e => { setForm(f => ({ ...f, tds_rate: e.target.value })); autoCalcTDS(form.base_amount, e.target.value); }} className="mt-1" /></div>
              <div><Label className="text-xs">TDS Amount (₹) *</Label>
                <Input type="number" value={form.tds_amount} onChange={e => setForm(f => ({ ...f, tds_amount: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="deducted">Deducted</SelectItem><SelectItem value="deposited">Deposited</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Challan No</Label><Input value={form.challan_no} onChange={e => setForm(f => ({ ...f, challan_no: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            </div>
            <Button onClick={submit} disabled={saving} className="w-full rounded-xl" style={{ background: COLORS.mediumBlue }}>
              {saving ? <MiniLoader height={16} /> : 'Record Entry & Post Journal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TDSTCSReport() {
  return (
    <RequestAccessGate module="tds_tcs" moduleLabel="TDS / TCS" permissionFlag="can_view_accounting_reports">
      <TDSTCSReportInner />
    </RequestAccessGate>
  );
}
