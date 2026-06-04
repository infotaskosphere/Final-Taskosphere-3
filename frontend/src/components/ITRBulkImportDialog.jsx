/**
 * ITRBulkImportDialog.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk-import ITR clients from the standard Income Tax software Excel export.
 *
 * SUPPORTED FORMAT  (auto-detected, row-index based):
 *   Row 0  – Title  e.g. "List of All Assessee's Returns for A.Y. '2025-26'"
 *   Row 1  – blank
 *   Row 2  – Headers: SN | Code | Name | PAN | Group | Status | ...
 *   Row 3  – Filter row  "(All)" values — SKIPPED automatically
 *   Row 4+ – Data rows
 *
 * Column mapping (0-based index):
 *   0  SN            → ignored
 *   1  Code          → stored in itr_data.code
 *   2  Name          → company_name / full_name
 *   3  PAN           → pan
 *   4  Group         → itr_data.group
 *   5  Status        → client_type  (Individual→proprietor, HUF→huf, Firm→partnership,
 *                                    Firm (Limited Liability)→llp, Private Ltd.→pvt_ltd,
 *                                    AOP (TRUST)→trust)
 *   6  Residential Status → itr_data.residential_status
 *   7  Ward          → itr_data.ward
 *   8  TAN           → itr_data.tan
 *   9  AADHAAR       → itr_data.aadhaar
 *  10  PAN-AADHAAR Linked → itr_data.pan_aadhaar_linked
 *  11  GSTIN         → gstin
 *  12  Father/Husband→ itr_data.father_husband
 *  13  DOB/DOI       → birthday  (DD/MM/YYYY → YYYY-MM-DD)
 *  14  Gender        → itr_data.gender
 *  15  Address       → address (full), city+state parsed from last segment
 *  16  Phone         → phone (fallback)
 *  17  Mobile        → phone (primary)
 *  18  EMail         → email
 *  19  A/c No        → itr_data.bank_account_no
 *  20  Bank Name     → itr_data.bank_name
 *  21  IFSC          → itr_data.ifsc_code
 *  22  No. of Bank   → ignored
 *  23  Passport      → itr_data.passport
 *  24  UserID        → itr_data.it_portal_user
 *  25  Password      → itr_data.it_portal_password
 *  26  Category      → itr_data.category
 *  27  Remark        → notes / itr_data.remarks
 *  28  AADHAAR Linked Mobile → ignored
 *  29  DIN           → itr_data.din
 *
 * Assessment Year is extracted from the title row (Row 0) when present,
 * defaulting to the current AY.
 *
 * Also handles any generic Excel/CSV with column headers mapping known fields.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  FileSpreadsheet, Upload, Download, CheckCircle2,
  XCircle, Loader2, AlertCircle, ChevronDown, ChevronUp,
  X, FileText, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TO_CLIENT_TYPE = {
  'individual':              'proprietor',
  'huf':                     'huf',
  'firm':                    'partnership',
  'firm (limited liability)':'llp',
  'private ltd.':            'pvt_ltd',
  'private limited':         'pvt_ltd',
  'pvt ltd':                 'pvt_ltd',
  'aop (trust)':             'trust',
  'aop':                     'trust',
  'trust':                   'trust',
  'proprietor':              'proprietor',
  'partnership':             'partnership',
  'llp':                     'llp',
};

const INDIAN_CITIES = [
  'SURAT','AHMEDABAD','MUMBAI','DELHI','PUNE','VADODARA','BARODA','RAJKOT',
  'NAVSARI','BHARUCH','ANAND','GANDHINAGAR','NADIAD','VALSAD','BILIMORA',
  'KOLKATA','CHENNAI','HYDERABAD','BENGALURU','BANGALORE','JAIPUR','LUCKNOW',
  'INDORE','BHOPAL','NAGPUR','COIMBATORE','PATNA','CHANDIGARH','THANE',
];

// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** DD/MM/YYYY or DD-MM-YYYY  →  YYYY-MM-DD (or null) */
function parseDOB(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

/** Clean phone: strip non-digits, drop leading 91 if 12 digits, return last 10 */
function cleanPhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g,'');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  return d.length >= 10 ? d.slice(-10) : (d || null);
}

