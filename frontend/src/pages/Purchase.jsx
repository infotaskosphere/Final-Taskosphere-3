import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  UploadCloud, Search, RefreshCw, Building2, FileText, IndianRupee,
  CheckCircle2, AlertTriangle, ShoppingBag, X, Database,
} from 'lucide-react';
import GifLoader, { MiniLoader } from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import { GuidanceNote } from '@/components/ui/GuidanceNote.jsx';

const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber: '#F59E0B',
  coral: '#FF6B6B',
};

const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDate = (value) => {
  if (!value) return '—';
  try { return format(parseISO(value), 'dd MMM yyyy'); }
  catch { return value; }
};

function Purchase() {
  const isDark = useDark();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('auto');
  const [selectedCompanyId, setSelectedCompanyId] = useState('none');
  const [file, setFile] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [purchasesR, clientsR, companiesR] = await Promise.allSettled([
        api.get('/purchase-invoices', { params: { page_size: 500 } }),
        api.get('/clients', { params: { page_size: 1000 } }),
        api.get('/companies/list'),
      ]);
      setPurchaseInvoices(purchasesR.status === 'fulfilled' ? (purchasesR.value.data?.purchase_invoices || []) : []);
      setClients(clientsR.status === 'fulfilled' ? (clientsR.value.data?.clients || clientsR.value.data || []) : []);
      setCompanies(companiesR.status === 'fulfilled' ? (companiesR.value.data || []) : []);
    } catch {
      toast.error('Failed to load purchase data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchaseInvoices;
    return purchaseInvoices.filter(inv =>
      (inv.client_name || '').toLowerCase().includes(q) ||
      (inv.supplier_name || '').toLowerCase().includes(q) ||
      (inv.invoice_no || '').toLowerCase().includes(q) ||
      (inv.supplier_gstin || '').toLowerCase().includes(q)
    );
  }, [purchaseInvoices, search]);

  const stats = useMemo(() => {
    const total = purchaseInvoices.reduce((s, inv) => s + Number(inv.grand_total || 0), 0);
    const linked = purchaseInvoices.filter(inv => inv.client_id).length;
    const suppliers = new Set(purchaseInvoices.map(inv => inv.supplier_name).filter(Boolean)).size;
    const reviewCount = purchaseInvoices.filter(inv => !inv.client_id || inv.needs_amount_review).length;
    return { total, linked, suppliers, count: purchaseInvoices.length, unmatched: reviewCount };
  }, [purchaseInvoices]);

  const handleUpload = async () => {
    if (!file) { toast.error('Select an invoice first'); return; }
    const form = new FormData();
    form.append('file', file);
    if (selectedClientId !== 'auto') form.append('client_id', selectedClientId);
    if (selectedCompanyId !== 'none') form.append('company_id', selectedCompanyId);

    setUploading(true);
    try {
      const { data } = await api.post('/purchase-invoices/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.duplicate) toast.info('Invoice already exists. Showing saved entry.');
      else toast.success(data?.matched_client ? `Invoice linked to ${data.matched_client.company_name}` : 'Invoice saved. No client match found.');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to read invoice');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <GifLoader />;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <ShoppingBag className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Accounts</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Purchase</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">
                  Upload supplier invoices. The app reads invoice details, matches the concerned client/company, and lists the purchase under that client.
                </p>
              </div>
            </div>
            <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </div>

        <GuidanceNote pageKey="purchase" isDark={isDark} />

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: 'Purchase Invoices', value: stats.count, icon: FileText, color: COLORS.mediumBlue },
            { label: 'Total Purchase', value: fmtC(stats.total), icon: IndianRupee, color: COLORS.emeraldGreen },
            { label: 'Linked Companies', value: stats.linked, icon: CheckCircle2, color: COLORS.deepBlue },
            { label: 'Needs Review', value: stats.unmatched, icon: AlertTriangle, color: stats.unmatched ? COLORS.amber : COLORS.emeraldGreen },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl border p-4 shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.value}</p>
                </div>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: s.color }}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[420px_1fr] gap-5">
          <div className={`rounded-3xl border shadow-sm p-5 h-fit ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white" style={{ background: COLORS.mediumBlue }}>
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Upload purchase invoice</h2>
                <p className="text-xs text-slate-400">PDF and image invoices are supported.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Concerned company</label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className={`mt-2 rounded-xl ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50'}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect from invoice</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Sales company/book</label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className={`mt-2 rounded-xl ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50'}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className={`border-2 border-dashed rounded-2xl p-5 text-center ${isDark ? 'border-slate-700 bg-slate-900/60' : 'border-blue-100 bg-blue-50/60'}`}>
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                <UploadCloud className="h-9 w-9 mx-auto mb-3" style={{ color: COLORS.mediumBlue }} />
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{file ? file.name : 'Choose invoice file'}</p>
                {file && <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>}
                <div className="mt-4 flex justify-center gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl">
                    Browse
                  </Button>
                  {file && (
                    <Button type="button" variant="ghost" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="rounded-xl">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <Button onClick={handleUpload} disabled={uploading || !file} className="w-full rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                {uploading ? <MiniLoader height={18} /> : <><Database className="h-4 w-4 mr-2" /> Read & Add to Company</>}
              </Button>
            </div>
          </div>

          <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              <div>
                <h2 className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Purchase invoice list</h2>
                <p className="text-xs text-slate-400">{filtered.length} invoices shown · {stats.suppliers} suppliers</p>
              </div>
              <div className={`flex items-center gap-2 rounded-xl border px-3 h-10 min-w-[260px] ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Search className="h-4 w-4 text-slate-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, company, GSTIN..." className="border-0 bg-transparent h-9 px-0 focus-visible:ring-0" />
              </div>
            </div>

            <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              {filtered.length === 0 ? (
                <div className="py-20 text-center">
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-semibold text-slate-400">No purchase invoices found</p>
                  <p className="text-xs text-slate-400 mt-1">Upload an invoice to start the purchase list.</p>
                </div>
              ) : filtered.map(inv => (
                <div key={inv.id} className={`p-4 transition ${isDark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{inv.invoice_no || 'No invoice no.'}</p>
                        {inv.client_id ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Linked</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Review</span>
                        )}
                        {inv.needs_amount_review && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200" title="The totals read from this invoice didn't reconcile — please verify the amount against the file.">
                            Verify amount
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-1 truncate">
                        {inv.supplier_name || 'Unknown supplier'} {inv.supplier_gstin ? `· ${inv.supplier_gstin}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> {inv.client_name || inv.buyer_name || 'No concerned company matched'} · {fmtDate(inv.invoice_date)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fmtC(inv.grand_total)}</p>
                      <p className="text-xs text-slate-400">GST {fmtC(inv.total_gst)}</p>
                      <p className="text-[10px] text-slate-400 mt-1 truncate max-w-[180px]">{inv.file_name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Purchase;
