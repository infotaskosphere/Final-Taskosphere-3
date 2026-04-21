import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  Download, Search, RefreshCw, FileSearch, ChevronDown, ChevronUp,
  ArrowLeftRight, Info, Filter, X, Eye, BookOpen, Globe
} from 'lucide-react';
import { toast } from 'sonner';

/* ─────────────────────────────────────────────────────────────────────────────
   PARSING UTILITIES
───────────────────────────────────────────────────────────────────────────── */

/**
 * Normalise invoice number: uppercase, trim, strip leading zeros for numeric
 */
function normaliseInvoice(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim().toUpperCase().replace(/\s+/g, '');
  // Strip leading zeros only if purely numeric
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  return s;
}

function normaliseGSTIN(val) {
  if (!val) return '';
  return String(val).trim().toUpperCase();
}

function toNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatDate(val) {
  if (!val) return '';
  // Excel date serial number
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}`;
    } catch (_) {}
  }
  // Already a string
  const s = String(val).trim();
  if (!s || s === 'undefined') return '';
  return s;
}

/**
 * Find the row index that looks like a header row by searching for a cell
 * containing "GSTIN" in one of the first 3 columns.
 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(row.length, 5); c++) {
      const cell = String(row[c] || '').toLowerCase();
      if (cell.includes('gstin') && (cell.includes('supplier') || cell.includes('of supplier'))) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Map column names to indices from a header row array
 */
function buildColMap(headerRow) {
  const map = {};
  if (!headerRow) return map;
  headerRow.forEach((cell, idx) => {
    if (cell) {
      const key = String(cell).trim().toLowerCase();
      map[key] = idx;
    }
  });
  return map;
}

/**
 * Find column index by partial key match
 */
function findCol(colMap, ...keys) {
  for (const k of keys) {
    for (const [col, idx] of Object.entries(colMap)) {
      if (col.includes(k.toLowerCase())) return idx;
    }
  }
  return -1;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PARSE BOOKS / PURCHASE REGISTER (GSTR-2 offline tool format)
   Sheet: b2b
   Row 0: Summary header row
   Row 1: Summary values
   Row 2: Column headers
   Row 3+: Data
───────────────────────────────────────────────────────────────────────────── */
function parseBooksFile(workbook) {
  // Try to find 'b2b' sheet (case-insensitive)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === 'b2b'
  ) || workbook.SheetNames[0];

  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row
  let headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) headerIdx = 2; // fallback

  const colMap = buildColMap(rows[headerIdx]);

  // Find column indices
  const gstinCol  = findCol(colMap, 'gstin of supplier', 'gstin');
  const invNoCol  = findCol(colMap, 'invoice number', 'invoice no');
  const invDateCol = findCol(colMap, 'invoice date', 'date');
  const invValCol = findCol(colMap, 'invoice value');
  const taxableCol = findCol(colMap, 'taxable value');
  const igstCol   = findCol(colMap, 'integrated tax paid', 'integrated tax');
  const cgstCol   = findCol(colMap, 'central tax paid', 'central tax');
  const sgstCol   = findCol(colMap, 'state/ut tax paid', 'state/ut tax', 'state tax');
  const cessCol   = findCol(colMap, 'cess paid', 'cess');
  const posCol    = findCol(colMap, 'place of supply', 'place');
  const rcCol     = findCol(colMap, 'reverse charge');
  const typeCol   = findCol(colMap, 'invoice type', 'type');
  const rateCol   = findCol(colMap, 'rate');

  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const gstin = normaliseGSTIN(r[gstinCol]);
    const invNo = normaliseInvoice(r[invNoCol]);
    if (!gstin || !invNo || gstin === 'GSTIN OF SUPPLIER') continue;
    // Skip clearly blank rows
    if (gstin.length < 10) continue;

    data.push({
      gstin,
      invoiceNo: invNo,
      invoiceNoRaw: String(r[invNoCol] || '').trim(),
      invoiceDate: formatDate(r[invDateCol]),
      invoiceValue: toNumber(r[invValCol]),
      taxableValue: toNumber(r[taxableCol]),
      igst: toNumber(r[igstCol]),
      cgst: toNumber(r[cgstCol]),
      sgst: toNumber(r[sgstCol]),
      cess: toNumber(r[cessCol]),
      placeOfSupply: String(r[posCol] || '').trim(),
      reverseCharge: String(r[rcCol] || '').trim(),
      invoiceType: String(r[typeCol] || '').trim(),
      rate: toNumber(r[rateCol]),
      tradeOrLegalName: '', // not in books format
      source: 'books',
    });
  }
  return data;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PARSE GST PORTAL FILE (GSTR-2B Excel download)
   Sheet: B2B (or first sheet)
   Row 4: Upper headers (GSTIN, Trade Name, merged, Place of Supply, ...)
   Row 5: Sub-headers (Invoice number, Invoice type, Invoice Date, Invoice Value, ...)
   Row 6+: Data
───────────────────────────────────────────────────────────────────────────── */
function parseGSTPortalFile(workbook) {
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === 'B2B'
  ) || workbook.SheetNames[0];

  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header rows: look for row where col 0 = "GSTIN of supplier"
  let upperHeaderIdx = -1;
  let subHeaderIdx   = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cell0 = String(rows[i]?.[0] || '').toLowerCase();
    if (cell0.includes('gstin') && cell0.includes('supplier')) {
      upperHeaderIdx = i;
      subHeaderIdx   = i + 1;
      break;
    }
  }
  if (upperHeaderIdx === -1) {
    // Fallback: row 4 upper, row 5 sub
    upperHeaderIdx = 4;
    subHeaderIdx   = 5;
  }

  // GST portal uses merged/split headers across two rows
  // Upper row: col 0=GSTIN, col 1=Trade/Legal, cols 2-5=Invoice details merged, col 6=PlaceOfSupply, col 7=ReverseCharge, col 8=TaxableValue, cols 9-12=TaxAmount merged
  // Sub row:   col 2=InvoiceNo, col 3=InvoiceType, col 4=InvoiceDate, col 5=InvoiceValue, col 9=IGST, col 10=CGST, col 11=SGST, col 12=Cess

  const upper = rows[upperHeaderIdx] || [];
  const sub   = rows[subHeaderIdx]   || [];

  // Build a combined map: use sub-header if non-null, else upper
  const combined = [];
  const maxLen = Math.max(upper.length, sub.length);
  for (let i = 0; i < maxLen; i++) {
    combined.push(sub[i] || upper[i] || null);
  }

  const colMap = buildColMap(combined);

  // Also add upper row entries to colMap for columns that have no sub-header
  const upperMap = buildColMap(upper);
  Object.assign(colMap, { ...upperMap, ...colMap });

  // Known column positions for GSTR-2B (fallback if header detection fails)
  const gstinCol   = findCol(colMap, 'gstin of supplier', 'gstin') >= 0
                       ? findCol(colMap, 'gstin of supplier', 'gstin') : 0;
  const nameCol    = findCol(colMap, 'trade/legal', 'trade name', 'legal name') >= 0
                       ? findCol(colMap, 'trade/legal', 'trade name', 'legal name') : 1;
  const invNoCol   = findCol(colMap, 'invoice number', 'invoice no') >= 0
                       ? findCol(colMap, 'invoice number', 'invoice no') : 2;
  const typeCol    = findCol(colMap, 'invoice type') >= 0
                       ? findCol(colMap, 'invoice type') : 3;
  const dateCol    = findCol(colMap, 'invoice date') >= 0
                       ? findCol(colMap, 'invoice date') : 4;
  const valCol     = findCol(colMap, 'invoice value') >= 0
                       ? findCol(colMap, 'invoice value') : 5;
  const posCol     = findCol(colMap, 'place of supply') >= 0
                       ? findCol(colMap, 'place of supply') : 6;
  const rcCol      = findCol(colMap, 'reverse charge', 'supply attract') >= 0
                       ? findCol(colMap, 'reverse charge', 'supply attract') : 7;
  const taxableCol = findCol(colMap, 'taxable value') >= 0
                       ? findCol(colMap, 'taxable value') : 8;
  const igstCol    = findCol(colMap, 'integrated tax') >= 0
                       ? findCol(colMap, 'integrated tax') : 9;
  const cgstCol    = findCol(colMap, 'central tax') >= 0
                       ? findCol(colMap, 'central tax') : 10;
  const sgstCol    = findCol(colMap, 'state/ut tax', 'state tax') >= 0
                       ? findCol(colMap, 'state/ut tax', 'state tax') : 11;
  const cessCol    = findCol(colMap, 'cess') >= 0
                       ? findCol(colMap, 'cess') : 12;
  const itcCol     = findCol(colMap, 'itc availability', 'itc avail');
  const filingDateCol = findCol(colMap, 'filing date', 'gstr-1');
  const periodCol  = findCol(colMap, 'period', 'gstr-1/1a');

  const data = [];
  const dataStart = subHeaderIdx + 1;

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const gstin = normaliseGSTIN(r[gstinCol]);
    const invNo = normaliseInvoice(r[invNoCol]);
    if (!gstin || !invNo) continue;
    if (gstin.length < 10 || gstin.includes('GSTIN')) continue;

    data.push({
      gstin,
      invoiceNo: invNo,
      invoiceNoRaw: String(r[invNoCol] || '').trim(),
      invoiceDate: formatDate(r[dateCol]),
      invoiceValue: toNumber(r[valCol]),
      taxableValue: toNumber(r[taxableCol]),
      igst: toNumber(r[igstCol]),
      cgst: toNumber(r[cgstCol]),
      sgst: toNumber(r[sgstCol]),
      cess: toNumber(r[cessCol]),
      placeOfSupply: String(r[posCol] || '').trim(),
      reverseCharge: String(r[rcCol] || '').trim(),
      invoiceType: String(r[typeCol] || '').trim(),
      tradeOrLegalName: String(r[nameCol] || '').trim(),
      itcAvailability: String(r[itcCol] || '').trim(),
      filingDate: formatDate(r[filingDateCol]),
      period: String(r[periodCol] || '').trim(),
      source: 'portal',
    });
  }
  return data;
}

/* ─────────────────────────────────────────────────────────────────────────────
   RECONCILIATION ENGINE
───────────────────────────────────────────────────────────────────────────── */
const TOLERANCE = 1.01; // ₹1 rounding tolerance

function reconcile(portalData, booksData) {
  const portalMap = new Map();
  const booksMap  = new Map();

  portalData.forEach((inv) => {
    const key = `${inv.gstin}__${inv.invoiceNo}`;
    if (!portalMap.has(key)) portalMap.set(key, inv);
  });

  booksData.forEach((inv) => {
    const key = `${inv.gstin}__${inv.invoiceNo}`;
    if (!booksMap.has(key)) booksMap.set(key, inv);
  });

  const matched       = [];
  const mismatch      = [];
  const portalOnly    = [];
  const booksOnly     = [];

  // Check portal entries
  portalMap.forEach((portalInv, key) => {
    if (booksMap.has(key)) {
      const booksInv = booksMap.get(key);
      const diff = Math.abs(portalInv.invoiceValue - booksInv.invoiceValue);
      const taxDiff = Math.abs(
        (portalInv.igst + portalInv.cgst + portalInv.sgst) -
        (booksInv.igst + booksInv.cgst + booksInv.sgst)
      );
      if (diff <= TOLERANCE && taxDiff <= TOLERANCE) {
        matched.push({ portal: portalInv, books: booksInv, key });
      } else {
        mismatch.push({
          portal: portalInv, books: booksInv, key,
          valueDiff: portalInv.invoiceValue - booksInv.invoiceValue,
          taxDiff:
            (portalInv.igst + portalInv.cgst + portalInv.sgst) -
            (booksInv.igst + booksInv.cgst + booksInv.sgst),
        });
      }
    } else {
      portalOnly.push({ portal: portalInv, key });
    }
  });

  // Check books-only entries
  booksMap.forEach((booksInv, key) => {
    if (!portalMap.has(key)) {
      booksOnly.push({ books: booksInv, key });
    }
  });

  return { matched, mismatch, portalOnly, booksOnly };
}

/* ─────────────────────────────────────────────────────────────────────────────
   EXPORT TO EXCEL
───────────────────────────────────────────────────────────────────────────── */
function exportToExcel(results, period) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ['GST Reconciliation Report', '', period || ''],
    ['Generated on', new Date().toLocaleDateString('en-IN')],
    [],
    ['Category', 'Count', 'Total Invoice Value (₹)', 'Total Tax (₹)'],
    [
      'Matched',
      results.matched.length,
      results.matched.reduce((s, r) => s + r.portal.invoiceValue, 0).toFixed(2),
      results.matched.reduce((s, r) => s + r.portal.igst + r.portal.cgst + r.portal.sgst, 0).toFixed(2),
    ],
    [
      'Amount Mismatch',
      results.mismatch.length,
      results.mismatch.reduce((s, r) => s + r.portal.invoiceValue, 0).toFixed(2),
      results.mismatch.reduce((s, r) => s + r.portal.igst + r.portal.cgst + r.portal.sgst, 0).toFixed(2),
    ],
    [
      'In Portal Only (Not in Books)',
      results.portalOnly.length,
      results.portalOnly.reduce((s, r) => s + r.portal.invoiceValue, 0).toFixed(2),
      results.portalOnly.reduce((s, r) => s + r.portal.igst + r.portal.cgst + r.portal.sgst, 0).toFixed(2),
    ],
    [
      'In Books Only (Not in Portal)',
      results.booksOnly.length,
      results.booksOnly.reduce((s, r) => s + r.books.invoiceValue, 0).toFixed(2),
      results.booksOnly.reduce((s, r) => s + r.books.igst + r.books.cgst + r.books.sgst, 0).toFixed(2),
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  // Matched
  const matchedHeaders = ['GSTIN', 'Trade/Legal Name', 'Invoice No', 'Invoice Date', 'Invoice Value (Portal)', 'Invoice Value (Books)', 'Tax (Portal)', 'Tax (Books)', 'Taxable Value (Portal)', 'Taxable Value (Books)'];
  const matchedRows = results.matched.map((r) => [
    r.portal.gstin, r.portal.tradeOrLegalName, r.portal.invoiceNoRaw,
    r.portal.invoiceDate, r.portal.invoiceValue, r.books.invoiceValue,
    r.portal.igst + r.portal.cgst + r.portal.sgst,
    r.books.igst + r.books.cgst + r.books.sgst,
    r.portal.taxableValue, r.books.taxableValue,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([matchedHeaders, ...matchedRows]), 'Matched');

  // Mismatch
  const mismatchHeaders = [...matchedHeaders, 'Invoice Value Diff', 'Tax Diff'];
  const mismatchRows = results.mismatch.map((r) => [
    r.portal.gstin, r.portal.tradeOrLegalName, r.portal.invoiceNoRaw,
    r.portal.invoiceDate, r.portal.invoiceValue, r.books.invoiceValue,
    r.portal.igst + r.portal.cgst + r.portal.sgst,
    r.books.igst + r.books.cgst + r.books.sgst,
    r.portal.taxableValue, r.books.taxableValue,
    r.valueDiff.toFixed(2), r.taxDiff.toFixed(2),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([mismatchHeaders, ...mismatchRows]), 'Mismatch');

  // Portal Only
  const portalOnlyHeaders = ['GSTIN', 'Trade/Legal Name', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Place of Supply', 'Filing Date', 'ITC Availability'];
  const portalOnlyRows = results.portalOnly.map((r) => [
    r.portal.gstin, r.portal.tradeOrLegalName, r.portal.invoiceNoRaw,
    r.portal.invoiceDate, r.portal.invoiceValue, r.portal.taxableValue,
    r.portal.igst, r.portal.cgst, r.portal.sgst, r.portal.cess,
    r.portal.placeOfSupply, r.portal.filingDate, r.portal.itcAvailability,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([portalOnlyHeaders, ...portalOnlyRows]), 'In Portal Only');

  // Books Only
  const booksOnlyHeaders = ['GSTIN', 'Invoice No', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Place of Supply', 'Invoice Type', 'Rate'];
  const booksOnlyRows = results.booksOnly.map((r) => [
    r.books.gstin, r.books.invoiceNoRaw,
    r.books.invoiceDate, r.books.invoiceValue, r.books.taxableValue,
    r.books.igst, r.books.cgst, r.books.sgst, r.books.cess,
    r.books.placeOfSupply, r.books.invoiceType, r.books.rate,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([booksOnlyHeaders, ...booksOnlyRows]), 'In Books Only');

  XLSX.writeFile(wb, `GST_Reconciliation_${period || 'Report'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ─────────────────────────────────────────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const SummaryCard = ({ label, value, sub, color, icon: Icon, onClick, active }) => (
  <motion.div
    whileHover={{ y: -2 }}
    onClick={onClick}
    className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
      active
        ? `${color.activeBg} ${color.activeBorder} shadow-md`
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-md'
    }`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className={`text-xs font-medium mb-1 ${active ? color.activeText : 'text-slate-500 dark:text-slate-400'}`}>
          {label}
        </p>
        <p className={`text-2xl font-bold ${active ? color.activeText : 'text-slate-800 dark:text-slate-100'}`}>
          {value}
        </p>
        {sub && (
          <p className={`text-xs mt-1 ${active ? color.activeText : 'text-slate-400'}`}>{sub}</p>
        )}
      </div>
      <div className={`p-2 rounded-lg ${active ? color.iconBg : color.iconBgDim}`}>
        <Icon className={`h-5 w-5 ${active ? color.iconColor : color.iconColorDim}`} />
      </div>
    </div>
  </motion.div>
);

const TABS = [
  {
    id: 'matched',
    label: 'Matched',
    color: {
      activeBg: 'bg-emerald-50 dark:bg-emerald-900/20',
      activeBorder: 'border-emerald-400',
      activeText: 'text-emerald-700 dark:text-emerald-300',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconBgDim: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconColorDim: 'text-slate-400',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    icon: CheckCircle2,
    desc: 'Invoices present in both GSTR-2B and Books of Account with matching amounts.',
  },
  {
    id: 'mismatch',
    label: 'Amount Mismatch',
    color: {
      activeBg: 'bg-amber-50 dark:bg-amber-900/20',
      activeBorder: 'border-amber-400',
      activeText: 'text-amber-700 dark:text-amber-300',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconBgDim: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconColorDim: 'text-slate-400',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    icon: AlertTriangle,
    desc: 'Invoice numbers match but invoice value or tax amount differs between Portal and Books.',
  },
  {
    id: 'portalOnly',
    label: 'In Portal Only',
    color: {
      activeBg: 'bg-blue-50 dark:bg-blue-900/20',
      activeBorder: 'border-blue-400',
      activeText: 'text-blue-700 dark:text-blue-300',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      iconBgDim: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconColorDim: 'text-slate-400',
      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
    icon: Globe,
    desc: 'Vendor has uploaded to GST Portal but invoice not recorded in Books. These need to be booked.',
  },
  {
    id: 'booksOnly',
    label: 'In Books Only',
    color: {
      activeBg: 'bg-rose-50 dark:bg-rose-900/20',
      activeBorder: 'border-rose-400',
      activeText: 'text-rose-700 dark:text-rose-300',
      iconBg: 'bg-rose-100 dark:bg-rose-900/40',
      iconBgDim: 'bg-slate-100 dark:bg-slate-700',
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconColorDim: 'text-slate-400',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    },
    icon: BookOpen,
    desc: 'Invoice is in Books of Account but vendor has NOT uploaded to GST Portal. ITC may not be available.',
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   FILE UPLOAD DROPZONE
───────────────────────────────────────────────────────────────────────────── */
const DropZone = ({ label, icon: Icon, color, file, onFile, onClear, hint }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  const handleChange = (e) => {
    const f = e.target.files[0];
    if (f) onFile(f);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed transition-all duration-200 p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]
        ${file
          ? `${color.doneBg} ${color.doneBorder} cursor-default`
          : dragging
            ? `${color.dragBg} ${color.dragBorder} cursor-copy scale-[1.01]`
            : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />

      <div className={`p-3 rounded-full ${file ? color.doneIconBg : 'bg-slate-200 dark:bg-slate-700'}`}>
        {file
          ? <CheckCircle2 className={`h-6 w-6 ${color.doneIconColor}`} />
          : <Icon className="h-6 w-6 text-slate-400" />
        }
      </div>

      <div className="text-center">
        <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">{label}</p>
        {file ? (
          <div className="flex items-center gap-2 mt-1 justify-center flex-wrap">
            <span className={`text-xs font-medium ${color.doneText} truncate max-w-[180px]`}>{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-0.5 rounded hover:bg-white/50 transition-colors"
            >
              <X className={`h-3.5 w-3.5 ${color.doneText}`} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400 mt-1">{hint}</p>
        )}
      </div>

      {!file && (
        <button
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${color.btnBg} ${color.btnText}`}
        >
          Browse File
        </button>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   RESULT TABLE
