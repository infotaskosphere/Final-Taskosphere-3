import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { ShieldCheck, RefreshCw, Download } from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };
const fmtDate = (v) => { try { return format(parseISO(v), 'dd MMM yyyy HH:mm'); } catch { return v || '—'; } };

const ACTION_COLORS = {
  set_opening_balances: 'bg-blue-100 text-blue-700',
  upload_bank_statement: 'bg-purple-100 text-purple-700',
  match_reconciliation: 'bg-emerald-100 text-emerald-700',
  add_fixed_asset: 'bg-amber-100 text-amber-700',
  run_depreciation: 'bg-orange-100 text-orange-700',
  default: 'bg-slate-100 text-slate-700',
};

function AuditTrailInner() {
  const isDark = useDark();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [entity, setEntity] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ rows: [], total: 0 });

  const PAGE_SIZE = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, page_size: PAGE_SIZE };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (entity !== 'all') params.entity = entity;
      const { data: res } = await api.get('/audit-trail', { params });
      setData(res);
      setPage(p);
    } catch { toast.error('Failed to load audit trail'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, []);

  const exportCSV = () => {
    const rows = [['Timestamp', 'Action', 'Entity', 'Entity ID', 'User ID']];
    for (const r of data.rows || []) {
      rows.push([r.created_at, r.action, r.entity, r.entity_id, r.user_id]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-trail.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Accounting Audit Trail</h1>
                <p className="text-sm text-blue-100 mt-1">Complete immutable log of all accounting actions and changes.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportCSV} disabled={!data.rows.length} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><Download className="h-4 w-4 mr-2" />CSV</Button>
              <Button onClick={() => load(1)} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 flex flex-wrap gap-3 items-end border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>From</p>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>To</p>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-38" />
          </div>
          <div>
            <p className={`text-xs mb-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Entity</p>
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="opening_balances">Opening Balances</SelectItem>
                <SelectItem value="bank_reconciliation">Bank Reconciliation</SelectItem>
                <SelectItem value="fixed_assets">Fixed Assets</SelectItem>
                <SelectItem value="depreciation">Depreciation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => load(1)} disabled={loading} className="h-9 rounded-xl px-5" style={{ background: COLORS.mediumBlue }}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
        </div>

        <div className={`rounded-2xl p-3 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} shadow-sm text-sm`}>
          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Total entries: </span>
          <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{data.total.toLocaleString()}</span>
        </div>

        {loading ? <ContentLoader /> : (
          <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400 bg-slate-700/40' : 'text-slate-500 bg-slate-50'}`}>
                    <th className="px-4 py-3 text-left">Timestamp</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">Entity</th>
                    <th className="px-4 py-3 text-left">Entity ID</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={6} className={`px-4 py-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>No audit entries for the selected filter.</td></tr>
                  ) : data.rows.map((r, i) => (
                    <tr key={r.id || i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/30 text-slate-200' : 'border-slate-100 hover:bg-slate-50 text-slate-800'} transition-colors`}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ACTION_COLORS[r.action] || ACTION_COLORS.default}`}>{r.action?.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium">{r.entity}</td>
                      <td className="px-4 py-2.5 font-mono text-xs truncate max-w-32">{(r.entity_id || '').slice(0, 12)}{r.entity_id?.length > 12 ? '…' : ''}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{(r.user_id || '').slice(0, 8)}…</td>
                      <td className="px-4 py-2.5 text-xs max-w-xs truncate">{r.payload ? JSON.stringify(r.payload).slice(0, 80) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className={`px-4 py-3 border-t flex items-center justify-between text-sm ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => load(page - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => load(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuditTrail() {
  return (
    <RequestAccessGate module="audit_trail" moduleLabel="Accounting Audit Trail" permissionFlag="can_view_accounting_reports">
      <AuditTrailInner />
    </RequestAccessGate>
  );
}
