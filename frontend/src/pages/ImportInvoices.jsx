import React, { useState, useRef, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, CheckCircle, AlertCircle, RefreshCw,
  Download, ChevronDown, ChevronUp, X, ArrowRight, Database,
  Users, Package, Receipt, CreditCard,
} from 'lucide-react';

// ── constants ──────────────────────────────────────────────────────────────
const COLORS = { blue: '#1F6FB2', green: '#1FAF5A', red: '#EF4444', amber: '#F59E0B', purple: '#7C3AED' };
const card   = 'rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm';

const FORMATS = [
  {
    ext: ['vyp', 'vyb'],
    label: 'KhataBook / Vyapar',
    icon: '📒',
    description: 'Export from KhataBook → Settings → Backup. Supports .vyp and .vyb files.',
    mime: '.vyp,.vyb',
  },
  {
    ext: ['xml', 'tbk'],
    label: 'Tally XML',
    icon: '🧮',
    description: 'Export from Tally → Gateway → Export Data → XML format.',
    mime: '.xml,.tbk',
  },
  {
    ext: ['xlsx', 'xls', 'csv'],
    label: 'Excel / CSV',
    icon: '📊',
    description: 'Any spreadsheet with columns: Client Name, Date, Description, Qty, Rate, GST%.',
    mime: '.xlsx,.xls,.csv',
  },
  {
    ext: ['json'],
    label: 'JSON Backup',
    icon: '📄',
    description: 'JSON export from Taskosphere or any compatible billing app.',
    mime: '.json',
  },
];

const fmt  = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);
const STEP = { IDLE: 'idle', PARSING: 'parsing', PREVIEW: 'preview', IMPORTING: 'importing', DONE: 'done' };

