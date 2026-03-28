import Papa from 'papaparse/papaparse.js';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  Plus, Edit, Trash2, FileText, Search, Download, X, ChevronRight,
  CheckCircle2, Clock, AlertCircle, TrendingUp, DollarSign, BarChart3,
  Building2, Users, Receipt, CreditCard, RefreshCw, Eye, Send, Copy,
  Repeat, Package, Tag, ChevronDown, ChevronUp, Percent, Truck,
  ArrowUpRight, Activity, Zap, Shield, Star, Filter,
  IndianRupee, CalendarDays, FileCheck, ArrowRightLeft, Layers,
  Upload, Database, FileUp, CheckSquare, AlertTriangle,
} from 'lucide-react';

// ─── Brand Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  amber:        '#F59E0B',
  purple:       '#7C3AED',
  teal:         '#0D9488',
};

// ─── Constants ─────────────────────────────────────────────────────────────────
const GST_RATES   = [0, 5, 12, 18, 28];
const UNITS       = ['service','nos','kg','ltr','mtr','sqft','hr','day','month','year','set','lot','pcs','box'];
const PAY_MODES   = ['cash','cheque','neft','rtgs','imps','upi','card','other'];
const INV_TYPES   = [
  { value: 'tax_invoice', label: 'Tax Invoice' },
  { value: 'proforma',    label: 'Proforma Invoice' },
  { value: 'estimate',    label: 'Estimate' },
  { value: 'credit_note', label: 'Credit Note' },
  { value: 'debit_note',  label: 'Debit Note' },
];

