import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, RefreshCw, Download, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { ContentLoader, MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B' };

const SAMPLE_JSON = JSON.stringify([
  {
    "date": "2024-06-01",
    "narration": "Invoice payment from Acme Corp",
    "source": "manual",
    "idempotency_key": "INV-001-pay",
    "lines": [
      { "account_id": "<bank_account_id>", "debit": 50000, "credit": 0 },
      { "account_id": "<accounts_receivable_id>", "debit": 0, "credit": 50000 }
    ]
  },
  {
    "date": "2024-06-02",
    "narration": "Office rent payment",
    "source": "manual",
    "lines": [
      { "account_id": "<rent_expense_id>", "debit": 25000, "credit": 0 },
      { "account_id": "<bank_account_id>", "debit": 0, "credit": 25000 }
    ]
  }
], null, 2);

const STATUS_UI = {
  pending:    { color: 'text-amber-600', bg: 'bg-amber-50 text-amber-700', icon: Clock },
  processing: { color: 'text-blue-600',  bg: 'bg-blue-50 text-blue-700',   icon: Clock },
  completed:  { color: 'text-emerald-600', bg: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  partial:    { color: 'text-orange-600',  bg: 'bg-orange-50 text-orange-700',   icon: AlertCircle },
  failed:     { color: 'text-rose-600',    bg: 'bg-rose-50 text-rose-700',       icon: XCircle },
};

function JobRow({ job, isDark }) {
  const s = STATUS_UI[job.status] || STATUS_UI.pending;
  const Icon = s.icon;
  return (
    <div className={`rounded-xl px-4 py-3 border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${s.color}`} />
          <span className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{job.job_id.slice(0, 16)}…</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.bg}`}>{job.status}</span>
        </div>
        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {job.processed} / {job.total} entries
          {job.failed_count > 0 && <span className="text-rose-500 ml-2">· {job.failed_count} failed</span>}
        </div>
      </div>
      {job.errors?.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {job.errors.slice(0, 5).map((e, i) => (
            <li key={i} className="text-xs text-rose-600">• {e}</li>
          ))}
          {job.errors.length > 5 && <li className="text-xs text-slate-400">…and {job.errors.length - 5} more errors</li>}
        </ul>
      )}
    </div>
  );
}

function BulkImportInner() {
  const isDark = useDark();
  const [jsonText, setJsonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [polling, setPolling] = useState(null);
  const pollRef = useRef(null);

  const pollJob = async (jobId) => {
    try {
      const { data: res } = await api.get(`/bulk-import/status/${jobId}`);
      setJobs(prev => prev.map(j => j.job_id === jobId ? res : j));
      if (res.status === 'processing' || res.status === 'pending') {
        pollRef.current = setTimeout(() => pollJob(jobId), 2000);
      }
    } catch {}
  };

  const handleSubmit = async () => {
    let entries;
    try { entries = JSON.parse(jsonText); } catch { toast.error('Invalid JSON — check the format'); return; }
    if (!Array.isArray(entries) || entries.length === 0) { toast.error('JSON must be a non-empty array of journal entries'); return; }
    setSubmitting(true);
    try {
      const { data: res } = await api.post('/bulk-import/journals', { entries });
      toast.success(`Job queued: ${res.job_id.slice(0, 12)}… — ${res.total} entries`);
      const newJob = { job_id: res.job_id, status: 'pending', processed: 0, total: res.total, failed_count: 0, errors: [] };
      setJobs(prev => [newJob, ...prev]);
      setJsonText('');
      setTimeout(() => pollJob(res.job_id), 1500);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to submit import job'); }
    finally { setSubmitting(false); }
  };

  const loadSample = () => setJsonText(SAMPLE_JSON);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <Upload className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Bulk Journal Import</h1>
                <p className="text-sm text-blue-100 mt-1">Import hundreds of journal entries in one shot via JSON. Processed asynchronously with ACID guarantees.</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="import">
          <TabsList className="rounded-xl">
            <TabsTrigger value="import" className="rounded-lg">Import</TabsTrigger>
            <TabsTrigger value="jobs" className="rounded-lg">Job History {jobs.length > 0 && `(${jobs.length})`}</TabsTrigger>
            <TabsTrigger value="format" className="rounded-lg">Format Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-4 space-y-4">
            <div className={`rounded-2xl border shadow-sm p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Paste JSON Array of Journal Entries</p>
                <Button onClick={loadSample} size="sm" variant="outline" className="text-xs rounded-lg">Load Sample</Button>
              </div>
              <Textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                placeholder={`[\n  {\n    "date": "2024-06-01",\n    "narration": "...",\n    "lines": [ ... ]\n  }\n]`}
                className="font-mono text-xs min-h-72 resize-y"
              />
              <div className="flex items-center justify-between mt-3">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  {jsonText ? (() => { try { const a = JSON.parse(jsonText); return Array.isArray(a) ? `${a.length} entries ready` : 'Invalid format'; } catch { return 'Invalid JSON'; } })() : 'Awaiting JSON…'}
                </span>
                <Button onClick={handleSubmit} disabled={submitting || !jsonText.trim()} className="rounded-xl px-6" style={{ background: COLORS.mediumBlue }}>
                  {submitting ? <MiniLoader height={16} /> : <><Upload className="h-4 w-4 mr-2" />Submit Import Job</>}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="jobs" className="mt-4 space-y-3">
            {jobs.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center text-sm border ${isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-400 border-slate-200'}`}>
                No import jobs yet. Submit a JSON payload to start.
              </div>
            ) : jobs.map(j => <JobRow key={j.job_id} job={j} isDark={isDark} />)}
          </TabsContent>

          <TabsContent value="format" className="mt-4">
            <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="p-5 space-y-4">
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>JSON Format Reference</p>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  The payload must be a JSON array. Each element is a journal entry:
                </p>
                <div className="space-y-3">
                  {[
                    { field: 'date', type: 'string (YYYY-MM-DD)', required: true, notes: 'Transaction date' },
                    { field: 'narration', type: 'string', required: false, notes: 'Description / memo' },
                    { field: 'source', type: 'string', required: false, notes: 'e.g. "manual", "import", "invoice"' },
                    { field: 'idempotency_key', type: 'string', required: false, notes: 'If provided, duplicate keys are skipped (safe to re-run)' },
                    { field: 'lines', type: 'array', required: true, notes: 'Minimum 2 lines. Must balance (sum of debits = sum of credits)' },
                    { field: 'lines[].account_id', type: 'string (MongoDB ObjectId)', required: true, notes: 'COA account _id' },
                    { field: 'lines[].debit', type: 'number', required: true, notes: 'Amount in debit column (0 if credit side)' },
                    { field: 'lines[].credit', type: 'number', required: true, notes: 'Amount in credit column (0 if debit side)' },
                    { field: 'lines[].description', type: 'string', required: false, notes: 'Optional line-level memo' },
                  ].map(r => (
                    <div key={r.field} className={`flex gap-3 pb-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <code className={`text-xs font-mono px-2 py-0.5 rounded ${isDark ? 'bg-slate-700 text-blue-300' : 'bg-slate-100 text-blue-700'} shrink-0 h-fit mt-0.5`}>{r.field}</code>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{r.type}</span>
                          {r.required && <span className="text-xs px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-semibold">required</span>}
                        </div>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.notes}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <Button onClick={loadSample} size="sm" variant="outline" className="text-xs rounded-lg" onClick={() => { loadSample(); document.querySelector('[data-value="import"]')?.click(); }}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Load Sample JSON
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function BulkImport() {
  return (
    <RequestAccessGate module="bulk_import" moduleLabel="Bulk Journal Import" permissionFlag="can_manage_chart_of_accounts">
      <BulkImportInner />
    </RequestAccessGate>
  );
}