───────────────────────────────────────────────────────────────────────────── */
const PAGE_SIZE = 50;

const ResultTable = ({ tabId, records, tabMeta }) => {
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [sortCol, setSortCol]     = useState(null);
  const [sortDir, setSortDir]     = useState('asc');
  const [expandedRow, setExpanded] = useState(null);

  const filtered = records.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const inv = tabId === 'booksOnly' ? r.books : r.portal;
    return (
      (inv?.gstin || '').toLowerCase().includes(q) ||
      (inv?.invoiceNoRaw || '').toLowerCase().includes(q) ||
      (inv?.tradeOrLegalName || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const totalValue = records.reduce((s, r) => {
    const inv = tabId === 'booksOnly' ? r.books : r.portal;
    return s + (inv?.invoiceValue || 0);
  }, 0);
  const totalTax = records.reduce((s, r) => {
    const inv = tabId === 'booksOnly' ? r.books : r.portal;
    return s + (inv?.igst || 0) + (inv?.cgst || 0) + (inv?.sgst || 0);
  }, 0);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <CheckCircle2 className="h-12 w-12 mb-3 text-slate-300" />
        <p className="font-medium text-slate-500 dark:text-slate-400">No records in this category</p>
        <p className="text-sm mt-1">Great — nothing to reconcile here!</p>
      </div>
    );
  }

  return (
    <div>
      {/* Totals bar */}
      <div className="flex flex-wrap gap-4 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total Records: </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{records.length}</span>
        </div>
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total Invoice Value: </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">₹{fmt(totalValue)}</span>
        </div>
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total Tax: </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">₹{fmt(totalTax)}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by GSTIN, Invoice No, Party Name…"
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">#</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">GSTIN</th>
              {tabId !== 'booksOnly' && (
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Party Name</th>
              )}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Invoice No</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Date</th>

              {tabId === 'mismatch' ? (
                <>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Portal Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Books Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">Diff (₹)</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Portal Tax</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Books Tax</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">Tax Diff (₹)</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Invoice Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Taxable Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">IGST</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">CGST</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">SGST</th>
                  {tabId === 'portalOnly' && (
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">ITC</th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => {
              const inv = tabId === 'booksOnly' ? r.books : r.portal;
              const rowNum = (page - 1) * PAGE_SIZE + idx + 1;

              return (
                <tr
                  key={r.key || idx}
                  className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-3 py-2 text-slate-400">{rowNum}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{inv?.gstin}</td>
                  {tabId !== 'booksOnly' && (
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[150px] truncate" title={inv?.tradeOrLegalName}>
                      {inv?.tradeOrLegalName || '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{inv?.invoiceNoRaw}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{inv?.invoiceDate}</td>

                  {tabId === 'mismatch' ? (
                    <>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(r.portal.invoiceValue)}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(r.books.invoiceValue)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.valueDiff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {r.valueDiff > 0 ? '+' : ''}{fmt(r.valueDiff)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">₹{fmt(r.portal.igst + r.portal.cgst + r.portal.sgst)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">₹{fmt(r.books.igst + r.books.cgst + r.books.sgst)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.taxDiff > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {r.taxDiff > 0 ? '+' : ''}{fmt(r.taxDiff)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(inv?.invoiceValue)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">₹{fmt(inv?.taxableValue)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.igst)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.cgst)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.sgst)}</td>
                      {tabId === 'portalOnly' && (
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            inv?.itcAvailability?.toLowerCase() === 'yes'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {inv?.itcAvailability || '—'}
                          </span>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-500 text-xs">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Previous
            </button>
            <span className="text-slate-500 text-xs">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function GSTReconciliation() {
  const [portalFile, setPortalFile]   = useState(null);
  const [booksFile, setBooksFile]     = useState(null);
  const [period, setPeriod]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [results, setResults]         = useState(null);
  const [activeTab, setActiveTab]     = useState('matched');

  /* ── File reading ── */
  const readWorkbook = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false, raw: false });
          resolve(wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

  /* ── Reconcile ── */
  const handleReconcile = async () => {
    if (!portalFile || !booksFile) {
      toast.error('Please upload both files before reconciling.');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const [portalWB, booksWB] = await Promise.all([
        readWorkbook(portalFile),
        readWorkbook(booksFile),
      ]);

      const portalData = parseGSTPortalFile(portalWB);
      const booksData  = parseBooksFile(booksWB);

      if (portalData.length === 0 && booksData.length === 0) {
        toast.error('Could not parse data from the uploaded files. Please check the file formats.');
        setLoading(false);
        return;
      }

      const res = reconcile(portalData, booksData);
      setResults(res);
      setActiveTab('matched');
      toast.success(`Reconciliation complete — ${portalData.length} portal + ${booksData.length} books invoices processed.`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to process files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPortalFile(null);
    setBooksFile(null);
    setResults(null);
    setPeriod('');
  };

  const activeTabMeta  = TABS.find(t => t.id === activeTab);
  const activeRecords  = results
    ? { matched: results.matched, mismatch: results.mismatch, portalOnly: results.portalOnly, booksOnly: results.booksOnly }[activeTab] || []
    : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
                <ArrowLeftRight className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">GST Reconciliation</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">
              Reconcile GSTR-2B (GST Portal) with Purchase Register (Books of Account)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {results && (
              <>
                <button
                  onClick={() => exportToExcel(results, period)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Upload Section ── */}
        {!results && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <Upload className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="font-semibold text-slate-700 dark:text-slate-200">Upload Files</h2>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Tax Period (optional)
              </label>
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="e.g. March 2026"
                className="w-full sm:w-64 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <DropZone
                label="GSTR-2B (GST Portal)"
                icon={Globe}
                hint="Download GSTR-2B Excel from GST portal"
                file={portalFile}
                onFile={setPortalFile}
                onClear={() => setPortalFile(null)}
                color={{
                  doneBg: 'bg-blue-50 dark:bg-blue-900/20',
                  doneBorder: 'border-blue-400',
                  doneText: 'text-blue-700 dark:text-blue-300',
                  doneIconBg: 'bg-blue-100 dark:bg-blue-900/40',
                  doneIconColor: 'text-blue-600',
                  dragBg: 'bg-blue-50 dark:bg-blue-900/10',
                  dragBorder: 'border-blue-400',
                  btnBg: 'bg-blue-600 hover:bg-blue-700',
                  btnText: 'text-white',
                }}
              />
              <DropZone
                label="Purchase Register (Books)"
                icon={BookOpen}
                hint="Export b2b sheet from your accounting software"
                file={booksFile}
                onFile={setBooksFile}
                onClear={() => setBooksFile(null)}
                color={{
                  doneBg: 'bg-violet-50 dark:bg-violet-900/20',
                  doneBorder: 'border-violet-400',
                  doneText: 'text-violet-700 dark:text-violet-300',
                  doneIconBg: 'bg-violet-100 dark:bg-violet-900/40',
                  doneIconColor: 'text-violet-600',
                  dragBg: 'bg-violet-50 dark:bg-violet-900/10',
                  dragBorder: 'border-violet-400',
                  btnBg: 'bg-violet-600 hover:bg-violet-700',
                  btnText: 'text-white',
                }}
              />
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-5 text-xs text-amber-700 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Supported formats: </span>
                <span>GSTR-2B Excel download from GST portal (.xlsx) and GSTR-2 offline tool Excel (.xls/.xlsx) with b2b sheet. Matching is done on GSTIN + Invoice Number combination.</span>
              </div>
            </div>

            <button
              onClick={handleReconcile}
              disabled={!portalFile || !booksFile || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-4 w-4" />
                  Reconcile Now
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* ── Results ── */}
        <AnimatePresence>
          {results && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {TABS.map((tab) => {
                  const count = results[tab.id]?.length || 0;
                  const val = (results[tab.id] || []).reduce((s, r) => {
                    const inv = tab.id === 'booksOnly' ? r.books : r.portal;
                    return s + (inv?.invoiceValue || 0);
                  }, 0);
                  return (
                    <SummaryCard
                      key={tab.id}
                      label={tab.label}
                      value={count}
                      sub={`₹${fmt(val)}`}
                      color={tab.color}
                      icon={tab.icon}
                      active={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                    />
                  );
                })}
              </div>

              {/* Tabs */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 px-2 pt-2">
                  {TABS.map((tab) => {
                    const count = results[tab.id]?.length || 0;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl whitespace-nowrap transition-all border-b-2 mr-1 ${
                          isActive
                            ? `border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20`
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab.color.badge}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-5">
                  {/* Tab description */}
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-4 text-xs">
                    <Info className={`h-4 w-4 mt-0.5 flex-shrink-0 ${activeTabMeta?.color.iconColor}`} />
                    <span className="text-slate-600 dark:text-slate-400">{activeTabMeta?.desc}</span>
                  </div>

                  <ResultTable
                    key={activeTab}
                    tabId={activeTab}
                    records={activeRecords}
                    tabMeta={activeTabMeta}
                  />
                </div>
              </div>

              {/* Re-upload button */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Start New Reconciliation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