const STATUS_META = {
  draft:           { label: 'Draft',       bg: 'bg-slate-100 dark:bg-slate-700',        text: 'text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400',   hex: '#94A3B8' },
  sent:            { label: 'Sent',        bg: 'bg-blue-50 dark:bg-blue-900/30',         text: 'text-blue-600 dark:text-blue-400',     dot: 'bg-blue-500',    hex: COLORS.mediumBlue },
  partially_paid:  { label: 'Partial',     bg: 'bg-amber-50 dark:bg-amber-900/20',       text: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-400',   hex: COLORS.amber },
  paid:            { label: 'Paid',        bg: 'bg-emerald-50 dark:bg-emerald-900/20',   text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', hex: COLORS.emeraldGreen },
  overdue:         { label: 'Overdue',     bg: 'bg-red-50 dark:bg-red-900/20',           text: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500',     hex: COLORS.coral },
  cancelled:       { label: 'Cancelled',   bg: 'bg-slate-100 dark:bg-slate-700',        text: 'text-slate-500 dark:text-slate-400',   dot: 'bg-slate-400',   hex: '#94A3B8' },
  credit_note:     { label: 'Credit Note', bg: 'bg-purple-50 dark:bg-purple-900/20',    text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500',  hex: COLORS.purple },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmt(n)}`;

const getStatusMeta = (inv) => {
  if (inv.status && STATUS_META[inv.status]) return STATUS_META[inv.status];
  if (inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0)
    return STATUS_META.overdue;
  return STATUS_META.draft;
};

const emptyItem = () => ({
  description: '', hsn_sac: '', quantity: 1, unit: 'service',
  unit_price: 0, discount_pct: 0, gst_rate: 18,
  taxable_value: 0, cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_amount: 0,
});

// ─── Item computation ──────────────────────────────────────────────────────────
const computeItem = (item, isInter) => {
  const disc    = item.unit_price * item.quantity * (item.discount_pct / 100);
  const taxable = Math.round((item.unit_price * item.quantity - disc) * 100) / 100;
  const g = item.gst_rate;
  if (isInter) {
    const igst = Math.round(taxable * g / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: 0, sgst_rate: 0, igst_rate: g,
      cgst_amount: 0, sgst_amount: 0, igst_amount: igst,
      total_amount: Math.round((taxable + igst) * 100) / 100 };
  } else {
    const half = g / 2;
    const cgst = Math.round(taxable * half / 100 * 100) / 100;
    const sgst = Math.round(taxable * half / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: half, sgst_rate: half, igst_rate: 0,
      cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0,
      total_amount: Math.round((taxable + cgst + sgst) * 100) / 100 };
  }
};

const computeTotals = (items, isInter, discAmt = 0, shipping = 0, other = 0) => {
  const comp     = items.map(it => computeItem(it, isInter));
  const subtotal = comp.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totDisc  = comp.reduce((s, i) => s + i.unit_price * i.quantity * i.discount_pct / 100, 0) + discAmt;
  const totTax   = comp.reduce((s, i) => s + i.taxable_value, 0);
  const totCGST  = comp.reduce((s, i) => s + i.cgst_amount, 0);
  const totSGST  = comp.reduce((s, i) => s + i.sgst_amount, 0);
  const totIGST  = comp.reduce((s, i) => s + i.igst_amount, 0);
  const totGST   = Math.round((totCGST + totSGST + totIGST) * 100) / 100;
  const grand    = Math.round((totTax + totGST + shipping + other - discAmt) * 100) / 100;
  return {
    items: comp,
    subtotal:       Math.round(subtotal * 100) / 100,
    total_discount: Math.round(totDisc * 100) / 100,
    total_taxable:  Math.round(totTax * 100) / 100,
    total_cgst:     Math.round(totCGST * 100) / 100,
    total_sgst:     Math.round(totSGST * 100) / 100,
    total_igst:     Math.round(totIGST * 100) / 100,
    total_gst: totGST,
    grand_total: grand,
  };
};

// ════════════════════════════════════════════════════════════════════════════════
// VYP IMPORT PARSER  (KhataBook SQLite backup)
// Reads the .vyp file using the File System Access API / FileReader as binary,
// then queries it with sql.js (loaded from CDN via dynamic import).
// Falls back to a structured parse without sql.js showing what was detected.
// ════════════════════════════════════════════════════════════════════════════════

/**
 * KhataBook txn_type mapping:
 *  1 = Sale (Invoice)
 *  2 = Sale Return
 *  3 = Payment In (Receipt)
 *  4 = Payment Out
 *  7 = Purchase
 *  21 = Expense
 *  27 = Credit Note
 *  65 = Debit Note
 *
 * txn_payment_status:
 *  1 = Unpaid / Due
 *  2 = Partial
 *  3 = Paid
 */
const KB_TXN_TYPE = { 1:'sale', 2:'sale_return', 3:'payment_in', 4:'payment_out', 7:'purchase', 21:'expense', 27:'credit_note', 65:'debit_note' };
const KB_PAY_STATUS = { 1:'sent', 2:'partially_paid', 3:'paid' };

async function parseVypFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const uint8 = new Uint8Array(arrayBuffer);

        // Verify SQLite magic bytes
        const magic = String.fromCharCode(...uint8.slice(0, 6));
        if (!magic.startsWith('SQLite')) {
          reject(new Error('File does not appear to be a valid KhataBook backup (not SQLite format)'));
          return;
        }

        // Try to load sql.js from CDN
        let SQL;
        try {
          const initSqlJs = (await import('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js')).default;
          SQL = await initSqlJs({ locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm' });
        } catch (sqlErr) {
          reject(new Error('sql.js could not be loaded. Please ensure you have internet access to load the parser library.'));
          return;
        }

        const db = new SQL.Database(uint8);

        const q = (sql, params = []) => {
          try {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            stmt.free();
            return rows;
          } catch { return []; }
        };

        // ── Firms ──
        const firms = q(`SELECT firm_id, firm_name, firm_email, firm_phone, firm_address,
          firm_gstin_number, firm_state, firm_bank_name, firm_bank_account_number, firm_bank_ifsc_code
          FROM kb_firms`);

        // ── Clients / Parties ──
        const clients = q(`SELECT name_id, full_name, phone_number, email, address,
          name_gstin_number, name_state, name_type FROM kb_names ORDER BY full_name`);

        // ── Items / Services ──
        const items = q(`SELECT item_id, item_name, item_sale_unit_price, item_hsn_sac_code,
          item_description, item_type FROM kb_items WHERE item_is_active=1 ORDER BY item_name`);

        // ── Transactions (Sales only = type 1) with line items ──
        const txns = q(`
          SELECT t.txn_id, t.txn_date, t.txn_type, t.txn_cash_amount, t.txn_balance_amount,
            t.txn_tax_amount, t.txn_discount_amount, t.txn_payment_status,
            t.txn_ref_number_char, t.txn_description, t.txn_due_date,
            t.txn_billing_address, t.txn_firm_id,
            n.full_name AS client_name, n.email AS client_email, n.phone_number AS client_phone,
            n.name_gstin_number AS client_gstin, n.address AS client_address
          FROM kb_transactions t
          LEFT JOIN kb_names n ON t.txn_name_id = n.name_id
          ORDER BY t.txn_date DESC
        `);

        // ── Line items ──
        const lineitems = q(`
          SELECT li.lineitem_txn_id, li.item_id, li.quantity, li.priceperunit,
            li.total_amount, li.lineitem_tax_amount, li.lineitem_discount_amount,
            li.lineitem_description, i.item_name, i.item_hsn_sac_code
          FROM kb_lineitems li
          LEFT JOIN kb_items i ON li.item_id = i.item_id
        `);

        db.close();

        // Group lineitems by txn_id
        const liMap = {};
        lineitems.forEach(li => {
          if (!liMap[li.lineitem_txn_id]) liMap[li.lineitem_txn_id] = [];
          liMap[li.lineitem_txn_id].push(li);
        });

        // Build invoice-shaped objects from sale transactions
        const invoices = txns
          .filter(t => t.txn_type === 1) // sales only
          .map(t => {
            const lis = liMap[t.txn_id] || [];
            const invItems = lis.map(li => ({
              description: li.item_name || li.lineitem_description || 'Service',
              hsn_sac:     li.item_hsn_sac_code || '',
              quantity:    Number(li.quantity) || 1,
              unit:        'service',
              unit_price:  Number(li.priceperunit) || 0,
              discount_pct: 0,
              gst_rate:    18,
              taxable_value: Number(li.priceperunit) * Number(li.quantity) || 0,
              cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
              cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
              total_amount: Number(li.total_amount) || 0,
            }));

            const payStatus = KB_PAY_STATUS[t.txn_payment_status] || 'sent';
            const grandTotal = Number(t.txn_cash_amount) + Number(t.txn_balance_amount);
            const amtPaid = Number(t.txn_cash_amount);
            const amtDue = Number(t.txn_balance_amount);

            return {
              _kb_id:       t.txn_id,
              invoice_type: 'tax_invoice',
              company_id:   String(t.txn_firm_id || ''),
              client_name:  t.client_name || '',
              client_email: t.client_email || '',
              client_phone: t.client_phone || '',
              client_gstin: t.client_gstin || '',
              client_address: t.txn_billing_address || t.client_address || '',
              invoice_date: t.txn_date ? t.txn_date.split(' ')[0] : '',
              due_date:     t.txn_due_date ? t.txn_due_date.split(' ')[0] : '',
              reference_no: t.txn_ref_number_char || '',
              notes:        t.txn_description || '',
              items:        invItems,
              grand_total:  grandTotal,
              amount_paid:  amtPaid,
              amount_due:   amtDue,
              status:       payStatus,
              subtotal:     grandTotal,
              total_taxable: grandTotal - Number(t.txn_tax_amount || 0),
              total_gst:    Number(t.txn_tax_amount || 0),
              total_cgst:   0,
              total_sgst:   0,
              total_igst:   0,
              total_discount: Number(t.txn_discount_amount || 0),
              is_interstate: false,
              payment_terms: 'Due on receipt',
            };
          });

        resolve({ firms, clients, items, invoices, allTxns: txns, lineitems, liMap });
      } catch (err) {
        reject(new Error(`Failed to parse .vyp file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// VYP IMPORT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const VypImportModal = ({ open, onClose, isDark, companies, onImportComplete }) => {
  const [step, setStep]         = useState('upload'); // upload | preview | importing | done
  const [file, setFile]         = useState(null);
  const [parsed, setParsed]     = useState(null);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults]   = useState({ imported: 0, clients: 0, skipped: 0, errors: [] });
  const [selectedFirm, setSelectedFirm] = useState('__none__');
  const [importClients, setImportClients] = useState(true);
  const [importInvoices, setImportInvoices] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState('__none__');
  const dropRef = useRef(null);

  const reset = () => {
    setStep('upload'); setFile(null); setParsed(null); setError('');
    setLoading(false); setProgress(0); setResults({ imported: 0, clients: 0, skipped: 0, errors: [] });
    setSelectedFirm('__none__'); setSelectedCompanyId('__none__');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.vyp') && !f.name.endsWith('.db')) {
      setError('Please upload a KhataBook .vyp backup file');
      return;
    }
    setFile(f); setError('');
  }, []);

  const handleParse = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      const data = await parseVypFile(file);
      setParsed(data);
      if (data.firms.length > 0) setSelectedFirm(String(data.firms[0].firm_id));
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setStep('importing'); setProgress(0);

    const res = { imported: 0, clients: 0, skipped: 0, errors: [] };
    const companyId = selectedCompanyId === '__none__' ? '' : selectedCompanyId;

    // Import Clients
    if (importClients && parsed.clients.length > 0) {
      const clientsToImport = parsed.clients.slice(0, 500); // safety limit
      let done = 0;
      for (const c of clientsToImport) {
        try {
          await api.post('/clients', {
            company_name: c.full_name || 'Unknown',
            email:        c.email || null,
            phone:        c.phone_number || null,
            address:      c.address || '',
            notes:        `Imported from KhataBook. GSTIN: ${c.name_gstin_number || 'N/A'}`,
            client_type:  'other',
            status:       'active',
            assigned_to:  null,
          });
          res.clients++;
        } catch {
          res.skipped++;
        }
        done++;
        setProgress(Math.round((done / clientsToImport.length) * 40));
      }
    }

    // Import Invoices
    if (importInvoices && parsed.invoices.length > 0) {
      // Filter by selected firm if not "all"
      const invToImport = selectedFirm === '__none__'
        ? parsed.invoices
        : parsed.invoices.filter(i => String(i.company_id) === selectedFirm);

      let done = 0;
      for (const inv of invToImport) {
        try {
          const payload = {
            ...inv,
            company_id: companyId,
            invoice_type: 'tax_invoice',
            items: inv.items.length > 0 ? inv.items : [{ ...emptyItem(), description: 'Imported service', unit_price: inv.grand_total }],
          };
          // Remove internal fields
          delete payload._kb_id;
          await api.post('/invoices', payload);
          res.imported++;
        } catch {
          res.skipped++;
        }
        done++;
        setProgress(40 + Math.round((done / invToImport.length) * 55));
      }
    }

    setProgress(100);
    setResults(res);
    setStep('done');
    onImportComplete?.();
  };

  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl rounded-2xl border shadow-2xl p-0 overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Import KhataBook Backup</DialogTitle>
        <DialogDescription className="sr-only">Import .vyp KhataBook backup file</DialogDescription>

        {/* Header */}
        <div className="px-7 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, #065f46, #059669)` }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Database className="h-5 w-5 text-white" /></div>
            <div>
              <h2 className="text-white font-bold text-lg">Import KhataBook Backup</h2>
              <p className="text-emerald-200 text-xs mt-0.5">Import clients & invoices from a .vyp backup file</p>
            </div>
          </div>
          {/* Steps */}
          <div className="relative mt-4 flex items-center gap-2">
            {['Upload', 'Preview', 'Import', 'Done'].map((s, i) => {
              const stepKeys = ['upload', 'preview', 'importing', 'done'];
              const current = stepKeys.indexOf(step);
              const isActive = i === current;
              const isDone = i < current;
              return (
                <React.Fragment key={s}>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all
                    ${isActive ? 'bg-white text-emerald-700' : isDone ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'}`}>
                    {isDone ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 h-3 flex items-center justify-center">{i + 1}</span>}
                    {s}
                  </div>
                  {i < 3 && <div className={`flex-1 h-px ${isDone ? 'bg-white/60' : 'bg-white/20'}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="p-7">

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div
                ref={dropRef}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                  ${file ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : (isDark ? 'border-slate-600 hover:border-emerald-500 bg-slate-700/40' : 'border-slate-200 hover:border-emerald-400 bg-slate-50')}`}
              >
                <input type="file" accept=".vyp,.db" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  onChange={handleFileDrop} />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                      <Database className="h-7 w-7 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">{file.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · KhataBook Backup</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-white'} shadow-sm border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                      <FileUp className="h-7 w-7 text-slate-400" />
                    </div>
                    <div>
                      <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Drop your .vyp file here</p>
                      <p className="text-xs text-slate-400 mt-1">or click to browse · KhataBook backup files only</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      File is processed locally — your data never leaves your browser
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />{error}
                </div>
              )}

              <div className={`rounded-xl p-4 text-xs space-y-1.5 ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-blue-50 text-slate-500'}`}>
                <p className={`font-bold text-sm mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>What gets imported</p>
                <p>✅ <strong>Clients / Parties</strong> — all contacts from kb_names</p>
                <p>✅ <strong>Invoices</strong> — all Sale transactions (txn_type=1) with line items</p>
                <p>✅ <strong>Payment status</strong> — Paid / Partial / Unpaid mapped automatically</p>
                <p>⚠️ Images and attachments are not imported</p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={handleClose} className="flex-1 h-10 rounded-xl">Cancel</Button>
                <Button onClick={handleParse} disabled={!file || loading} className="flex-1 h-10 rounded-xl text-white font-semibold"
                  style={{ background: !file ? '#94a3b8' : 'linear-gradient(135deg, #065f46, #059669)' }}>
                  {loading ? 'Parsing…' : 'Parse File →'}
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP: PREVIEW ── */}
          {step === 'preview' && parsed && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Firms Found', val: parsed.firms.length, icon: Building2, color: COLORS.deepBlue },
                  { label: 'Clients',     val: parsed.clients.length, icon: Users,    color: COLORS.emeraldGreen },
                  { label: 'Invoices',    val: parsed.invoices.length, icon: Receipt,  color: COLORS.mediumBlue },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-4 border text-center ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <s.icon className="h-5 w-5 mx-auto mb-1" style={{ color: s.color }} />
                    <p className={`text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{s.val}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Firm selector */}
              {parsed.firms.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Filter Invoices by KhataBook Firm</label>
                  <Select value={selectedFirm} onValueChange={setSelectedFirm}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">All Firms</SelectItem>
                      {parsed.firms.map(f => (
                        <SelectItem key={f.firm_id} value={String(f.firm_id)}>{f.firm_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Map to company */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Map to Company Profile (for invoices)</label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select company…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Skip company mapping —</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle options */}
              <div className={`space-y-3 p-4 rounded-xl border ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                {[
                  { label: 'Import Clients', sub: `${parsed.clients.length} contacts`, val: importClients, set: setImportClients },
                  { label: 'Import Invoices', sub: `${parsed.invoices.length} sale transactions`, val: importInvoices, set: setImportInvoices },
                ].map(opt => (
                  <div key={opt.label} className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{opt.label}</p>
                      <p className="text-xs text-slate-400">{opt.sub}</p>
                    </div>
                    <Switch checked={opt.val} onCheckedChange={opt.set} />
                  </div>
                ))}
              </div>

              {/* Sample preview */}
              {parsed.invoices.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Sample Invoices (first 3)</p>
                  <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    {parsed.invoices.slice(0, 3).map((inv, i) => (
                      <div key={i} className={`flex items-center justify-between px-4 py-3 border-b last:border-0 text-xs ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{inv.client_name || 'Unknown'}</span>
                        <span className="text-slate-400">{inv.invoice_date}</span>
                        <span className="font-bold" style={{ color: COLORS.mediumBlue }}>{fmtC(inv.grand_total)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_META[inv.status]?.bg} ${STATUS_META[inv.status]?.text}`}>{STATUS_META[inv.status]?.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep('upload')} className="h-10 px-5 rounded-xl">← Back</Button>
                <Button onClick={handleImport} className="flex-1 h-10 rounded-xl text-white font-semibold"
                  style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                  Start Import →
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP: IMPORTING ── */}
          {step === 'importing' && (
            <div className="py-8 flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Database className="h-8 w-8 text-emerald-600 animate-pulse" />
              </div>
              <div className="text-center">
                <p className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Importing data…</p>
                <p className="text-slate-400 text-sm mt-1">Please wait, this may take a moment</p>
              </div>
              <div className="w-full max-w-sm">
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #065f46, #059669)' }} />
                </div>
                <p className="text-center text-xs text-slate-400 mt-2">{progress}% complete</p>
              </div>
            </div>
          )}

          {/* ── STEP: DONE ── */}
          {step === 'done' && (
            <div className="py-6 flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className={`font-bold text-xl ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Import Complete!</p>
                <p className="text-slate-400 text-sm mt-1">Your KhataBook data has been imported</p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                {[
                  { label: 'Invoices Imported', val: results.imported, color: COLORS.mediumBlue },
                  { label: 'Clients Added',     val: results.clients,  color: COLORS.emeraldGreen },
                  { label: 'Skipped / Errors',  val: results.skipped,  color: COLORS.coral },
                ].map(r => (
                  <div key={r.label} className={`rounded-xl p-4 text-center border ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-2xl font-black" style={{ color: r.color }}>{r.val}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{r.label}</p>
                  </div>
                ))}
              </div>
              {results.errors.length > 0 && (
                <div className="w-full max-h-24 overflow-y-auto rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-500">
                  {results.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <Button onClick={handleClose} className="w-full h-11 rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STATUS PILL
// ════════════════════════════════════════════════════════════════════════════════
const StatusPill = ({ inv }) => {
  const m = getStatusMeta(inv);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${m.bg} ${m.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STAT CARD
// ════════════════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sub, icon: Icon, color, bg, onClick, isDark, trend }) => (
  <div onClick={onClick}
    className={`rounded-2xl border p-5 relative overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}>
    <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: color }} />
    <div className="flex items-start justify-between mb-3 pl-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      {trend !== undefined && (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 pl-2 text-slate-400">{label}</p>
    <p className={`text-2xl font-bold tracking-tight pl-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
    {sub && <p className={`text-xs pl-2 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
  </div>
);

// ════════════════════════════════════════════════════════════════════════════════
// MINI REVENUE CHART
// ════════════════════════════════════════════════════════════════════════════════
const RevenueChart = ({ trend = [], isDark }) => {
  if (!trend.length) return null;
  const W = 700, H = 130, pad = { t: 16, b: 28, l: 56, r: 16 };
  const maxVal = Math.max(...trend.map(d => d.revenue), 1);
  const xStep  = (W - pad.l - pad.r) / Math.max(trend.length - 1, 1);
  const yScale = (v) => H - pad.b - (v / maxVal) * (H - pad.t - pad.b);
  const pts    = trend.map((d, i) => [pad.l + i * xStep, yScale(d.revenue)]);
  const area   = `M${pts[0][0]},${H - pad.b} L${pts.map(p => `${p[0]},${p[1]}`).join(' L')} L${pts[pts.length-1][0]},${H - pad.b} Z`;
  const line   = `M${pts.map(p => `${p[0]},${p[1]}`).join(' L')}`;
  const colPts = trend.map((d, i) => [pad.l + i * xStep, yScale(d.collected)]);
  const cline  = `M${colPts.map(p => `${p[0]},${p[1]}`).join(' L')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity="0.25" />
          <stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rg)" />
      <path d={line}  fill="none" stroke={COLORS.mediumBlue} strokeWidth="2" strokeLinecap="round" />
      <path d={cline} fill="none" stroke={COLORS.emeraldGreen} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.5" fill={COLORS.mediumBlue} />
          <text x={x} y={H - 6} textAnchor="middle" fontSize="9" fill={isDark ? '#64748b' : '#94a3b8'} fontFamily="monospace">
            {trend[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PAYMENT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const PaymentModal = ({ invoice, open, onClose, onSuccess, isDark }) => {
  const [form, setForm] = useState({ amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), payment_mode: 'neft', reference_no: '', notes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && invoice) setForm(p => ({ ...p, amount: invoice.amount_due?.toFixed(2) || '' }));
  }, [open, invoice]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post('/payments', {
        invoice_id: invoice.id, amount: parseFloat(form.amount),
        payment_date: form.payment_date, payment_mode: form.payment_mode,
        reference_no: form.reference_no, notes: form.notes,
      });
      toast.success('Payment recorded!');
      onSuccess?.(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record payment'); }
    finally { setLoading(false); }
  };

  if (!invoice) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Record Payment</DialogTitle>
        <DialogDescription className="sr-only">Record payment for invoice</DialogDescription>
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <IndianRupee className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white/60 text-[10px] uppercase tracking-widest">Record Payment</p>
              <h2 className="text-white font-bold text-lg">{invoice.invoice_no}</h2>
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            {[['Invoice Total', invoice.grand_total, 'text-white'], ['Paid So Far', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([l, v, cls]) => (
              <div key={l} className="flex-1 bg-white/10 rounded-xl px-3 py-2">
                <p className="text-white/50 text-[9px] uppercase tracking-wider">{l}</p>
                <p className={`font-bold text-sm ${cls}`}>{fmtC(v)}</p>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
              <Input type="number" step="0.01" min="0.01" className="pl-8 h-11 rounded-xl" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Date *</label>
              <Input type="date" className="h-11 rounded-xl" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} required />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Mode</label>
              <Select value={form.payment_mode} onValueChange={v => setForm(p => ({ ...p, payment_mode: v }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_MODES.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Reference / UTR No.</label>
            <Input className="h-11 rounded-xl" placeholder="Transaction / cheque reference" value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Notes</label>
            <Textarea className="rounded-xl text-sm min-h-[70px] resize-none" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-11 rounded-xl">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 h-11 rounded-xl text-white font-semibold"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>
              {loading ? 'Recording…' : '✓ Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE FORM (Create / Edit)  — FIX: no empty-string SelectItem values
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceForm = ({ open, onClose, editingInv, companies, clients, leads, onSuccess, isDark }) => {
  const defaultForm = {
    invoice_type: 'tax_invoice', company_id: '', client_id: '', lead_id: '',
    client_name: '', client_address: '', client_email: '', client_phone: '', client_gstin: '', client_state: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
    supply_state: '', is_interstate: false,
    items: [emptyItem()],
    gst_rate: 18, discount_amount: 0, shipping_charges: 0, other_charges: 0,
    payment_terms: 'Due on receipt', notes: '', terms_conditions: '', reference_no: '',
    is_recurring: false, recurrence_pattern: 'monthly', status: 'draft',
  };

  const [form, setForm]         = useState(defaultForm);
  const [loading, setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [products, setProducts]   = useState([]);

  useEffect(() => {
    if (open) {
      if (editingInv) setForm({ ...defaultForm, ...editingInv });
      else setForm(defaultForm);
      setActiveTab('details');
    }
  }, [open, editingInv]);

  useEffect(() => {
    api.get('/products').then(r => setProducts(r.data || [])).catch(() => {});
  }, []);

  const totals = useMemo(() =>
    computeTotals(form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges),
    [form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges]
  );

  const setField = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const updateItem = useCallback((idx, k, val) => {
    setForm(p => {
      const items = p.items.map((it, i) => i !== idx ? it : { ...it, [k]: val });
      return { ...p, items };
    });
  }, []);

  const addItem    = useCallback(() => setForm(p => ({ ...p, items: [...p.items, emptyItem()] })), []);
  const removeItem = useCallback((idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) })), []);

  // FIX: use '__none__' sentinel instead of '' for SelectItems
  const fillFromClient = useCallback((val) => {
    if (val === '__none__') { setField('client_id', ''); return; }
    const c = clients.find(x => x.id === val);
    if (!c) return;
    setForm(p => ({
      ...p, client_id: val,
      client_name:    c.company_name || '',
      client_email:   c.email || '',
      client_phone:   c.phone || '',
      client_address: [c.address, c.city, c.state].filter(Boolean).join(', '),
      client_state:   c.state || '',
    }));
  }, [clients, setField]);

  const fillFromProduct = useCallback((idx, productId) => {
    if (productId === '__none__') return;
    const prod = products.find(x => x.id === productId);
    if (!prod) return;
    setForm(p => ({
      ...p,
      items: p.items.map((it, i) => i !== idx ? it : {
        ...it, product_id: productId, description: prod.name,
        hsn_sac: prod.hsn_sac || '', unit: prod.unit || 'service',
        unit_price: prod.unit_price || 0, gst_rate: prod.gst_rate || 18,
      }),
    }));
  }, [products]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_id) { toast.error('Please select a company profile'); return; }
    if (!form.client_name?.trim()) { toast.error('Client name is required'); return; }
    if (!form.items.some(it => it.description?.trim())) { toast.error('Add at least one item'); return; }
    setLoading(true);
    try {
      const payload = { ...form, ...totals };
      if (editingInv) await api.put(`/invoices/${editingInv.id}`, payload);
      else await api.post('/invoices', payload);
      toast.success(editingInv ? 'Invoice updated!' : 'Invoice created!');
      onSuccess?.(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save invoice'); }
    finally { setLoading(false); }
  };

  const labelCls  = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const inputCls  = `h-11 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;
  const sectionCls = `border rounded-2xl p-5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`;

  const tabs = [
    { id: 'details',  label: 'Details',  icon: FileText },
    { id: 'items',    label: 'Items',    icon: Package },
    { id: 'totals',   label: 'Totals',   icon: IndianRupee },
    { id: 'settings', label: 'Settings', icon: Layers },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[96vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">{editingInv ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
        <DialogDescription className="sr-only">Invoice form</DialogDescription>

        {/* Header */}
        <div className="sticky top-0 z-20 flex-shrink-0">
          <div className="px-7 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            <div className="absolute right-0 top-0 w-56 h-56 rounded-full -mr-20 -mt-20 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-widest">
                    {editingInv ? `Edit · ${editingInv.invoice_no}` : 'New Document'}
                  </p>
                  <h2 className="text-white font-bold text-xl">
                    {editingInv ? 'Edit Invoice' : 'Create Invoice / Estimate'}
                  </h2>
                </div>
              </div>
              <Select value={form.invoice_type} onValueChange={v => setField('invoice_type', v)}>
                <SelectTrigger className="w-44 h-9 rounded-xl border-white/20 bg-white/10 text-white text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tab nav */}
          <div className={`flex border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? `border-blue-500 ${isDark ? 'text-blue-400' : 'text-blue-600'}`
                    : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`
                }`}>
                <tab.icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 px-4">
              <span className={`text-xs font-bold ${totals.grand_total > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
                Total: {fmtC(totals.grand_total)}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">

            {/* ── DETAILS ── */}
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <Building2 className="h-4 w-4" />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Company & Client</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Company Profile *</label>
                      <Select value={form.company_id || '__none__'} onValueChange={v => setField('company_id', v === '__none__' ? '' : v)}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="Select company profile" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Select company —</SelectItem>
                          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      {/* FIX: '__none__' sentinel instead of '' */}
                      <label className={labelCls}>Select Client (auto-fill)</label>
                      <Select value={form.client_id || '__none__'} onValueChange={fillFromClient}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="Choose from clients…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Manual Entry —</SelectItem>
                          {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Client Name *</label>
                      <Input className={inputCls} value={form.client_name} onChange={e => setField('client_name', e.target.value)} required />
                    </div>
                    <div>
                      <label className={labelCls}>Client GSTIN</label>
                      <Input className={inputCls} placeholder="22AAAAA0000A1Z5" value={form.client_gstin} onChange={e => setField('client_gstin', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <Input type="email" className={inputCls} value={form.client_email} onChange={e => setField('client_email', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <Input className={inputCls} value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Address</label>
                      <Input className={inputCls} value={form.client_address} onChange={e => setField('client_address', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Client State</label>
                      <Input className={inputCls} placeholder="e.g. Gujarat" value={form.client_state} onChange={e => setField('client_state', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Supply State (Your State)</label>
                      <Input className={inputCls} placeholder="e.g. Gujarat" value={form.supply_state} onChange={e => setField('supply_state', e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <Switch checked={form.is_interstate} onCheckedChange={v => setField('is_interstate', v)} />
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Interstate Supply (IGST)</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">{form.is_interstate ? 'IGST will be applied' : 'CGST + SGST will be applied'}</p>
                    </div>
                  </div>
                </div>

                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Invoice Details</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Invoice Date *</label>
                      <Input type="date" className={inputCls} value={form.invoice_date} onChange={e => setField('invoice_date', e.target.value)} required />
                    </div>
                    <div>
                      <label className={labelCls}>Due Date</label>
                      <Input type="date" className={inputCls} value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Reference / PO No.</label>
                      <Input className={inputCls} placeholder="Optional" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Payment Terms</label>
                      <Input className={inputCls} value={form.payment_terms} onChange={e => setField('payment_terms', e.target.value)} />
                    </div>
                    <div>
                      {/* FIX: '__none__' sentinel instead of '' */}
                      <label className={labelCls}>Linked Lead</label>
                      <Select value={form.lead_id || '__none__'} onValueChange={v => setField('lead_id', v === '__none__' ? null : v)}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="Link to lead…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— No Lead —</SelectItem>
                          {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.company_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <Select value={form.status} onValueChange={v => setField('status', v)}>
                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['draft','sent','partially_paid','paid','overdue','cancelled'].map(s =>
                            <SelectItem key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ITEMS ── */}
            {activeTab === 'items' && (
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <Package className="h-4 w-4" />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Line Items</h3>
                  </div>
                  <Button type="button" size="sm" onClick={addItem} variant="outline" className="h-8 px-3 text-xs rounded-xl">
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="space-y-4">
                  {form.items.map((item, idx) => {
                    const comp = computeItem(item, form.is_interstate);
                    return (
                      <div key={idx} className={`border rounded-xl p-4 relative ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                            {/* FIX: '__none__' sentinel */}
                            <Select value={item.product_id || '__none__'} onValueChange={v => fillFromProduct(idx, v)}>
                              <SelectTrigger className="h-7 w-44 text-xs rounded-lg border-slate-200"><SelectValue placeholder="Pick from catalog…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Manual Entry —</SelectItem>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          {form.items.length > 1 && (
                            <button type="button" onClick={() => removeItem(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <label className={labelCls}>Description *</label>
                            <Input className={inputCls} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                          </div>
                          <div>
                            <label className={labelCls}>HSN / SAC</label>
                            <Input className={inputCls} placeholder="e.g. 9983" value={item.hsn_sac} onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} />
                          </div>
                          <div>
                            <label className={labelCls}>Unit</label>
                            <Select value={item.unit} onValueChange={v => updateItem(idx, 'unit', v)}>
                              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                              <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={labelCls}>Quantity</label>
                            <Input type="number" min="0" step="0.01" className={inputCls} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <label className={labelCls}>Unit Price (₹)</label>
                            <Input type="number" min="0" step="0.01" className={inputCls} value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <label className={labelCls}>Discount %</label>
                            <Input type="number" min="0" max="100" step="0.01" className={inputCls} value={item.discount_pct} onChange={e => updateItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <label className={labelCls}>GST Rate %</label>
                            <Select value={String(item.gst_rate)} onValueChange={v => updateItem(idx, 'gst_rate', parseFloat(v))}>
                              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                              <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className={`mt-3 flex flex-wrap gap-3 text-[10px] px-3 py-2 rounded-lg ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                          <span>Taxable: <strong className={isDark ? 'text-slate-200' : 'text-slate-700'}>{fmtC(comp.taxable_value)}</strong></span>
                          {form.is_interstate
                            ? <span>IGST ({comp.igst_rate}%): <strong className="text-amber-600">{fmtC(comp.igst_amount)}</strong></span>
                            : <>
                                <span>CGST ({comp.cgst_rate}%): <strong className="text-amber-600">{fmtC(comp.cgst_amount)}</strong></span>
                                <span>SGST ({comp.sgst_rate}%): <strong className="text-amber-600">{fmtC(comp.sgst_amount)}</strong></span>
                              </>
                          }
                          <span className="ml-auto font-bold" style={{ color: COLORS.mediumBlue }}>Total: {fmtC(comp.total_amount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TOTALS ── */}
            {activeTab === 'totals' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Charges & Discounts</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[['Extra Discount (₹)', 'discount_amount'], ['Shipping Charges (₹)', 'shipping_charges'], ['Other Charges (₹)', 'other_charges']].map(([label, key]) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <Input type="number" min="0" step="0.01" className={inputCls} value={form[key]} onChange={e => setField(key, parseFloat(e.target.value) || 0)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  {[
                    ['Subtotal', totals.subtotal, false, false],
                    ['Total Discount', totals.total_discount, false, true],
                    ['Taxable Value', totals.total_taxable, false, false],
                    form.is_interstate ? ['IGST', totals.total_igst, false, false] : null,
                    !form.is_interstate ? ['CGST', totals.total_cgst, false, false] : null,
                    !form.is_interstate ? ['SGST', totals.total_sgst, false, false] : null,
                    form.shipping_charges > 0 ? ['Shipping', form.shipping_charges, false, false] : null,
                    form.other_charges > 0 ? ['Other', form.other_charges, false, false] : null,
                    ['GRAND TOTAL', totals.grand_total, true, false],
                  ].filter(Boolean).map(([label, val, bold, neg]) => (
                    <div key={label} className={`flex items-center justify-between px-5 py-3 border-b last:border-0 ${bold ? (isDark ? 'bg-slate-700' : 'bg-slate-50') : ''} ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'} ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
                      <span className={`text-sm ${bold ? 'text-xl font-black' : 'font-semibold'} ${neg ? 'text-red-500' : ''}`}
                        style={bold ? { color: COLORS.mediumBlue } : {}}>
                        {neg && val > 0 ? '- ' : ''}{fmtC(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SETTINGS ── */}
            {activeTab === 'settings' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Notes & Terms</h3>
                  <div className="space-y-4">
                    {[['Notes (shown on invoice)', 'notes'], ['Terms & Conditions', 'terms_conditions']].map(([label, key]) => (
                      <div key={key}>
                        <label className={labelCls}>{label}</label>
                        <Textarea className={`rounded-xl text-sm min-h-[80px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}
                          value={form[key]} onChange={e => setField(key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Recurring Settings</h3>
                  <div className="flex items-center gap-3 mb-4">
                    <Switch checked={form.is_recurring} onCheckedChange={v => setField('is_recurring', v)} />
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Enable Recurring Invoice</p>
                      <p className="text-xs text-slate-400">Auto-generate new invoice on schedule</p>
                    </div>
                  </div>
                  {form.is_recurring && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Recurrence Pattern</label>
                        <Select value={form.recurrence_pattern} onValueChange={v => setField('recurrence_pattern', v)}>
                          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className={labelCls}>Recurrence End Date</label>
                        <Input type="date" className={inputCls} value={form.recurrence_end || ''} onChange={e => setField('recurrence_end', e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-5 text-sm rounded-xl text-slate-500">Cancel</Button>
          <div className="flex items-center gap-3">
            {totals.grand_total > 0 && (
              <span className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Total: <span style={{ color: COLORS.mediumBlue }}>{fmtC(totals.grand_total)}</span>
              </span>
            )}
            <Button type="button" onClick={handleSubmit} disabled={loading}
              className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm"
              style={{ background: loading ? '#94a3b8' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              {loading ? 'Saving…' : editingInv ? '✓ Update Invoice' : '✓ Create Invoice'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PANEL
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceDetailPanel = ({ invoice, open, onClose, onPayment, onEdit, onDelete, onDownloadPdf, isDark }) => {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (open && invoice) {
      api.get('/payments', { params: { invoice_id: invoice.id } })
        .then(r => setPayments(r.data || [])).catch(() => setPayments([]));
    }
  }, [open, invoice?.id]);

  if (!invoice) return null;
  const meta = getStatusMeta(invoice);
  const isInterstate = invoice.is_interstate;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Invoice Detail</DialogTitle>
        <DialogDescription className="sr-only">Invoice details</DialogDescription>
        <div className="px-7 py-5 relative overflow-hidden flex-shrink-0" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Receipt className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-white font-bold text-lg leading-tight">{invoice.invoice_no}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
                </div>
                <p className="text-white/60 text-sm">{invoice.client_name}</p>
                <p className="text-white/40 text-xs mt-0.5">{invoice.invoice_date} · {INV_TYPES.find(t => t.value === invoice.invoice_type)?.label || 'Tax Invoice'}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-3">
            {[['Invoice Total', invoice.grand_total, 'text-white'], ['Amount Paid', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([label, val, cls]) => (
              <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5">
                <p className="text-white/50 text-[9px] uppercase tracking-wider mb-1">{label}</p>
                <p className={`font-bold text-base ${cls}`}>{fmtC(val)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">
            <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Line Items ({invoice.items?.length || 0})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>
                      {['#','Description','HSN','Qty','Rate','Taxable', isInterstate ? 'IGST' : 'CGST+SGST','Total'].map(h => (
                        <th key={h} className={`px-3 py-2.5 text-left font-bold uppercase tracking-wider text-[9px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.items || []).map((it, i) => (
                      <tr key={i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/20' : 'border-slate-100 hover:bg-slate-50'}`}>
                        <td className={`px-3 py-2.5 font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{i+1}</td>
                        <td className={`px-3 py-2.5 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{it.description}</td>
                        <td className={`px-3 py-2.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{it.hsn_sac || '—'}</td>
                        <td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{it.quantity} {it.unit}</td>
                        <td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{fmtC(it.unit_price)}</td>
                        <td className={`px-3 py-2.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{fmtC(it.taxable_value)}</td>
                        <td className="px-3 py-2.5 text-amber-600 font-medium">
                          {isInterstate ? fmtC(it.igst_amount) : fmtC((it.cgst_amount || 0) + (it.sgst_amount || 0))}
                        </td>
                        <td className={`px-3 py-2.5 font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(it.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`px-5 py-3 space-y-1.5 border-t ${isDark ? 'border-slate-700 bg-slate-700/20' : 'border-slate-100 bg-slate-50/50'}`}>
                {[
                  ['Taxable Value', invoice.total_taxable],
                  isInterstate ? ['IGST', invoice.total_igst] : null,
                  !isInterstate ? ['CGST', invoice.total_cgst] : null,
                  !isInterstate ? ['SGST', invoice.total_sgst] : null,
                  invoice.shipping_charges > 0 ? ['Shipping', invoice.shipping_charges] : null,
                ].filter(Boolean).map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span>
                    <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{fmtC(val)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-600">
                  <span className="text-sm font-bold" style={{ color: COLORS.deepBlue }}>Grand Total</span>
                  <span className="text-lg font-black" style={{ color: COLORS.mediumBlue }}>{fmtC(invoice.grand_total)}</span>
                </div>
              </div>
            </div>

            {payments.length > 0 && (
              <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Payment History ({payments.length})</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {payments.map(p => (
                    <div key={p.id} className={`flex items-center justify-between px-5 py-3 ${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(p.amount)}</p>
                          <p className="text-xs text-slate-400">{p.payment_date} · {p.payment_mode.toUpperCase()}{p.reference_no && ` · ${p.reference_no}`}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(invoice.notes || invoice.terms_conditions) && (
              <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
                {invoice.notes && <><p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Notes</p><p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{invoice.notes}</p></>}
                {invoice.terms_conditions && <><p className={`text-[10px] font-bold uppercase tracking-widest mt-3 mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>T&C</p><p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{invoice.terms_conditions}</p></>}
              </div>
            )}
          </div>
        </div>

        <div className={`flex-shrink-0 flex items-center gap-2 px-7 py-4 border-t flex-wrap ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit?.(invoice); }} className="rounded-xl text-xs h-9 gap-1.5"><Edit className="h-3.5 w-3.5" /> Edit</Button>
          <Button variant="outline" size="sm" onClick={() => onDownloadPdf?.(invoice)} className="rounded-xl text-xs h-9 gap-1.5"><Download className="h-3.5 w-3.5" /> PDF</Button>
          {invoice.amount_due > 0 && (
            <Button size="sm" onClick={() => { onClose(); onPayment?.(invoice); }} className="rounded-xl text-xs h-9 gap-1.5 text-white"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>
              <IndianRupee className="h-3.5 w-3.5" /> Record Payment
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onDelete?.(invoice)} className="rounded-xl text-xs h-9 gap-1.5 text-red-500 hover:bg-red-50 ml-auto">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PRODUCT CATALOG MODAL
// ════════════════════════════════════════════════════════════════════════════════
const ProductModal = ({ open, onClose, isDark, onSaved }) => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) api.get('/products').then(r => setProducts(r.data || [])).catch(() => {});
  }, [open]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) await api.put(`/products/${editing.id}`, form);
      else await api.post('/products', form);
      toast.success(editing ? 'Product updated!' : 'Product created!');
      const r = await api.get('/products');
      setProducts(r.data || []);
      setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
      setEditing(null); onSaved?.();
    } catch { toast.error('Failed to save product'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/products/${id}`); setProducts(p => p.filter(x => x.id !== id)); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
        <DialogTitle className="sr-only">Product Catalog</DialogTitle>
        <DialogDescription className="sr-only">Manage products and services</DialogDescription>
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Product / Service Catalog</h2>
              <p className="text-xs text-slate-400">Reusable items for quick invoice creation</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className={`w-72 flex-shrink-0 p-5 border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/40'}`}>
            <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{editing ? 'Edit Item' : 'New Item'}</h4>
            <form onSubmit={handleSave} className="space-y-3">
              <Input className={inputCls} placeholder="Name *" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required />
              <Input className={inputCls} placeholder="Description" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
              <div className="grid grid-cols-2 gap-2">
                <Input className={inputCls} placeholder="HSN/SAC" value={form.hsn_sac} onChange={e => setForm(p => ({...p, hsn_sac: e.target.value}))} />
                <Select value={form.unit} onValueChange={v => setForm(p => ({...p, unit: v}))}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" className={inputCls} placeholder="Unit Price" value={form.unit_price} onChange={e => setForm(p => ({...p, unit_price: parseFloat(e.target.value)||0}))} />
                <Select value={String(form.gst_rate)} onValueChange={v => setForm(p => ({...p, gst_rate: parseFloat(v)}))}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}% GST</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input className={inputCls} placeholder="Category (optional)" value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} />
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} size="sm" className="flex-1 h-9 rounded-xl text-white text-xs font-semibold"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                  {loading ? 'Saving…' : editing ? 'Update' : 'Add Item'}
                </Button>
                {editing && <Button type="button" variant="ghost" size="sm" className="h-9 rounded-xl text-xs"
                  onClick={() => { setEditing(null); setForm({ name:'',description:'',hsn_sac:'',unit:'service',unit_price:0,gst_rate:18,category:'',is_service:true }); }}>Cancel</Button>}
              </div>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No products yet — add one!</p>
              </div>
            ) : products.map(p => (
              <div key={p.id} className={`flex items-center gap-3 px-5 py-3.5 border-b group transition-colors ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                  style={{ background: p.is_service ? `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` : 'linear-gradient(135deg, #065f46, #059669)' }}>
                  {p.is_service ? 'S' : 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p>
                  <p className="text-xs text-slate-400">{p.unit} · {fmtC(p.unit_price)} · GST {p.gst_rate}%{p.hsn_sac && ` · HSN ${p.hsn_sac}`}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(p); setForm({name:p.name,description:p.description||'',hsn_sac:p.hsn_sac||'',unit:p.unit||'service',unit_price:p.unit_price||0,gst_rate:p.gst_rate||18,category:p.category||'',is_service:p.is_service!==false}); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
export default function Invoicing() {
  const { user } = useAuth();
  const isDark   = useDark();
  const navigate = useNavigate();

  const [invoices,   setInvoices]   = useState([]);
  const [companies,  setCompanies]  = useState([]);
  const [clients,    setClients]    = useState([]);
  const [leads,      setLeads]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);

  const [formOpen,   setFormOpen]   = useState(false);
  const [editingInv, setEditingInv] = useState(null);
  const [detailInv,  setDetailInv]  = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payInv,     setPayInv]     = useState(null);
  const [payOpen,    setPayOpen]    = useState(false);
  const [catOpen,    setCatOpen]    = useState(false);
  const [vypOpen,    setVypOpen]    = useState(false); // ← NEW: VYP import modal

  const [searchInput,  setSearchInput]  = useState('');
  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !formOpen && !detailOpen && !payOpen && document.activeElement.tagName === 'BODY') setFormOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [formOpen, detailOpen, payOpen]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, compR, clientR, leadR, statR] = await Promise.all([
        api.get('/invoices'),
        api.get('/companies'),
        api.get('/clients'),
        api.get('/leads'),
        api.get('/invoices/stats'),
      ]);
      setInvoices(invR.data || []);
      setCompanies(compR.data || []);
      setClients(clientR.data || []);
      setLeads(leadR.data || []);
      setStats(statR.data || null);
    } catch { toast.error('Failed to load invoicing data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => invoices.filter(inv => {
    if (searchTerm && !inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) && !inv.client_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) return false;
    if (fromDate && inv.invoice_date < fromDate) return false;
    if (toDate   && inv.invoice_date > toDate)   return false;
    return true;
  }), [invoices, searchTerm, statusFilter, typeFilter, fromDate, toDate]);

  const enrichedFiltered = useMemo(() => filtered.map(inv => {
    if (inv.status === 'sent' && inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0)
      return { ...inv, status: 'overdue' };
    return inv;
  }), [filtered]);

  const handleEdit   = useCallback((inv) => { setEditingInv(inv); setFormOpen(true); }, []);
  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_no}?`)) return;
    try { await api.delete(`/invoices/${inv.id}`); toast.success('Invoice deleted'); fetchAll(); setDetailOpen(false); }
    catch { toast.error('Failed to delete'); }
  }, [fetchAll]);

  const handleDownloadPdf = useCallback(async (inv) => {
    try {
      const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const link = document.createElement('a');
      link.href = url; link.download = `invoice_${inv.invoice_no?.replace('/','_')}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch { toast.error('PDF generation failed — check company profile'); }
  }, []);

  const handleMarkSent = useCallback(async (inv) => {
    try { await api.post(`/invoices/${inv.id}/mark-sent`); fetchAll(); toast.success('Marked as sent'); }
    catch { toast.error('Failed'); }
  }, [fetchAll]);

  const handleExport = useCallback(() => {
    if (!enrichedFiltered.length) { toast.error('No invoices to export'); return; }
    const rows = [
      ['Invoice No','Type','Client','Date','Due Date','Taxable','GST','Total','Paid','Balance','Status'],
      ...enrichedFiltered.map(inv => [
        inv.invoice_no, INV_TYPES.find(t => t.value === inv.invoice_type)?.label || inv.invoice_type,
        inv.client_name, inv.invoice_date, inv.due_date, inv.total_taxable, inv.total_gst,
        inv.grand_total, inv.amount_paid, inv.amount_due, inv.status,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);
    toast.success(`Exported ${enrichedFiltered.length} invoices`);
  }, [enrichedFiltered]);

  return (
    <div className={`min-h-screen p-5 md:p-7 space-y-5 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>

      {/* ── PAGE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)` }}>
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 px-7 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0">
              <Receipt className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Invoicing & Billing</h1>
              <p className="text-sm text-blue-200 mt-0.5">
                GST-compliant invoices · Payments · Products ·{' '}
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">Ctrl+K</kbd> search ·{' '}
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">N</kbd> new
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* ── NEW: KhataBook Import Button ── */}
            <Button variant="outline" onClick={() => setVypOpen(true)}
              className="h-9 px-4 text-sm bg-emerald-500/20 border-emerald-300/40 text-white hover:bg-emerald-500/30 rounded-xl gap-2 backdrop-blur-sm font-semibold">
              <Database className="h-4 w-4" /> Import KhataBook
            </Button>
            <Button variant="outline" onClick={() => setCatOpen(true)}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <Package className="h-4 w-4" /> Catalog
            </Button>
            <Button variant="outline" onClick={handleExport}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => { setEditingInv(null); setFormOpen(true); }}
              className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0">
              <Plus className="h-4 w-4" /> New Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* ── STATS ── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Revenue"  value={fmtC(stats.total_revenue)}     sub={`${stats.total_invoices} invoices`}   icon={IndianRupee}  color={COLORS.mediumBlue}   bg={`${COLORS.mediumBlue}12`}   isDark={isDark} onClick={() => setStatusFilter('all')} />
          <StatCard label="Outstanding"    value={fmtC(stats.total_outstanding)} sub={`${stats.overdue_count} overdue`}     icon={AlertCircle}  color={COLORS.coral}        bg={`${COLORS.coral}15`}        isDark={isDark} onClick={() => setStatusFilter('overdue')} />
          <StatCard label="This Month"     value={fmtC(stats.month_revenue)}     sub={`${stats.month_invoices} invoices`}   icon={TrendingUp}   color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} isDark={isDark} />
          <StatCard label="Total GST"      value={fmtC(stats.total_gst)}         sub={`${stats.paid_count} paid · ${stats.draft_count} draft`} icon={Shield} color={COLORS.amber} bg={`${COLORS.amber}12`} isDark={isDark} />
        </div>
      )}

      {/* ── REVENUE CHART ── */}
      {stats?.monthly_trend?.length > 0 && (
        <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40"><BarChart3 className="h-4 w-4 text-blue-500" /></div>
              <div>
                <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Revenue Trend</h3>
                <p className="text-xs text-slate-400">Last 12 months</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded" style={{ background: COLORS.mediumBlue }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-px inline-block rounded border-t-2 border-dashed" style={{ borderColor: COLORS.emeraldGreen }} /> Collected</span>
            </div>
          </div>
          <RevenueChart trend={stats.monthly_trend} isDark={isDark} />
        </div>
      )}

      {/* ── FILTERS ── */}
      <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input ref={searchRef} placeholder="Search invoice no. or client… (Ctrl+K)"
              className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100 placeholder:text-slate-400' : 'bg-slate-50'}`}
              value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {enrichedFiltered.length} <span className="ml-1 font-normal text-slate-400">invoices</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto scrollbar-none flex-wrap">
          {/* FIX: all Select values use real strings, never '' */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={`h-9 w-[145px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <Input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span className="text-slate-400 text-xs">to</span>
            <Input type="date" className={`h-9 w-36 border-none rounded-xl text-xs ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          {(statusFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate || searchInput) && (
            <button onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setFromDate(''); setToDate(''); setSearchInput(''); }}
              className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-xl hover:bg-red-50 transition-colors">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── INVOICE TABLE ── */}
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
        <div className={`grid border-b px-5 py-3 ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}
          style={{ gridTemplateColumns: '1fr 1fr 110px 100px 100px 100px 100px 130px' }}>
          {['Invoice No','Client','Date','Total','Paid','Balance','Status','Actions'].map(h => (
            <div key={h} className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : enrichedFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
              <Receipt className="h-7 w-7 opacity-30" />
            </div>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No invoices found</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setEditingInv(null); setFormOpen(true); }} className="rounded-xl text-white text-xs"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Create Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={() => setVypOpen(true)} className="rounded-xl text-xs gap-1.5">
                <Database className="h-3.5 w-3.5" /> Import KhataBook
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {enrichedFiltered.map((inv) => {
              const meta = getStatusMeta(inv);
              const isOverdue = inv.status === 'overdue';
              return (
                <div key={inv.id}
                  className={`grid items-center px-5 py-3.5 border-b cursor-pointer group transition-colors last:border-0 ${isOverdue ? (isDark ? 'bg-red-900/10 border-red-900/20' : 'bg-red-50/30 border-red-100') : ''} ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50/60'}`}
                  style={{ gridTemplateColumns: '1fr 1fr 110px 100px 100px 100px 100px 130px' }}
                  onClick={() => { setDetailInv(inv); setDetailOpen(true); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: meta.hex }} />
                    <div>
                      <p className={`text-sm font-bold font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{inv.invoice_no}</p>
                      <p className="text-[10px] text-slate-400">{INV_TYPES.find(t => t.value === inv.invoice_type)?.label || 'Tax Invoice'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      {inv.client_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{inv.client_name}</p>
                      {inv.client_gstin && <p className="text-[10px] text-slate-400 font-mono truncate">{inv.client_gstin}</p>}
                    </div>
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{inv.invoice_date}</p>
                    <p className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>Due: {inv.due_date}</p>
                  </div>
                  <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(inv.grand_total)}</p>
                  <p className={`text-sm font-semibold ${inv.amount_paid > 0 ? 'text-emerald-600' : (isDark ? 'text-slate-500' : 'text-slate-300')}`}>{fmtC(inv.amount_paid)}</p>
                  <p className={`text-sm font-semibold ${inv.amount_due > 0 ? (isOverdue ? 'text-red-500' : 'text-amber-600') : 'text-slate-300'}`}>{fmtC(inv.amount_due)}</p>
                  <StatusPill inv={inv} />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDownloadPdf(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="PDF"><Download className="h-3.5 w-3.5" /></button>
                    {inv.amount_due > 0 && (
                      <button onClick={() => { setPayInv(inv); setPayOpen(true); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors" title="Payment"><IndianRupee className="h-3.5 w-3.5" /></button>
                    )}
                    {inv.status === 'draft' && (
                      <button onClick={() => handleMarkSent(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Mark Sent"><Send className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => handleEdit(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit"><Edit className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(inv)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {enrichedFiltered.length > 0 && (
          <div className={`flex items-center justify-between px-5 py-3 border-t ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/50'}`}>
            <div className="flex items-center gap-6 text-xs">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                Showing <span className="font-bold">{enrichedFiltered.length}</span> invoices
              </span>
              <span className="font-semibold text-emerald-600">Total: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.grand_total || 0), 0))}</span>
              <span className="font-semibold text-amber-600">Outstanding: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.amount_due || 0), 0))}</span>
              <span className="font-semibold" style={{ color: COLORS.mediumBlue }}>GST: {fmtC(enrichedFiltered.reduce((s, i) => s + (i.total_gst || 0), 0))}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── TOP CLIENTS ── */}
      {stats?.top_clients?.length > 0 && (
        <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/40"><Star className="h-4 w-4 text-yellow-500" /></div>
            <div>
              <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Top Clients by Revenue</h3>
              <p className="text-xs text-slate-400">Based on all invoices</p>
            </div>
          </div>
          <div className="space-y-3">
            {stats.top_clients.map((c, i) => {
              const pct = stats.total_revenue > 0 ? (c.revenue / stats.total_revenue) * 100 : 0;
              return (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ background: i === 0 ? 'linear-gradient(135deg, #b45309, #d97706)' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{c.name}</p>
                      <p className="text-sm font-bold flex-shrink-0 ml-3" style={{ color: COLORS.mediumBlue }}>{fmtC(c.revenue)}</p>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DIALOGS ── */}
      <InvoiceForm open={formOpen} onClose={() => { setFormOpen(false); setEditingInv(null); }}
        editingInv={editingInv} companies={companies} clients={clients} leads={leads}
        onSuccess={fetchAll} isDark={isDark} />

      <InvoiceDetailPanel invoice={detailInv} open={detailOpen} onClose={() => setDetailOpen(false)}
        onPayment={(inv) => { setPayInv(inv); setPayOpen(true); }}
        onEdit={handleEdit} onDelete={handleDelete} onDownloadPdf={handleDownloadPdf} isDark={isDark} />

      <PaymentModal invoice={payInv} open={payOpen} onClose={() => { setPayOpen(false); setPayInv(null); }}
        onSuccess={fetchAll} isDark={isDark} />

      <ProductModal open={catOpen} onClose={() => setCatOpen(false)} isDark={isDark} onSaved={() => {}} />

      {/* ── NEW: KhataBook VYP Import Modal ── */}
      <VypImportModal open={vypOpen} onClose={() => setVypOpen(false)}
        isDark={isDark} companies={companies} onImportComplete={fetchAll} />
    </div>
  );
}
