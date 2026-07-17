import React, { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, RefreshCw, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v || '—'; } };

const SOURCE_LABELS = { sale: 'Sale', purchase: 'Purchase', bank: 'Bank', manual: 'Manual', ai_zero_touch: 'AI', opening_balance: 'Opening', depreciation: 'Depreciation', tds_tcs: 'TDS/TCS', bulk_import: 'Bulk Import' };
const SOURCE_COLORS = { sale: 'bg-emerald-100 text-emerald-700', purchase: 'bg-blue-100 text-blue-700', bank: 'bg-purple-100 text-purple-700', manual: 'bg-slate-100 text-slate-700', ai_zero_touch: 'bg-amber-100 text-amber-700', default: 'bg-slate-100 text-slate-600' };

function SourceBadge({ source }) {
  const cls = SOURCE_COLORS[source] || SOURCE_COLORS.default;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{SOURCE_LABELS[source] || source}</span>;
}

function EntryRow({ entry, isDark }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors ${isDark ? 'hover:bg-slate-700/50' : ''}`}
      >
        {open ? <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={entry.source} />
            {entry.ref_no && <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{entry.ref_no}</span>}
          </div>
          <p className={`text-sm mt-0.5 truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{entry.narration || '—'}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(entry.total_debit)}</p>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dr</p>
        </div>
      </button>
      {open && (
        <div className={`px-10 pb-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50/50'}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                <th className="text-left py-1 font-medium">Account</th>
                <th className="text-right py-1 font-medium">Debit</th>
                <th className="text-right py-1 font-medium">Credit</th>
                <th className="text-left py-1 font-medium">Memo</th>
              </tr>
            </thead>
            <tbody>
              {(entry.lines || []).map((l, i) => (
                <tr key={i} className={`border-t ${isDark ? 'border-slate-700 text-slate-200' : 'border-slate-100 text-slate-700'}`}>
                  <td className="py-1">{l.account_name || l.account_id}</td>
                  <td className="py-1 text-right font-mono">{l.debit ? fmtC(l.debit) : '—'}</td>
                  <td className="py-1 text-right font-mono">{l.credit ? fmtC(l.credit) : '—'}</td>
                  <td className="py-1 text-slate-400">{l.memo || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DayBookInner() {
  const isDark = useDark();
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { from_date: fromDate, to_date: toDate };
      if (source !== 'all') params.source = source;
      const { data: res } = await api.get('/reports/day-book', { params });
      setData(res);
    } catch {
      toast.error('Failed to load Day Book');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => ({
    totalDr: data?.total_debit || 0,
    totalCr: data?.total_credit || 0,
    days: (data?.days || []).length,
    entries: (data?.days || []).reduce((s, d) => s + d.entries.length, 0),
  }), [data]);

  const exportCSV = () => {
    const rows = [['Date', 'Narration', 'Source', 'Ref No', 'Debit', 'Credit']];
    for (const day of data?.days || []) {
      for (const e of day.entries) {
        rows.push([day.date, e.narration, e.source, e.ref_no, e.total_debit, e.total_credit]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `day-book-${fromDate}-to-${toDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Day Book</h1>
                <p className="text-sm text-blue-100 mt-1">All transactions posted in the selected date range, grouped by day.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20" disabled={!data}><Download className="h-4 w-4 mr-2" /> CSV</Button>
              <Button onClick={load} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} shadow-sm`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>From Date</p>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>To Date</p>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Source</p>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_zero_touch">AI Zero-Touch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Days', value: summary.days, fmt: n => n },
            { label: 'Entries', value: summary.entries, fmt: n => n },
            { label: 'Total Debit', value: summary.totalDr, fmt: fmtC },
            { label: 'Total Credit', value: summary.totalCr, fmt: fmtC },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl p-4 ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'} shadow-sm`}>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.fmt(s.value)}</p>
            </div>
          ))}
        </div>

        {/* Day-wise entries */}
        {loading ? <ContentLoader /> : (
          <div className="space-y-4">
            {(data?.days || []).length === 0 ? (
              <div className={`rounded-2xl p-10 text-center ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-400'} border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                No transactions found for the selected period.
              </div>
            ) : (data.days || []).map(day => (
              <div key={day.date} className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                  <div>
                    <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtDate(day.date)}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(day.day_debit)}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Dr</p>
                  </div>
                </div>
                {day.entries.map(e => <EntryRow key={e.id} entry={e} isDark={isDark} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DayBook() {
  return (
    <RequestAccessGate module="day_book" moduleLabel="Day Book" permissionFlag="can_view_accounting_reports">
      <DayBookInner />
    </RequestAccessGate>
  );
}