export default function ImportInvoices() {
  const dark = useDark();
  const { user } = useAuth();

  const [step,        setStep]       = useState(STEP.IDLE);
  const [dragOver,    setDragOver]   = useState(false);
  const [preview,     setPreview]    = useState(null);       // parsed result
  const [result,      setResult]     = useState(null);       // import result
  const [error,       setError]      = useState('');
  const [expanded,    setExpanded]   = useState({});         // table section toggles
  const [skipDups,    setSkipDups]   = useState(true);
  const fileRef = useRef(null);

  const companyId = user?.company_id || user?.id || '';

  // ── file handling ──────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setPreview(null);
    setResult(null);
    setStep(STEP.PARSING);

    const form = new FormData();
    form.append('file', file);

    try {
      const { data } = await api.post('/api/invoices/parse-backup', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      setPreview(data);
      setStep(STEP.PREVIEW);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to parse file';
      setError(msg);
      setStep(STEP.IDLE);
      toast.error(msg);
    }
  }, []);

  const onInputChange = e => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = e => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── import ─────────────────────────────────────────────────────────────
  const runImport = async () => {
    if (!preview) return;
    setStep(STEP.IMPORTING);
    try {
      const { data } = await api.post('/api/invoices/import-backup', {
        company_id:      companyId,
        source:          preview.source || 'import',
        invoices:        preview.invoices || [],
        clients:         preview.clients  || [],
        items:           preview.items    || [],
        payments:        preview.payments || [],
        skip_duplicates: skipDups,
      }, { timeout: 180_000 });
      setResult(data);
      setStep(STEP.DONE);
      toast.success(`Import complete — ${data.invoices_imported} invoices saved`);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Import failed';
      setError(msg);
      setStep(STEP.PREVIEW);
      toast.error(msg);
    }
  };

  const reset = () => {
    setStep(STEP.IDLE);
    setPreview(null);
    setResult(null);
    setError('');
    setExpanded({});
  };

  const toggleSection = key => setExpanded(p => ({ ...p, [key]: !p[key] }));

  // ── render helpers ──────────────────────────────────────────────────────
  const Stat = ({ icon: Icon, label, value, color }) => (
    <div className={`${card} p-4 flex items-center gap-3`}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: color + '18' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );

  const Section = ({ title, rows, columns, keyProp }) => {
    const open = expanded[title] !== false;
    if (!rows?.length) return null;
    return (
      <div className={card}>
        <button className="w-full flex items-center justify-between p-4"
                onClick={() => toggleSection(title)}>
          <span className="font-semibold text-sm text-gray-800 dark:text-white">
            {title} <span className="text-gray-400 font-normal">({rows.length})</span>
          </span>
          {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden">
              <div className="border-t border-gray-100 dark:border-gray-800 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide">
                      {columns.map(c => (
                        <th key={c.key} className={`px-4 py-2 text-${c.align || 'left'}`}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {rows.slice(0, 200).map((row, i) => (
                      <tr key={row[keyProp] || i}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        {columns.map(c => (
                          <td key={c.key} className={`px-4 py-2 text-${c.align || 'left'} text-gray-700 dark:text-gray-300`}>
                            {c.render ? c.render(row) : (row[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && (
                  <p className="text-center text-xs text-gray-400 py-2">
                    Showing first 200 of {rows.length} rows
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Database size={22} style={{ color: COLORS.blue }} /> Import Invoices
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Import historical invoices from KhataBook, Tally, Excel, or JSON
          </p>
        </div>
        {step !== STEP.IDLE && (
          <button onClick={reset}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={14} /> Start over
          </button>
        )}
      </div>

      {/* ── STEP: IDLE — drop zone + format guide ── */}
      {step === STEP.IDLE && (
        <div className="space-y-5">

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`
              relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all
              ${dragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'}
            `}
          >
            <input ref={fileRef} type="file" className="hidden"
                   accept=".vyp,.vyb,.xml,.tbk,.xlsx,.xls,.csv,.json"
                   onChange={onInputChange} />
            <Upload size={36} className="mx-auto mb-3"
                    style={{ color: dragOver ? COLORS.blue : '#94a3b8' }} />
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
              {dragOver ? 'Drop your file here' : 'Click or drag & drop your backup file'}
            </p>
            <p className="text-xs text-gray-400">
              Supports .vyp, .vyb, .xml, .tbk, .xlsx, .xls, .csv, .json
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                 style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.red }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* Supported formats */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Supported Formats</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FORMATS.map(f => (
                <div key={f.label} className={`${card} p-4 flex items-start gap-3`}>
                  <span className="text-2xl">{f.icon}</span>
                  <div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-white">{f.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                      {f.description}
                    </p>
                    <p className="text-xs font-mono text-gray-400 mt-1">{f.mime}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Excel template download hint */}
          <div className={`${card} p-4 flex items-center gap-3`}>
            <Download size={16} className="text-gray-400 flex-shrink-0" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong className="text-gray-700 dark:text-gray-200">Excel template columns:</strong>{' '}
              Client Name, Invoice Date, Due Date, Description, HSN/SAC, Quantity, Unit, Rate, GST Rate, GSTIN, Email, Phone, Address, State, Reference No, Notes
            </p>
          </div>
        </div>
      )}

      {/* ── STEP: PARSING ── */}
      {step === STEP.PARSING && (
        <div className={`${card} p-16 text-center`}>
          <RefreshCw size={32} className="mx-auto mb-4 animate-spin" style={{ color: COLORS.blue }} />
          <p className="font-semibold text-gray-700 dark:text-gray-200">Parsing your file…</p>
          <p className="text-xs text-gray-400 mt-1">This may take a moment for large files</p>
        </div>
      )}

      {/* ── STEP: IMPORTING ── */}
      {step === STEP.IMPORTING && (
        <div className={`${card} p-16 text-center`}>
          <RefreshCw size={32} className="mx-auto mb-4 animate-spin" style={{ color: COLORS.green }} />
          <p className="font-semibold text-gray-700 dark:text-gray-200">Importing into database…</p>
          <p className="text-xs text-gray-400 mt-1">Please wait — do not close this tab</p>
        </div>
      )}

      {/* ── STEP: PREVIEW ── */}
      {step === STEP.PREVIEW && preview && (
        <div className="space-y-4">

          {/* Source badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ background: COLORS.blue }}>
              {preview.source_label || preview.source}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              File parsed successfully — review below, then import
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={Receipt}  label="Invoices"  value={preview.invoices?.length  || 0} color={COLORS.blue}   />
            <Stat icon={Users}    label="Clients"   value={preview.clients?.length   || 0} color={COLORS.green}  />
            <Stat icon={Package}  label="Products"  value={preview.items?.length     || 0} color={COLORS.purple} />
            <Stat icon={CreditCard} label="Payments" value={preview.payments?.length || 0} color={COLORS.amber}  />
          </div>

          {/* Options */}
          <div className={`${card} p-4 flex items-center justify-between`}>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Skip duplicate invoice numbers</p>
              <p className="text-xs text-gray-400 mt-0.5">Recommended — prevents double-importing the same invoices</p>
            </div>
            <button
              onClick={() => setSkipDups(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${skipDups ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${skipDups ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
                 style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.red }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* Invoices preview */}
          <Section
            title="Invoices"
            rows={preview.invoices}
            keyProp="invoice_no"
            columns={[
              { key: 'invoice_no',    label: 'Invoice #' },
              { key: 'client_name',   label: 'Client' },
              { key: 'invoice_date',  label: 'Date' },
              { key: 'invoice_type',  label: 'Type' },
              { key: 'grand_total',   label: 'Total', align: 'right', render: r => `₹${fmt(r.grand_total)}` },
              { key: 'status',        label: 'Status' },
            ]}
          />

          {/* Clients preview */}
          <Section
            title="Clients"
            rows={preview.clients}
            keyProp="name_id"
            columns={[
              { key: 'full_name',          label: 'Name' },
              { key: 'phone_number',       label: 'Phone' },
              { key: 'email',              label: 'Email' },
              { key: 'name_gstin_number',  label: 'GSTIN' },
              { key: 'name_state',         label: 'State' },
            ]}
          />

          {/* Products preview */}
          <Section
            title="Products / Items"
            rows={preview.items}
            keyProp="item_id"
            columns={[
              { key: 'name',        label: 'Name' },
              { key: 'hsn_sac',     label: 'HSN/SAC' },
              { key: 'sale_price',  label: 'Rate', align: 'right', render: r => `₹${fmt(r.sale_price)}` },
              { key: 'gst_rate',    label: 'GST%', render: r => `${r.gst_rate}%` },
            ]}
          />

          {/* Payments preview */}
          <Section
            title="Payments"
            rows={preview.payments}
            keyProp="_kb_id"
            columns={[
              { key: 'client_name',   label: 'Client' },
              { key: 'payment_date',  label: 'Date' },
              { key: 'amount',        label: 'Amount', align: 'right', render: r => `₹${fmt(r.amount)}` },
              { key: 'payment_mode',  label: 'Mode' },
            ]}
          />

          {/* Import button */}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={reset}
                    className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              Cancel
            </button>
            <button
              onClick={runImport}
              disabled={!preview.invoices?.length && !preview.clients?.length}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-40"
              style={{ background: COLORS.blue }}
            >
              <ArrowRight size={15} />
              Import {(preview.invoices?.length || 0)} Invoice{preview.invoices?.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: DONE ── */}
      {step === STEP.DONE && result && (
        <div className="space-y-4">

          {/* Success banner */}
          <div className="flex items-center gap-3 p-5 rounded-2xl"
               style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <CheckCircle size={24} style={{ color: COLORS.green }} />
            <div>
              <p className="font-semibold text-green-800">Import completed successfully!</p>
              <p className="text-xs text-green-600 mt-0.5">
                All records have been saved to the database
              </p>
            </div>
          </div>

          {/* Result stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Invoices Imported', value: result.invoices_imported,  color: COLORS.blue,   icon: Receipt   },
              { label: 'Invoices Skipped',  value: result.invoices_skipped,   color: COLORS.amber,  icon: AlertCircle },
              { label: 'Clients Added',     value: result.clients_imported,   color: COLORS.green,  icon: Users     },
              { label: 'Clients Updated',   value: result.clients_updated,    color: COLORS.purple, icon: Users     },
              { label: 'Products Added',    value: result.items_imported,     color: COLORS.purple, icon: Package   },
              { label: 'Payments Added',    value: result.payments_imported,  color: COLORS.amber,  icon: CreditCard },
            ].map(s => <Stat key={s.label} {...s} />)}
          </div>

          {/* Errors */}
          {result.errors?.length > 0 && (
            <div className={`${card} p-4`}>
              <p className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                <AlertCircle size={15} /> {result.errors.length} non-fatal error(s)
              </p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={reset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <Upload size={14} /> Import Another File
            </button>
            <a href="/invoicing"
               className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition"
               style={{ background: COLORS.blue }}>
              <Receipt size={14} /> View Invoices <ArrowRight size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
