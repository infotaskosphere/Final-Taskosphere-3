import React, { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import {
  ScanLine, UploadCloud, RefreshCw, CheckCircle2, AlertTriangle,
  Sparkles, FileText, Settings2, Plus,
} from 'lucide-react';
import { ContentLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import RequestAccessGate from '@/components/RequestAccessGate.jsx';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };
const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function StatusBadge({ status }) {
  const map = {
    posted:       { variant: 'default',     label: 'Posted',        className: 'bg-emerald-600 hover:bg-emerald-600' },
    needs_review: { variant: 'destructive', label: 'Needs Review',  className: '' },
    extracted:    { variant: 'secondary',   label: 'Extracted',     className: '' },
  };
  const cfg = map[status] || { variant: 'outline', label: status };
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
}

function ZeroTouchEntryInner() {
  const isDark = useDark();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState([]);
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ match: '', account_code: '', label: '' });

  const fetchDocs = async () => {
    try {
      const { data } = await api.get('/zte/documents');
      setDocs(data || []);
    } catch {
      toast.error('Failed to load processed documents');
    }
  };

  const fetchRules = async () => {
    try {
      const { data } = await api.get('/zte/category-rules');
      setRules(data || []);
    } catch {
      // non-fatal
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.allSettled([fetchDocs(), fetchRules()]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('company_id', '');
      form.append('auto_post', 'true');
      const { data } = await api.post('/zte/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.status === 'posted') {
        toast.success(`Extracted & posted — Journal entry ${data.journal_entry_id?.slice(0, 8)}…`);
      } else if (data.status === 'needs_review') {
        toast.warning(`Extracted but needs review: ${data.posting_error}`);
      } else {
        toast.info('Document extracted.');
      }
      await fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Extraction failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const retryPosting = async (docId) => {
    try {
      await api.post(`/zte/documents/${docId}/retry-posting`);
      toast.success('Posted to ledger.');
      await fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not post — check extracted data.');
    }
  };

  const addRule = async () => {
    if (!newRule.match.trim() || !newRule.account_code.trim()) {
      toast.error('Vendor pattern and account code are required.');
      return;
    }
    try {
      await api.post('/zte/category-rules', { company_id: '', ...newRule });
      toast.success('Category rule saved.');
      setNewRule({ match: '', account_code: '', label: '' });
      await fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save rule');
    }
  };

  if (loading) return <ContentLoader />;

  const posted = docs.filter(d => d.status === 'posted').length;
  const review = docs.filter(d => d.status === 'needs_review').length;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <ScanLine className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">AI Accounting · Module 1</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Zero-Touch Entry Engine</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">Upload an invoice or receipt — an AI reads it, classifies it, and posts a balanced journal entry automatically.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-white text-blue-900 hover:bg-blue-50">
                {uploading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
                {uploading ? 'Reading document…' : 'Upload Invoice / Receipt'}
              </Button>
              <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Documents Processed', value: docs.length, icon: FileText, color: COLORS.mediumBlue },
            { label: 'Auto-Posted', value: posted, icon: CheckCircle2, color: COLORS.emeraldGreen },
            { label: 'Needs Review', value: review, icon: AlertTriangle, color: COLORS.amber },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-4 flex items-center gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}20` }}>
                <s.icon className="h-5 w-5" style={{ color: s.color }} />
              </div>
              <div>
                <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
                <p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="documents">
          <TabsList>
            <TabsTrigger value="documents">Processed Documents</TabsTrigger>
            <TabsTrigger value="rules">Vendor Categorisation Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-4">
            <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              {docs.length === 0 ? (
                <div className="p-10 text-center">
                  <Sparkles className={`h-8 w-8 mx-auto mb-2 ${isDark ? 'text-slate-500' : 'text-slate-300'}`} />
                  <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>No documents processed yet — upload an invoice or receipt to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Vendor / Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docs.map((d) => {
                      const ex = d.extracted || {};
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="max-w-[160px] truncate">{d.filename}</TableCell>
                          <TableCell>{ex.vendor_or_customer_name || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{ex.document_type || '—'}</Badge>
                          </TableCell>
                          <TableCell>{ex.invoice_number || '—'}</TableCell>
                          <TableCell>{ex.invoice_date || '—'}</TableCell>
                          <TableCell className="text-right font-mono">{fmtC(ex.total_invoice_value)}</TableCell>
                          <TableCell><StatusBadge status={d.status} /></TableCell>
                          <TableCell>
                            {d.status === 'needs_review' && (
                              <Button size="sm" variant="outline" onClick={() => retryPosting(d.id)}>Retry Post</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-4">
            <div className={`rounded-3xl border shadow-sm p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`font-bold mb-3 flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                <Settings2 className="h-4 w-4" /> Add Vendor → Ledger Rule
              </h3>
              <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                When a PURCHASE invoice's vendor name matches this pattern (regex, case-insensitive), the expense auto-posts to the given Chart of Accounts code instead of the generic "Purchases" account.
              </p>
              <div className="grid md:grid-cols-4 gap-2">
                <Input placeholder="Vendor pattern e.g. amazon web services|aws" value={newRule.match}
                  onChange={(e) => setNewRule({ ...newRule, match: e.target.value })} />
                <Input placeholder="Account code e.g. 5300" value={newRule.account_code}
                  onChange={(e) => setNewRule({ ...newRule, account_code: e.target.value })} />
                <Input placeholder="Label e.g. Software & Cloud Expenses" value={newRule.label}
                  onChange={(e) => setNewRule({ ...newRule, label: e.target.value })} />
                <Button onClick={addRule}><Plus className="h-4 w-4 mr-1" /> Add Rule</Button>
              </div>
            </div>

            <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor Pattern</TableHead>
                    <TableHead>Account Code</TableHead>
                    <TableHead>Label</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r, i) => (
                    <TableRow key={r.id || i}>
                      <TableCell className="font-mono text-xs">{r.match}</TableCell>
                      <TableCell>{r.account_code}</TableCell>
                      <TableCell>{r.label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ZeroTouchEntry() {
  return (
    <RequestAccessGate module="post_journal_entries" moduleLabel="Zero-Touch Entry Engine" permissionFlag="can_post_journal_entries">
      <ZeroTouchEntryInner />
    </RequestAccessGate>
  );
}

export default ZeroTouchEntry;
