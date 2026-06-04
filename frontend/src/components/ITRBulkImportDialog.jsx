/**
 * ITRBulkImportDialog.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk import ITR clients from Excel / CSV / any spreadsheet format.
 *
 * Smart parser — automatically detects and maps columns from ANY layout:
 *  - The exact clients_IncomeTax.xlsx format (SN, Code, Name, PAN, …)
 *  - Standard exports (Name/PAN/Email/Phone/Address…)
 *  - Custom layouts — fuzzy column header matching
 *
 * Features:
 *  - Drag-and-drop or click to upload (.xlsx, .xls, .csv)
 *  - Shows live preview table with detected column mapping
 *  - Row-level validation (PAN format, required fields)
 *  - Progress bar during import
 *  - Error / success summary
 *  - Skip duplicates (by PAN)
 */

import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle,
  Loader2, ChevronDown, ChevronUp, Download, Sparkles,
  Users, FileText, SkipForward, RefreshCw, Info
} from 'lucide-react';
import api from '@/lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const VALID_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// Fuzzy column header → field mapping
// Each entry: [fieldKey, [...possibleHeaders (lowercase, trimmed)], required?]
const COLUMN_MAP_RULES = [
  ['company_name',     ['name', 'assessee name', 'full name', 'client name', 'assessee', 'party name', 'tax payer'], true],
  ['pan',              ['pan', 'pan no', 'pan number', 'pan no.', 'panno', 'permanentaccountnumber'], true],
  ['email',            ['email', 'email id', 'emailid', 'e-mail', 'email address', 'mail id'], false],
  ['phone',            ['mobile', 'phone', 'mobile no', 'mobile number', 'phone no', 'contact', 'mob', 'cell'], false],
  ['aadhaar',          ['aadhaar', 'aadhar', 'aadhaar number', 'aadhar no', 'uid', 'uid number'], false],
  ['address',          ['address', 'addr', 'residential address', 'communication address'], false],
  ['city',             ['city', 'place', 'town'], false],
  ['state',            ['state', 'statename'], false],
  ['date_of_birth',    ['dob', 'date of birth', 'dob/doi', 'date of birth/incorporation', 'birth date'], false],
  ['status_raw',       ['status', 'client status', 'taxpayer status', 'category'], false],
  ['residential_status', ['residential status', 'residential_status', 'res. status'], false],
  ['ward',             ['ward', 'circle', 'ward/circle'], false],
  ['bank_name',        ['bank name', 'bank', 'bankname', 'bank_name'], false],
  ['ifsc_code',        ['ifsc', 'ifsc code', 'ifsccode', 'ifsc_code'], false],
  ['account_no',       ['a/c no', 'account no', 'account number', 'ac no', 'bank a/c no', 'account_no', 'acno'], false],
  ['it_portal_user',   ['userid', 'user id', 'user_id', 'login id', 'loginid', 'portal id', 'it portal user'], false],
  ['it_portal_password', ['password', 'pass', 'pwd', 'it portal password'], false],
  ['gender',           ['gender', 'sex'], false],
  ['remarks',          ['remark', 'remarks', 'note', 'notes', 'category', 'comment'], false],
  ['group',            ['group', 'group name', 'client group'], false],
  ['tan',              ['tan', 'tan no', 'tan number'], false],
  ['gstin',            ['gstin', 'gst no', 'gst number', 'gst_no'], false],
  ['din',              ['din', 'din no', 'director identification number'], false],
  ['passport',         ['passport', 'passport no', 'passport number'], false],
  ['father_name',      ['father', 'father name', 'father/husband', 'f/h name', 'husband name'], false],
];

// Map "status" string from spreadsheet → ITR status value
function mapStatusValue(raw = '') {
  const s = (raw || '').toLowerCase().trim();
  if (!s || s === '(all)') return 'active';
  if (['inactive', 'archived', 'ex', 'ex client', 'ex-client', 'ex clients'].includes(s)) return 'inactive';
  return 'active';
}