/** Format Aadhaar as XXXX XXXX XXXX */
function formatAadhaar(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g,'');
  if (d.length !== 12) return d || null;
  return `${d.slice(0,4)} ${d.slice(4,8)} ${d.slice(8,12)}`;
}

/**
 * Parse address string into { address, city, state, pincode }.
 * Handles the Income Tax software format:
 *   "STREET, AREA, CITY, Locality S.O-PINCODE"
 *   "STREET, CITY-PINCODE"
 */
function parseAddress(raw) {
  if (!raw) return { address: '', city: 'Surat', state: 'Gujarat', pincode: '' };
  const s = String(raw).trim();

  // Extract 6-digit pincode at end (preceded by - or space)
  const pinMatch = s.match(/[- ](\d{6})\s*$/);
  const pincode = pinMatch ? pinMatch[1] : '';

  // Remove trailing "Locality S.O-PINCODE" or "CityName-PINCODE" segment
  let clean = s.replace(/,?\s*[\w\s\.\(\)\/\\-]+[- ]\d{6}\s*$/, '').trim().replace(/,\s*$/, '').trim();

  // Detect city
  let city = '';
  const upper = s.toUpperCase();
  for (const c of INDIAN_CITIES) {
    if (upper.includes(c)) { city = c.charAt(0) + c.slice(1).toLowerCase(); break; }
  }
  if (!city) city = 'Surat'; // default for this CA's client base

  return { address: clean, city, state: 'Gujarat', pincode };
}

/**
 * Extract Assessment Year from the title string.
 * e.g. "List of All Assessee's Returns for A.Y. '2025-26'" → "2025-26"
 */