// Parse date string to ISO YYYY-MM-DD
function parseDate(raw = '') {
  if (!raw) return '';
  const s = String(raw).trim();
  // Excel serial number
  if (/^\d{5}$/.test(s)) {
    try {
      const d = XLSX.SSF.parse_date_code(parseInt(s));
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    } catch {}
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const dmatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmatch) {
    const [, d, m, y] = dmatch;
    const year = y.length === 2 ? (parseInt(y) > 30 ? '19' + y : '20' + y) : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

// Clean PAN — uppercase, remove spaces
function cleanPAN(raw = '') {
  return String(raw || '').replace(/\s/g, '').toUpperCase().trim();
}

// Map status_raw to client_type (Individual → proprietor, etc.)
function mapClientType(raw = '') {
  const s = (raw || '').toLowerCase().trim();
  if (['individual', 'ind'].includes(s)) return 'proprietor';
  if (['firm', 'partnership firm', 'partnership'].includes(s)) return 'partnership';
  if (['huf'].includes(s)) return 'huf';
  if (['trust'].includes(s)) return 'trust';
  if (['company', 'pvt ltd', 'private limited', 'pvt. ltd.'].includes(s)) return 'pvt_ltd';
  if (['llp'].includes(s)) return 'llp';
  return 'proprietor';
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ITRBulkImportDialog({ open, onClose, onImported, isDark = false }) {
  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [rawRows, setRawRows] = useState([]);         // parsed from file
  const [mappedRows, setMappedRows] = useState([]);   // after column mapping + validation
  const [colMapping, setColMapping] = useState({});   // detected column mapping
  const [headers, setHeaders] = useState([]);         // original headers
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ created: 0, skipped: 0, errors: [] });
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [allSheets, setAllSheets] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setStep('upload'); setRawRows([]); setMappedRows([]); setColMapping({});
    setHeaders([]); setFileName(''); setImportProgress(0);
    setImportResults({ created: 0, skipped: 0, errors: [] });
    setAllSheets([]); setWorkbook(null); setSelectedSheet(0);
  };

  // ── Detect column mapping from headers ────────────────────────────────────
  const detectColumns = useCallback((headerRow) => {
    const mapping = {};
    headerRow.forEach((h, idx) => {
      const normalized = String(h || '').toLowerCase().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      for (const [field, aliases] of COLUMN_MAP_RULES) {
        if (mapping[field] !== undefined) continue; // already mapped
        if (aliases.some(a => normalized === a || normalized.includes(a) || a.includes(normalized))) {
          mapping[field] = idx;
          break;
        }
      }
    });
    return mapping;
  }, []);

  // ── Process a worksheet ───────────────────────────────────────────────────
  const processSheet = useCallback((wb, sheetIdx) => {
    const sheetName = wb.SheetNames[sheetIdx];
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    // Convert to array of arrays
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (aoa.length < 2) { toast.error('Sheet has no data rows'); return; }

    // Find the header row: look for a row containing "PAN" or "Name"
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, aoa.length); i++) {
      const row = aoa[i].map(c => String(c || '').toLowerCase());
      if (row.some(c => c.includes('pan') || c === 'name' || c.includes('assessee'))) {
        headerRowIdx = i;
        break;
      }
    }

    const headerRow = aoa[headerRowIdx].map(h => String(h || '').replace(/[\r\n]+/g, ' ').trim());
    const dataRows = aoa.slice(headerRowIdx + 1).filter(row => row.some(c => String(c || '').trim()));

    const mapping = detectColumns(headerRow);
    setHeaders(headerRow);
    setColMapping(mapping);
    setRawRows(dataRows);

    // Map + validate rows
    const mapped = dataRows.map((row, i) => {
      const get = (field) => {
        const idx = mapping[field];
        return idx !== undefined ? String(row[idx] || '').trim() : '';
      };

      const pan = cleanPAN(get('pan'));
      const name = get('company_name');
      const statusRaw = get('status_raw');
      const clientTypeRaw = get('status_raw'); // same column often has Individual/Firm/HUF

      const errors = [];
      if (!name) errors.push('Name missing');
      if (!pan) errors.push('PAN missing');
      else if (!VALID_PAN.test(pan)) errors.push(`Invalid PAN: ${pan}`);

      // Skip filter / totals rows
      const isMetaRow = name === '(All)' || name === '' || (name.startsWith('(') && name.endsWith(')'));

      return {
        _rowNum: headerRowIdx + 2 + i,
        _valid: errors.length === 0 && !isMetaRow,
        _errors: errors,
        _skip: isMetaRow,
        company_name: name,
        pan,
        email: get('email'),
        phone: (get('phone') || '').replace(/\D/g, '').slice(-10) || '',
        address: get('address'),
        city: get('city'),
        state: get('state'),
        date_of_birth: parseDate(get('date_of_birth')),
        aadhaar: (get('aadhaar') || '').replace(/\s/g, ''),
        bank_name: get('bank_name'),
        ifsc_code: (get('ifsc_code') || '').toUpperCase(),
        account_no: get('account_no'),
        it_portal_user: get('it_portal_user') || pan,
        it_portal_password: get('it_portal_password'),
        gender: get('gender'),
        ward: get('ward'),
        remarks: [
          get('group') ? `Group: ${get('group')}` : '',
          get('ward') ? `Ward: ${get('ward')}` : '',
          get('remarks') || '',
          get('father_name') ? `Father/Husband: ${get('father_name')}` : '',
          get('residential_status') ? `Residential Status: ${get('residential_status')}` : '',
        ].filter(Boolean).join(' | '),
        status: mapStatusValue(statusRaw),
        client_type: mapClientType(clientTypeRaw),
        gstin: get('gstin'),
        tan: get('tan'),
        din: get('din'),
      };
    }).filter(r => !r._skip);

    setMappedRows(mapped);
    setStep('preview');
  }, [detectColumns]);

  // ── File parsing ─────────────────────────────────────────────────────────
  const parseFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        setWorkbook(wb);
        setAllSheets(wb.SheetNames);
        setSelectedSheet(0);
        processSheet(wb, 0);
      } catch (err) {
        toast.error('Could not parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [processSheet]);

  const handleFileInput = (e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; };
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  };

  // ── Import ─────────────────────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    const validRows = mappedRows.filter(r => r._valid);
    if (validRows.length === 0) { toast.error('No valid rows to import'); return; }

    setStep('importing');
    setImportProgress(0);
    const results = { created: 0, skipped: 0, errors: [] };

    // Fetch existing PANs to detect duplicates
    let existingPANs = new Set();
    if (skipDuplicates) {
      try {
        const r = await api.get('/clients', { params: { page_size: 9999, is_itr_client: true } });
        const all = r.data?.clients || r.data?.items || r.data || [];
        all.forEach(c => { if (c.pan) existingPANs.add(c.pan.toUpperCase()); });
      } catch {}
    }

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setImportProgress(Math.round(((i + 1) / validRows.length) * 100));

      if (skipDuplicates && existingPANs.has(row.pan)) {
        results.skipped++;
        continue;
      }

      try {
        const itr_data = {
          itr_type: 'ITR-1',
          assessment_year: '2025-26',
          filing_status: 'pending',
          aadhaar: row.aadhaar || null,
          bank_name: row.bank_name || null,
          ifsc_code: row.ifsc_code || null,
          account_no: row.account_no || null,
          it_portal_user: row.it_portal_user || row.pan || null,
          it_portal_password: row.it_portal_password || null,
          remarks: row.remarks || null,
          company_links: [],
        };

        const payload = {
          company_name: row.company_name,
          client_type: row.client_type || 'proprietor',
          pan: row.pan,
          email: row.email || null,
          phone: row.phone || null,
          address: row.address || null,
          city: row.city || null,
          state: row.state || null,
          status: row.status || 'active',
          date_of_birth: row.date_of_birth || null,
          services: ['Income Tax'],
          is_itr_client: true,
          itr_data,
          notes: row.remarks || null,
          dsc_details: [],
          assignments: [],
          contact_persons: [],
        };

        await api.post('/clients', payload);
        existingPANs.add(row.pan);
        results.created++;
      } catch (err) {
        const detail = err?.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail : `Row ${row._rowNum}: ${row.company_name}`;
        results.errors.push(msg);
      }

      // Small delay to prevent rate limiting
      if (i % 10 === 9) await new Promise(r => setTimeout(r, 100));
    }

    setImportResults(results);
    setStep('done');
    if (results.created > 0) {
      toast.success(`✅ Imported ${results.created} ITR client${results.created > 1 ? 's' : ''}`);
      onImported?.();
    }
  }, [mappedRows, skipDuplicates, onImported]);

  // ── Download sample template ───────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = ['Name', 'PAN', 'Email', 'Mobile', 'Aadhaar', 'Address', 'City', 'State',
      'DOB', 'Status', 'Bank Name', 'IFSC', 'A/c No', 'UserID', 'Password', 'Remarks'];
    const sample = [
      ['RAJESH KUMAR SHARMA', 'ABCRS1234Z', 'rajesh@example.com', '9876543210', '123456789012',
       '123 Main Street, Mumbai', 'Mumbai', 'Maharashtra', '15/06/1985', 'Individual',
       'HDFC Bank', 'HDFC0001234', '12345678901', 'ABCRS1234Z', 'Pass@123', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ITR Clients');
    XLSX.writeFile(wb, 'ITR_Bulk_Import_Template.xlsx');
  };

  const validCount = mappedRows.filter(r => r._valid).length;
  const errorCount = mappedRows.filter(r => !r._valid).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0"
        style={{ background: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#1e3a5f' : '#e2e8f0' }}
      >
        <DialogTitle className="sr-only">Bulk Import ITR Clients</DialogTitle>
        <DialogDescription className="sr-only">Import multiple ITR clients from an Excel or CSV file</DialogDescription>

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-7 py-5 border-b"
          style={{ background: 'linear-gradient(135deg, #0f3460 0%, #16213e 60%, #0d7377 100%)', borderColor: 'transparent' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Bulk Import ITR Clients</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Import from Excel, CSV — any column layout auto-detected
                </p>
              </div>
            </div>
            <button onClick={() => { reset(); onClose(); }}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 mt-4">
            {[
              { key: 'upload', label: '1. Upload File' },
              { key: 'preview', label: '2. Preview & Validate' },
              { key: 'importing', label: '3. Import' },
              { key: 'done', label: '4. Done' },
            ].map(s => (
              <div key={s.key}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={step === s.key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.45)' }}>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-7">

          {/* ════ UPLOAD ════ */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed rounded-2xl flex flex-col items-center justify-center py-14 gap-4 cursor-pointer transition-all"
                style={{
                  borderColor: dragging ? '#0d7377' : (isDark ? '#334155' : '#cbd5e1'),
                  background: dragging ? 'rgba(13,115,119,0.06)' : (isDark ? '#1e293b' : '#f8fafc'),
                }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: dragging ? 'rgba(13,115,119,0.15)' : (isDark ? '#334155' : '#e2e8f0') }}>
                  <Upload className="h-7 w-7" style={{ color: dragging ? '#0d7377' : (isDark ? '#94a3b8' : '#94a3b8') }} />
                </div>
                <div className="text-center">
                  <p className={`text-base font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    Drop your Excel or CSV file here
                  </p>
                  <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Supports .xlsx, .xls, .csv — any column layout
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    PAN + Name are the only required columns
                  </p>
                </div>
                <button
                  type="button"
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #0f3460, #0d7377)' }}>
                  Browse File
                </button>
                <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.tsv" onChange={handleFileInput} />
              </div>

              {/* Accepted formats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: '📊', label: 'Income Tax Software Export', desc: 'Winman, Taxmann, Computax exports' },
                  { icon: '📋', label: 'Custom Excel', desc: 'Any layout with Name & PAN columns' },
                  { icon: '📄', label: 'CSV / TSV', desc: 'Comma or tab separated values' },
                ].map(f => (
                  <div key={f.label} className="p-4 rounded-xl border"
                    style={{ background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <div className="text-2xl mb-2">{f.icon}</div>
                    <p className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{f.label}</p>
                    <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Template download */}
              <div className="flex items-center gap-3 p-4 rounded-xl border"
                style={{ background: isDark ? '#1e293b' : '#f0f9ff', borderColor: isDark ? '#1e3a5f' : '#bae6fd' }}>
                <Info className="h-4 w-4 flex-shrink-0" style={{ color: isDark ? '#60a5fa' : '#0284c7' }} />
                <p className={`text-xs flex-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  Don't have the right format? Download our template and fill it in.
                </p>
                <button type="button" onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: isDark ? '#1e3a5f' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                  <Download className="h-3 w-3" /> Template
                </button>
              </div>
            </div>
          )}

          {/* ════ PREVIEW ════ */}
          {step === 'preview' && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Rows', value: mappedRows.length, color: isDark ? '#60a5fa' : '#1d4ed8', bg: isDark ? '#1e293b' : '#eff6ff' },
                  { label: 'Valid', value: validCount, color: '#059669', bg: isDark ? '#1e2d1e' : '#f0fdf4' },
                  { label: 'Errors', value: errorCount, color: '#dc2626', bg: isDark ? '#2d1515' : '#fef2f2' },
                  { label: 'Columns Detected', value: Object.keys(colMapping).length, color: '#7c3aed', bg: isDark ? '#1e1b2e' : '#f5f3ff' },
                ].map(s => (
                  <div key={s.label} className="p-4 rounded-xl border"
                    style={{ background: s.bg, borderColor: s.color + '30' }}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: isDark ? '#64748b' : '#64748b' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Detected columns */}
              <div className="p-4 rounded-xl border"
                style={{ background: isDark ? '#1e293b' : '#f8fafc', borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <Sparkles className="h-3.5 w-3.5 inline mr-1 text-emerald-500" />
                    Auto-detected column mapping ({Object.keys(colMapping).length} / {headers.length} columns)
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(colMapping).map(([field, idx]) => (
                    <span key={field}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                      style={{ background: isDark ? '#334155' : '#e0f2fe', color: isDark ? '#93c5fd' : '#075985' }}>
                      <span style={{ opacity: 0.7 }}>{headers[idx]}</span>
                      <span className="mx-1">→</span>
                      <span>{field.replace(/_/g, ' ')}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Sheet selector */}
              {allSheets.length > 1 && (
                <div className="flex items-center gap-3">
                  <p className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Sheet:</p>
                  <div className="flex gap-1.5">
                    {allSheets.map((name, idx) => (
                      <button key={idx}
                        onClick={() => { setSelectedSheet(idx); processSheet(workbook, idx); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                        style={selectedSheet === idx
                          ? { background: '#0f3460', color: '#fff', borderColor: '#0f3460' }
                          : { background: isDark ? '#1e293b' : '#f8fafc', color: isDark ? '#94a3b8' : '#475569', borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ background: isDark ? '#1e293b' : '#fffbeb', borderColor: isDark ? '#334155' : '#fde68a' }}>
                <input type="checkbox" id="skipDups" checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)}
                  className="w-4 h-4 accent-teal-600 cursor-pointer" />
                <label htmlFor="skipDups" className={`text-xs font-semibold cursor-pointer ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                  Skip clients with duplicate PANs (already in system)
                </label>
              </div>

              {/* Preview table */}
              <div>
                <button type="button"
                  onClick={() => setPreviewExpanded(p => !p)}
                  className={`flex items-center gap-2 text-xs font-bold mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {previewExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Preview ({Math.min(mappedRows.length, 20)} of {mappedRows.length} rows)
                </button>
                {previewExpanded && (
                  <div className="rounded-xl border overflow-hidden overflow-x-auto"
                    style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: isDark ? '#1e293b' : '#f8fafc' }}>
                          {['#', 'Status', 'Name', 'PAN', 'Email', 'Phone', 'City', 'Client Type'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-[10px] uppercase tracking-wider"
                              style={{ color: isDark ? '#64748b' : '#94a3b8' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mappedRows.slice(0, 20).map((row, i) => (
                          <tr key={i}
                            className="border-t"
                            style={{ borderColor: isDark ? '#2d3748' : '#f1f5f9', background: !row._valid ? (isDark ? 'rgba(220,38,38,0.08)' : '#fff1f2') : 'transparent' }}>
                            <td className="px-3 py-2 text-slate-400">{row._rowNum}</td>
                            <td className="px-3 py-2">
                              {row._valid
                                ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Valid</span>
                                : <span className="flex items-center gap-1 text-red-500"><AlertCircle className="h-3 w-3" />{row._errors[0]}</span>}
                            </td>
                            <td className={`px-3 py-2 font-medium max-w-[140px] truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{row.company_name || '—'}</td>
                            <td className="px-3 py-2 font-mono" style={{ color: VALID_PAN.test(row.pan) ? '#059669' : '#dc2626' }}>{row.pan || '—'}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{row.email || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.phone || '—'}</td>
                            <td className="px-3 py-2 text-slate-500">{row.city || '—'}</td>
                            <td className="px-3 py-2 text-slate-500 capitalize">{row.client_type || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {mappedRows.length > 20 && (
                      <div className={`text-center py-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        …and {mappedRows.length - 20} more rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ IMPORTING ════ */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0f3460, #0d7377)' }}>
                <Loader2 className="h-9 w-9 text-white animate-spin" />
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  Importing ITR Clients…
                </p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {importProgress}% complete · Please don't close this window
                </p>
              </div>
              <div className="w-full max-w-sm">
                <div className="h-3 rounded-full overflow-hidden" style={{ background: isDark ? '#334155' : '#e2e8f0' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%`, background: 'linear-gradient(90deg, #0f3460, #0d7377)' }} />
                </div>
              </div>
            </div>
          )}

          {/* ════ DONE ════ */}
          {step === 'done' && (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl text-center border"
                  style={{ background: isDark ? '#1e2d1e' : '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <p className="text-3xl font-bold text-emerald-600">{importResults.created}</p>
                  <p className="text-sm text-emerald-700 mt-1 font-semibold">Clients Created</p>
                </div>
                <div className="p-5 rounded-2xl text-center border"
                  style={{ background: isDark ? '#2d2d1e' : '#fffbeb', borderColor: '#fde68a' }}>
                  <p className="text-3xl font-bold text-amber-600">{importResults.skipped}</p>
                  <p className="text-sm text-amber-700 mt-1 font-semibold">Skipped (duplicate)</p>
                </div>
                <div className="p-5 rounded-2xl text-center border"
                  style={{ background: importResults.errors.length > 0 ? (isDark ? '#2d1515' : '#fef2f2') : (isDark ? '#1e293b' : '#f8fafc'), borderColor: importResults.errors.length > 0 ? '#fecaca' : (isDark ? '#334155' : '#e2e8f0') }}>
                  <p className={`text-3xl font-bold ${importResults.errors.length > 0 ? 'text-red-600' : (isDark ? 'text-slate-400' : 'text-slate-400')}`}>{importResults.errors.length}</p>
                  <p className={`text-sm mt-1 font-semibold ${importResults.errors.length > 0 ? 'text-red-700' : (isDark ? 'text-slate-500' : 'text-slate-500')}`}>Errors</p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="rounded-xl border p-4 space-y-2"
                  style={{ background: isDark ? '#2d1515' : '#fef2f2', borderColor: '#fecaca' }}>
                  <p className="text-xs font-bold text-red-700">Import Errors:</p>
                  <ul className="space-y-1">
                    {importResults.errors.slice(0, 15).map((e, i) => (
                      <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                        <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        {e}
                      </li>
                    ))}
                    {importResults.errors.length > 15 && (
                      <li className="text-xs text-red-400">…and {importResults.errors.length - 15} more</li>
                    )}
                  </ul>
                </div>
              )}

              {importResults.created > 0 && (
                <div className="rounded-xl border p-4 flex items-center gap-3"
                  style={{ background: isDark ? '#1e2d1e' : '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-700 font-semibold">
                    Successfully imported {importResults.created} ITR clients! They are now visible in the ITR Clients tab.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t"
          style={{ borderColor: isDark ? '#1e2d3d' : '#f1f5f9', background: isDark ? '#0a1220' : '#fff' }}>
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}
            className="h-10 px-4 text-sm rounded-xl"
            style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </Button>

          <div className="flex items-center gap-2">
            {step === 'preview' && (
              <>
                <button type="button" onClick={reset}
                  className="flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-semibold transition-all"
                  style={{ borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#475569' }}>
                  <RefreshCw className="h-3.5 w-3.5" /> Change File
                </button>
                <button type="button" onClick={handleImport} disabled={validCount === 0}
                  className="flex items-center gap-2 h-10 px-6 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: validCount === 0 ? '#94a3b8' : 'linear-gradient(135deg, #0f3460, #0d7377)' }}>
                  <Users className="h-4 w-4" />
                  Import {validCount} Client{validCount !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 'done' && importResults.created > 0 && (
              <button type="button" onClick={() => { reset(); onClose(); }}
                className="flex items-center gap-2 h-10 px-6 rounded-xl text-white text-sm font-bold"
                style={{ background: 'linear-gradient(135deg, #0f3460, #0d7377)' }}>
                <CheckCircle2 className="h-4 w-4" /> Done
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