function extractAY(title) {
  if (!title) return null;
  const m = String(title).match(/A\.?Y\.?\s*['\u2018\u2019]?(\d{4}-\d{2,4})/i);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core parser: reads the standard IT-software Excel format
// ─────────────────────────────────────────────────────────────────────────────

function parseITRExcel(workbook) {
  const results = [];
  let detectedAY = null;

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    // Use header:1 to get raw array-of-arrays
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rawRows.length < 3) continue;

    // Row 0: title → extract AY
    const titleCell = String(rawRows[0]?.[0] || '');
    if (!detectedAY) detectedAY = extractAY(titleCell);

    // Row 2: headers  (0-indexed)
    const headerRow = rawRows[2] || [];
    const isStandardFormat = headerRow.some(h =>
      String(h).replace(/\s+/g,'').toLowerCase().includes('pan')
    );

    if (isStandardFormat) {
      // Standard IT-software format: columns by fixed index (rows 4+)
      // Row 3 is the "(All)" filter row — skip it
      for (let ri = 4; ri < rawRows.length; ri++) {
        const r = rawRows[ri];
        const name = String(r[2] || '').trim();
        const pan  = String(r[3] || '').trim().toUpperCase();

        // Skip blank or filter rows
        if (!name && !pan) continue;
        if (pan === '(ALL)' || name === '(ALL)') continue;

        const rawStatus = String(r[5] || '').trim().toLowerCase();
        const clientType = STATUS_TO_CLIENT_TYPE[rawStatus] || 'proprietor';

        const mobile = cleanPhone(r[17]) || cleanPhone(r[16]);
        const { address, city, state, pincode } = parseAddress(r[15]);
        const aadhaar = formatAadhaar(r[9]);
        const dob = parseDOB(r[13]);

        results.push({
          // Core fields
          company_name: name,
          pan,
          client_type: clientType,
          email: String(r[18] || '').trim().toLowerCase() || null,
          phone: mobile,
          address,
          city,
          state,
          birthday: dob,
          gstin: String(r[11] || '').trim() || null,
          notes: String(r[27] || '').trim() || null,
          status: 'active',
          services: ['Income Tax'],
          is_itr_client: true,
          // ITR-specific data
          itr_data: {
            assessment_year: detectedAY || '2025-26',
            itr_type: 'ITR-1',         // default; user can edit after import
            filing_status: 'pending',   // default
            aadhaar,
            code: String(r[1] || '').trim() || null,
            group: String(r[4] || '').trim() || null,
            residential_status: String(r[6] || '').trim() || null,
            ward: String(r[7] || '').trim() || null,
            tan: String(r[8] || '').trim() || null,
            pan_aadhaar_linked: String(r[10] || '').trim() || null,
            father_husband: String(r[12] || '').trim() || null,
            gender: String(r[14] || '').trim() || null,
            passport: String(r[23] || '').trim() || null,
            it_portal_user: String(r[24] || '').trim() || null,
            it_portal_password: String(r[25] || '').trim() || null,
            category: String(r[26] || '').trim() || null,
            remarks: String(r[27] || '').trim() || null,
            din: String(r[29] || '').trim() || null,
            bank_account_no: String(r[19] || '').trim() || null,
            bank_name: String(r[20] || '').trim() || null,
            ifsc_code: String(r[21] || '').trim() || null,
            pincode,
            company_links: [],
          },
        });
      }
    } else {
      // Generic format: map by header name
      const colMap = {};
      headerRow.forEach((h, i) => {
        const key = String(h).toLowerCase().replace(/[\s\-_\/\r\n]+/g, '_').trim();
        colMap[key] = i;
      });
      const g = (row, ...keys) => {
        for (const k of keys) {
          if (colMap[k] !== undefined) {
            const v = String(row[colMap[k]] || '').trim();
            if (v) return v;
          }
        }
        return '';
      };

      for (let ri = 1; ri < rawRows.length; ri++) {
        const r = rawRows[ri];
        const name = g(r,'name','full_name','assessee_name');
        const pan  = g(r,'pan','pan_number','pan_no').toUpperCase();
        if (!name && !pan) continue;

        const rawStatus = g(r,'status','client_type').toLowerCase();
        const clientType = STATUS_TO_CLIENT_TYPE[rawStatus] || 'proprietor';
        const mobile = cleanPhone(g(r,'mobile','phone','mobile_number','phone_number'));
        const { address, city, state, pincode } = parseAddress(g(r,'address'));

        results.push({
          company_name: name || pan,
          pan: pan || null,
          client_type: clientType,
          email: g(r,'email','email_address').toLowerCase() || null,
          phone: mobile,
          address,
          city,
          state,
          birthday: parseDOB(g(r,'dob','date_of_birth','dob_doi')),
          gstin: g(r,'gstin') || null,
          notes: g(r,'remark','remarks','notes') || null,
          status: 'active',
          services: ['Income Tax'],
          is_itr_client: true,
          itr_data: {
            assessment_year: detectedAY || '2025-26',
            itr_type: g(r,'itr_type','return_type') || 'ITR-1',
            filing_status: g(r,'filing_status') || 'pending',
            aadhaar: formatAadhaar(g(r,'aadhaar','aadhaar_number','aadhar')),
            it_portal_user: g(r,'userid','user_id','portal_user') || null,
            it_portal_password: g(r,'password','portal_password') || null,
            bank_name: g(r,'bank_name','bank') || null,
            bank_account_no: g(r,'a_c_no','account_no','ac_no') || null,
            ifsc_code: g(r,'ifsc','ifsc_code') || null,
            group: g(r,'group') || null,
            ward: g(r,'ward') || null,
            tan: g(r,'tan') || null,
            remarks: g(r,'remark','remarks','notes') || null,
            pincode,
            company_links: [],
          },
        });
      }
    }
  }

  return { rows: results, detectedAY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ITRBulkImportDialog({ open, onClose, onImported, isDark = false }) {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [detectedAY, setDetectedAY] = useState(null);
  const [results, setResults] = useState({ created: 0, skipped: 0, errors: [] });
  const [showErrors, setShowErrors] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setDetectedAY(null);
    setResults({ created: 0, skipped: 0, errors: [] });
    setShowErrors(false);
    setProgress(0);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [reset, onClose]);

  // ── File handling ────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Please upload an .xlsx, .xls, or .csv file.');
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
        const { rows, detectedAY: ay } = parseITRExcel(wb);

        if (rows.length === 0) {
          toast.error('No valid client rows found. Make sure the file has Name and PAN columns.');
          setFileName('');
          return;
        }

        setParsedRows(rows);
        setDetectedAY(ay);
        setStep('preview');
        toast.success(`Parsed ${rows.length} client${rows.length !== 1 ? 's' : ''} from ${wb.SheetNames.length} sheet${wb.SheetNames.length > 1 ? 's' : ''}.${ay ? ` AY ${ay} detected.` : ''}`);
      } catch (err) {
        console.error('Parse error:', err);
        toast.error('Failed to parse file: ' + (err.message || 'Unknown error'));
        setFileName('');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onInputChange = useCallback((e) => handleFile(e.target.files?.[0]), [handleFile]);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  }, [handleFile]);

  // ── Import ────────────────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    setStep('importing');
    setProgress(0);
    let created = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < parsedRows.length; i++) {
      setProgress(Math.round(((i + 1) / parsedRows.length) * 100));
      const row = parsedRows[i];
      try {
        await api.post('/clients', row);
        created++;
      } catch (err) {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        const msg = Array.isArray(detail)
          ? detail.map(d => d.msg).join(', ')
          : (typeof detail === 'string' ? detail : (err.message || 'Unknown error'));

        // 409 = duplicate → soft-skip
        if (status === 409 || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
          skipped++;
        } else {
          errors.push({ row: i + 1, name: row.company_name || row.pan || `Row ${i+1}`, error: msg });
          skipped++;
        }
      }
    }

    setResults({ created, skipped, errors });
    setStep('done');

    if (created > 0) {
      toast.success(`${created} ITR client${created !== 1 ? 's' : ''} imported successfully!`);
      onImported?.();
    } else {
      toast.warning('No new clients were imported.');
    }
  }, [parsedRows, onImported]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const bg          = isDark ? '#0f172a' : '#ffffff';
  const border      = isDark ? '#1e3a5f' : '#e2e8f0';
  const textPrimary = isDark ? '#e2e8f0' : '#0f172a';
  const textMuted   = isDark ? '#94a3b8' : '#64748b';
  const cardBg      = isDark ? '#1e293b' : '#f8fafc';
  const rowAlt      = isDark ? '#162032' : '#f1f5f9';

  // Client type badge colors
  const typeBadge = (t) => {
    const map = {
      proprietor: ['#dbeafe','#1d4ed8'], huf: ['#ede9fe','#7c3aed'],
      partnership: ['#fce7f3','#be185d'], llp: ['#fef3c7','#b45309'],
      pvt_ltd: ['#dcfce7','#15803d'], trust: ['#ffedd5','#c2410c'],
    };
    const [bg, color] = map[t] || ['#f1f5f9','#475569'];
    return isDark
      ? { background: color + '33', color }
      : { background: bg, color };
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 overflow-hidden rounded-2xl shadow-2xl"
        style={{ maxWidth: 680, width: '95vw', background: bg, borderColor: border }}
      >
        <DialogTitle className="sr-only">Bulk Import ITR Clients</DialogTitle>
        <DialogDescription className="sr-only">Upload Income Tax Excel to import clients</DialogDescription>

        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0369a1 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Bulk Import ITR Clients</p>
              <p className="text-white/70 text-xs">
                {step === 'preview' && parsedRows.length > 0
                  ? `${parsedRows.length} clients ready${detectedAY ? ` · AY ${detectedAY}` : ''}`
                  : 'Upload Income Tax software Excel export (.xlsx)'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* ── STEP: upload ── */}
          {step === 'upload' && (
            <>
              {/* Format hint */}
              <div
                className="rounded-xl p-3 border text-xs space-y-1"
                style={{ background: isDark ? '#0c1a2e' : '#f0f9ff', borderColor: isDark ? '#1e3a5f' : '#bae6fd', color: isDark ? '#93c5fd' : '#0369a1' }}
              >
                <p className="font-semibold">✅ Supported format: Income Tax software Excel export</p>
                <p style={{ color: textMuted }}>
                  The file should have: Row 1 = Title (A.Y. year), Row 3 = Column headers
                  (SN, Code, Name, PAN, Group, Status …), Row 4 = data rows.
                  Both sheets are imported automatically.
                </p>
              </div>

              {/* Drop zone */}
              <div
                className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all hover:border-teal-400 hover:bg-teal-50/5"
                style={{ borderColor: isDark ? '#334155' : '#cbd5e1', background: cardBg }}
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
              >
                <Upload className="h-9 w-9 mx-auto mb-3" style={{ color: textMuted }} />
                <p className="text-sm font-semibold" style={{ color: textPrimary }}>
                  Click to upload or drag & drop
                </p>
                <p className="text-xs mt-1" style={{ color: textMuted }}>
                  .xlsx · .xls · .csv — Income Tax software export
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={onInputChange}
                />
              </div>

              {/* What gets imported */}
              <div className="rounded-xl border p-3" style={{ borderColor: border, background: cardBg }}>
                <p className="text-xs font-semibold mb-2" style={{ color: textMuted }}>
                  Fields imported from each row:
                </p>
                <div className="flex flex-wrap gap-1">
                  {['Name','PAN','AADHAAR','Email','Mobile','Address','DOB','GSTIN',
                    'IT Portal UserID','IT Portal Password','Bank A/c','IFSC','Ward',
                    'Group','Status→Client Type','Remark'].map(f => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: isDark ? '#0f172a' : '#e2e8f0', color: textMuted }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && (
            <>
              {/* File badge */}
              <div
                className="flex items-center gap-2 rounded-xl p-3 border"
                style={{ borderColor: isDark ? '#166534' : '#bbf7d0', background: isDark ? '#1e293b' : '#f0fdf4' }}
              >
                <FileText className="h-4 w-4 shrink-0" style={{ color: isDark ? '#4ade80' : '#16a34a' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: isDark ? '#4ade80' : '#16a34a' }}>
                    {fileName}
                  </p>
                  <p className="text-[10px]" style={{ color: textMuted }}>
                    {parsedRows.length} clients detected
                    {detectedAY ? ` · Assessment Year: ${detectedAY}` : ''}
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" style={{ color: isDark ? '#f87171' : '#ef4444' }} />
                </button>
              </div>

              {/* Type breakdown */}
              {(() => {
                const counts = {};
                parsedRows.forEach(r => { counts[r.client_type] = (counts[r.client_type]||0)+1; });
                const labels = { proprietor:'Individual', huf:'HUF', partnership:'Firm', llp:'LLP', pvt_ltd:'Pvt Ltd', trust:'Trust' };
                return (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(counts).map(([type, count]) => (
                      <span key={type} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={typeBadge(type)}>
                        {labels[type] || type}: {count}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Preview table */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: border }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: isDark ? '#1e293b' : '#f1f5f9' }}>
                        {['#','Name','PAN','Type','Mobile','City','IT Portal'].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-semibold uppercase text-[10px] tracking-wide whitespace-nowrap"
                            style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 100).map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? bg : rowAlt }}>
                          <td className="px-3 py-1.5 text-[10px]" style={{ color: textMuted }}>{i+1}</td>
                          <td className="px-3 py-1.5 font-medium max-w-[180px] truncate" style={{ color: textPrimary }} title={r.company_name}>
                            {r.company_name}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[11px]" style={{ color: textMuted }}>
                            {r.pan || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={typeBadge(r.client_type)}>
                              {r.client_type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5" style={{ color: textMuted }}>
                            {r.phone || '—'}
                          </td>
                          <td className="px-3 py-1.5" style={{ color: textMuted }}>
                            {r.city || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.itr_data?.it_portal_user
                              ? <span className="text-[10px] text-emerald-600">✓</span>
                              : <span className="text-[10px]" style={{ color: textMuted }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 100 && (
                  <div className="px-4 py-2 text-center text-[10px] border-t" style={{ borderColor: border, color: textMuted, background: cardBg }}>
                    Showing first 100 of {parsedRows.length} rows
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── STEP: importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-5">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#0d9488' }} />
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-xs" style={{ color: textMuted }}>
                  <span>Importing clients…</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full rounded-full h-2" style={{ background: isDark ? '#1e293b' : '#e2e8f0' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #0f766e, #0369a1)' }}
                  />
                </div>
                <p className="text-[10px] text-center" style={{ color: textMuted }}>
                  Do not close this window
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: CheckCircle2, label: 'Imported',  value: results.created, light: ['#f0fdf4','#bbf7d0','#16a34a'], dark: '#4ade80' },
                  { icon: AlertCircle,  label: 'Skipped',   value: results.skipped, light: ['#fffbeb','#fde68a','#d97706'], dark: '#fbbf24' },
                  { icon: XCircle,      label: 'Errors',    value: results.errors.length, light: ['#fef2f2','#fecaca','#dc2626'], dark: '#f87171' },
                ].map(({ icon: Icon, label, value, light, dark }) => (
                  <div key={label} className="rounded-xl p-4 text-center border"
                    style={{
                      background: isDark ? dark + '22' : light[0],
                      borderColor: isDark ? dark + '55' : light[1],
                    }}
                  >
                    <Icon className="h-6 w-6 mx-auto mb-1" style={{ color: isDark ? dark : light[2] }} />
                    <p className="text-2xl font-bold" style={{ color: isDark ? dark : light[2] }}>{value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: textMuted }}>{label}</p>
                  </div>
                ))}
              </div>

              {results.errors.length > 0 && (
                <div className="rounded-xl border overflow-hidden"
                  style={{ borderColor: isDark ? '#991b1b' : '#fecaca' }}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold"
                    style={{ background: isDark ? '#7f1d1d33' : '#fef2f2', color: isDark ? '#f87171' : '#dc2626' }}
                    onClick={() => setShowErrors(v => !v)}
                  >
                    <span>{results.errors.length} error{results.errors.length !== 1 ? 's' : ''} — click to view</span>
                    {showErrors ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}
                  </button>
                  {showErrors && (
                    <div className="max-h-40 overflow-y-auto" style={{ background: cardBg }}>
                      {results.errors.map((e, i) => (
                        <div key={i} className="px-4 py-2 border-t text-xs"
                          style={{ borderColor: border }}>
                          <span className="font-medium" style={{ color: textPrimary }}>
                            #{e.row} {e.name}:
                          </span>{' '}
                          <span style={{ color: isDark ? '#f87171' : '#dc2626' }}>{e.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-4 border-t"
          style={{ borderColor: border, background: cardBg }}>

          {step === 'upload' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose} style={{ color: textMuted }}>
                Cancel
              </Button>
              <p className="text-[10px]" style={{ color: textMuted }}>Both sheets imported automatically</p>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="ghost" size="sm" onClick={reset} style={{ color: textMuted }}>
                ← Change File
              </Button>
              <Button size="sm" onClick={runImport} className="gap-2"
                style={{ background: 'linear-gradient(135deg, #0f766e, #0369a1)', color: '#fff', border: 'none' }}>
                <Upload className="h-3.5 w-3.5" />
                Import {parsedRows.length} Client{parsedRows.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}

          {step === 'importing' && (
            <div className="w-full text-center text-xs" style={{ color: textMuted }}>
              Importing {parsedRows.length} clients…
            </div>
          )}

          {step === 'done' && (
            <>
              <Button variant="ghost" size="sm" onClick={reset} style={{ color: textMuted }}>
                Import Another File
              </Button>
              <Button size="sm" onClick={handleClose}
                style={{ background: 'linear-gradient(135deg, #0f766e, #0369a1)', color: '#fff', border: 'none' }}>
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
