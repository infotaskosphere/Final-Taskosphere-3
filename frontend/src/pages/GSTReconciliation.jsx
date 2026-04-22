import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import {
  Upload, CheckCircle2, AlertTriangle, Download, Search,
  RefreshCw, ArrowLeftRight, Info, X, Globe, BookOpen,
  FileText, FileSpreadsheet, Building2, Hash, MapPin,
  Phone, Mail, Calendar, ChevronRight, ScanSearch,
  Filter, Tag, ArrowUpDown, ChevronsUpDown,
  History, Clock, Trash2, ChevronDown, User, Loader2, FolderOpen, Edit3,
} from 'lucide-react';
import { toast } from 'sonner';

/* ═══════════════════════════════════════════════════════════════════════════
   PARSING UTILITIES
═══════════════════════════════════════════════════════════════════════════ */
/**
 * normaliseInvoice — extract the canonical invoice serial for matching.
 *
 * Strategy: the actual invoice number is always the LAST purely-numeric
 * segment after any / or - separator. If no separator exists, strip any
 * leading alpha series prefix.
 *
 *   "4930"       → "4930"
 *   "DB-T/4930"  → "4930"   ← complex multi-part prefix
 *   "DB-T/4812"  → "4812"
 *   "SW-60134"   → "60134"
 *   "INV/1234"   → "1234"
 *   "12/0033902" → "33902"
 *   "T1326"      → "1326"   ← alpha directly attached
 *   "INV1234"    → "1234"
 */
function normaliseInvoice(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  // Purely numeric
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  // Last separator strategy: find last / or - and check if trailing part is numeric
  const lastSlash = s.lastIndexOf('/');
  const lastDash  = s.lastIndexOf('-');
  const lastSepIdx = Math.max(lastSlash, lastDash);
  if (lastSepIdx >= 0) {
    const afterSep = s.substring(lastSepIdx + 1);
    if (afterSep && /^\d+$/.test(afterSep)) {
      return afterSep.replace(/^0+/, '') || '0';
    }
  }
  // Alpha prefix directly attached without separator: "T1326" → "1326"
  const m = s.match(/^[A-Z]+(\d+)$/);
  if (m) return m[1].replace(/^0+/, '') || '0';
  return s;
}
function normaliseGSTIN(val) {
  return val ? String(val).trim().toUpperCase() : '';
}
function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function fmtDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) return `${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}/${d.y}`;
    } catch (_) {}
  }
  return String(val).trim();
}
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cell = String(row[c] || '').toLowerCase();
      if (cell.includes('gstin') && (cell.includes('supplier') || cell.startsWith('gstin'))) return i;
    }
  }
  return -1;
}
function buildColMap(headerRow) {
  const map = {};
  if (!headerRow) return map;
  headerRow.forEach((cell, idx) => { if (cell) map[String(cell).trim().toLowerCase()] = idx; });
  return map;
}
function findCol(colMap, ...keys) {
  for (const k of keys)
    for (const [col, idx] of Object.entries(colMap))
      if (col.includes(k.toLowerCase())) return idx;
  return -1;
}

function parseBooksFile(workbook) {
  const sheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'b2b') || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let hi = findHeaderRow(rows);
  if (hi === -1) hi = 2;
  const cm = buildColMap(rows[hi]);
  const g  = (a, ...k) => { const c = findCol(a, ...k); return c >= 0 ? c : -1; };
  const gstinC  = g(cm, 'gstin of supplier', 'gstin');
  const invNoC  = g(cm, 'invoice number', 'invoice no');
  const dateC   = g(cm, 'invoice date', 'date');
  const valC    = g(cm, 'invoice value');
  const taxC    = g(cm, 'taxable value');
  const igstC   = g(cm, 'integrated tax paid', 'integrated tax');
  const cgstC   = g(cm, 'central tax paid', 'central tax');
  const sgstC   = g(cm, 'state/ut tax paid', 'state/ut tax', 'state tax');
  const cessC   = g(cm, 'cess paid', 'cess');
  const posC    = g(cm, 'place of supply', 'place');
  const rcC     = g(cm, 'reverse charge');
  const typeC   = g(cm, 'invoice type', 'type');
  const rateC   = g(cm, 'rate');
  const data = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const gstin = normaliseGSTIN(r[gstinC]);
    const invNo = normaliseInvoice(r[invNoC]);
    if (!gstin || !invNo || gstin.length < 10) continue;
    data.push({
      gstin, invoiceNo: invNo, invoiceNoRaw: String(r[invNoC] || '').trim(),
      invoiceDate: fmtDate(r[dateC]), invoiceValue: toNum(r[valC]),
      taxableValue: toNum(r[taxC]), igst: toNum(r[igstC]), cgst: toNum(r[cgstC]),
      sgst: toNum(r[sgstC]), cess: toNum(r[cessC]),
      placeOfSupply: String(r[posC] || '').trim(), reverseCharge: String(r[rcC] || '').trim(),
      invoiceType: String(r[typeC] || '').trim(), rate: toNum(r[rateC]),
      tradeOrLegalName: '', itcAvailability: '', filingDate: '', source: 'books',
    });
  }
  return data;
}

function parseGSTPortalFile(workbook) {
  const sheetName = workbook.SheetNames.find(n => n.trim().toUpperCase() === 'B2B') || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  let upperIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const c = String(rows[i]?.[0] || '').toLowerCase();
    if (c.includes('gstin') && c.includes('supplier')) { upperIdx = i; break; }
  }
  if (upperIdx === -1) upperIdx = 4;
  const subIdx = upperIdx + 1;
  const upper = rows[upperIdx] || [];
  const sub   = rows[subIdx]   || [];
  const combined = [];
  for (let i = 0; i < Math.max(upper.length, sub.length); i++)
    combined.push(sub[i] || upper[i] || null);
  const cm = buildColMap(combined);
  const uc = buildColMap(upper);
  Object.assign(cm, { ...uc, ...cm });
  const g = (def, ...k) => { const c = findCol(cm, ...k); return c >= 0 ? c : def; };
  const gstinC   = g(0,  'gstin of supplier', 'gstin');
  const nameC    = g(1,  'trade/legal', 'trade name', 'legal name');
  const invNoC   = g(2,  'invoice number', 'invoice no');
  const typeC    = g(3,  'invoice type');
  const dateC    = g(4,  'invoice date');
  const valC     = g(5,  'invoice value');
  const posC     = g(6,  'place of supply');
  const rcC      = g(7,  'reverse charge', 'supply attract');
  const taxC     = g(8,  'taxable value');
  const igstC    = g(9,  'integrated tax');
  const cgstC    = g(10, 'central tax');
  const sgstC    = g(11, 'state/ut tax', 'state tax');
  const cessC    = g(12, 'cess');
  const itcC     = findCol(cm, 'itc availability', 'itc avail');
  const filingC  = findCol(cm, 'filing date', 'gstr-1');
  const data = [];
  for (let i = subIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const get = (idx) => { if (idx < 0 || idx >= r.length || r[idx] == null) return ''; return String(r[idx]).trim(); };
    const gstin = normaliseGSTIN(get(gstinC));
    const invNo = normaliseInvoice(get(invNoC));
    if (!gstin || !invNo || gstin.length < 10 || gstin.includes('GSTIN')) continue;
    data.push({
      gstin, invoiceNo: invNo, invoiceNoRaw: get(invNoC),
      invoiceDate: fmtDate(r[dateC]), invoiceValue: toNum(get(valC)),
      taxableValue: toNum(get(taxC)), igst: toNum(get(igstC)), cgst: toNum(get(cgstC)),
      sgst: toNum(get(sgstC)), cess: toNum(get(cessC)),
      placeOfSupply: get(posC), reverseCharge: get(rcC), invoiceType: get(typeC),
      tradeOrLegalName: get(nameC), itcAvailability: get(itcC >= 0 ? itcC : -1),
      filingDate: fmtDate(r[filingC >= 0 ? filingC : -1]), rate: 0, source: 'portal',
    });
  }
  return data;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT-SIDE GSTIN LOOKUP ENGINE
   ─────────────────────────────────────────────────────────────────────────
   Runs entirely in the browser — no backend round-trip required.
   Avoids the Render-backend CORS failures caused by the backend's own
   outbound HTTP calls to GST portal being blocked on Render's free tier.

   Strategy (tried in order, first success wins):
     1. GST Portal public JSON API  (services.gst.gov.in/services/api/public/gstin)
     2. GST taxpayer-details API    (services.gst.gov.in/services/api/search/taxpayerDetails)
     3. CORS proxy → knowyourgst.com  (allorigins.win free proxy, HTML scrape)
     4. Backend API fallback        (kept for completeness when proxy is down)
   Each source has a hard 6-second abort signal so a dead host can't stall UI.
   Results are cached in module-scope Map so repeated lookups are instant.
═══════════════════════════════════════════════════════════════════════════ */

const GST_STATE_CODES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','25':'Daman & Diu','26':'Dadra & Nagar Haveli','27':'Maharashtra',
  '28':'Andhra Pradesh','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala',
  '33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar','36':'Telangana',
  '37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory',
};

/** Decode static info from the GSTIN structure itself — no network call needed */
function decodeGstin(gstin) {
  const g = (gstin || '').toUpperCase().trim();
  const stateCode = g.slice(0, 2);
  const pan       = g.slice(2, 12);
  const entityCode = g[12] || '';
  // Entity-type letter is the 6th char of the embedded PAN (pos 7 in GSTIN = index 6)
  // P=Individual, C=Company, H=HUF, F=Firm, A=AOP, B=BOI, G=Govt, L=LLP, J=AJP, T=Trust
  const entityTypes = { P:'Individual',C:'Company',H:'HUF',F:'Firm',A:'AOP/BOI',
                        B:'BOI',G:'Government',L:'LLP',J:'AJP',T:'Trust' };
  const entityLetter = pan[4] || '';
  return {
    stateCode,
    state:  GST_STATE_CODES[stateCode] || '',
    pan,
    entityType: entityTypes[entityLetter] || 'Regular',
    regNumber: entityCode,
  };
}

/** Module-scope cache: gstin → { tradeName, legalName, state, source } */
const _gstinCache = new Map();
/** In-flight promise cache to avoid parallel duplicate fetches */
const _gstinInFlight = new Map();

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Main entry point. Returns { tradeName, legalName, state, stateCode, entityType, source }.
 * Always resolves (never rejects). Falls through all sources silently.
 */
async function clientGstinLookup(gstin) {
  const g = (gstin || '').toUpperCase().trim();
  if (!GSTIN_PATTERN.test(g)) return { tradeName:'', legalName:'', state:'', source:'invalid' };

  // Return cached result immediately
  if (_gstinCache.has(g)) return _gstinCache.get(g);

  // Deduplicate concurrent calls for the same GSTIN
  if (_gstinInFlight.has(g)) return _gstinInFlight.get(g);

  const staticInfo = decodeGstin(g);

  const promise = (async () => {
    // ── Source 1: GST portal public JSON API ──────────────────────────────
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(
        `https://services.gst.gov.in/services/api/public/gstin?gstin=${g}`,
        { signal: ctrl.signal, headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } }
      );
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        const tn = ((d.tradeNam || d.tradeName || '')).trim();
        const ln = ((d.lgnm    || d.legalName  || '')).trim();
        if (tn || ln) {
          const out = { tradeName:tn, legalName:ln, state:staticInfo.state,
                        stateCode:staticInfo.stateCode, entityType:staticInfo.entityType,
                        source:'gst_public_api' };
          _gstinCache.set(g, out); _gstinInFlight.delete(g); return out;
        }
      }
    } catch (_) { /* timed-out or CORS-blocked — continue */ }

    // ── Source 2: GST taxpayer-details search API ─────────────────────────
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(
        `https://services.gst.gov.in/services/api/search/taxpayerDetails?gstin=${g}`,
        { signal: ctrl.signal, headers: { Accept: 'application/json' } }
      );
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        const tn = (d.tradeNam || '').trim();
        const ln = (d.lgnm     || '').trim();
        if (tn || ln) {
          const out = { tradeName:tn, legalName:ln, state:staticInfo.state,
                        stateCode:staticInfo.stateCode, entityType:staticInfo.entityType,
                        source:'gst_taxpayer_api' };
          _gstinCache.set(g, out); _gstinInFlight.delete(g); return out;
        }
      }
    } catch (_) { /* continue */ }

    // ── Source 3: CORS proxy → knowyourgst.com (HTML scrape) ─────────────
    try {
      const target   = `https://www.knowyourgst.com/gst-number-search/${g}/`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`;
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        const html = d.contents || '';
        let tn = '', ln = '';
        // knowyourgst HTML pattern: label cell → value cell
        const tmMatch = html.match(/Trade\s*Name[^<]*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,80})/i);
        if (tmMatch) tn = tmMatch[1].trim();
        const lnMatch = html.match(/Legal\s*Name[^<]*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,80})/i);
        if (lnMatch) ln = lnMatch[1].trim();
        // Fallback: title tag (knowyourgst includes business name in title)
        if (!tn && !ln) {
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch) {
            let t = titleMatch[1].replace(/[\|\-].*KnowYourGST.*/i, '').trim();
            if (t && !t.toUpperCase().includes(g)) tn = t;
          }
        }
        if (tn || ln) {
          const out = { tradeName:tn, legalName:ln, state:staticInfo.state,
                        stateCode:staticInfo.stateCode, entityType:staticInfo.entityType,
                        source:'knowyourgst_proxy' };
          _gstinCache.set(g, out); _gstinInFlight.delete(g); return out;
        }
      }
    } catch (_) { /* proxy down — continue */ }

    // ── Source 4: Backend API (last resort, keeps old behaviour) ──────────
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`/api/gst-reconciliation/gstin-lookup/${g}`, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, Accept: 'application/json' },
      });
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        const tn = (d.trade_name || '').trim();
        const ln = (d.legal_name || '').trim();
        if (tn || ln) {
          const out = { tradeName:tn, legalName:ln, state:staticInfo.state,
                        stateCode:staticInfo.stateCode, entityType:staticInfo.entityType,
                        source:'backend_api' };
          _gstinCache.set(g, out); _gstinInFlight.delete(g); return out;
        }
      }
    } catch (_) { /* backend unreachable — return static info */ }

    // All sources failed — return static info decoded from GSTIN itself
    const out = { tradeName:'', legalName:'', ...staticInfo, source:'static_decode_only' };
    _gstinCache.set(g, out);
    _gstinInFlight.delete(g);
    return out;
  })();

  _gstinInFlight.set(g, promise);
  return promise;
}

/**
 * extractPortalMetadata — reads the GSTR-2B Excel header rows (0-9) to pull:
 *   • period     e.g. "Oct-24"  (from "Return Period : 102024" or "October 2024")
 *   • gstin      e.g. "24XXXXX…" (the taxpayer's own GSTIN in the header)
 *   • tradeName  e.g. "MED 7 PHARMACY"
 *
 * GSTR-2B files from GST portal always embed these in rows before the data
 * table header.  Layout varies slightly across FY/portal versions, so we scan
 * every cell in rows 0-12 rather than hard-coding row indices.
 */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function _parsePeriodString(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  // "102024" or "012025"
  const m1 = s.match(/^(0[1-9]|1[0-2])(\d{4})$/);
  if (m1) return _fmtPeriod(m1[1], m1[2]);
  // "October 2024" / "Oct-2024"
  const MONTHS = ['january','february','march','april','may','june',
                  'july','august','september','october','november','december'];
  const m2 = s.match(/([a-z]{3,})[^a-z]*(\d{4})/i);
  if (m2) {
    const idx = MONTHS.findIndex(mo => mo.startsWith(m2[1].toLowerCase().slice(0,3)));
    if (idx >= 0) return _fmtPeriod(String(idx + 1).padStart(2,'0'), m2[2]);
  }
  return s; // Return as-is when unrecognised
}
function _fmtPeriod(mm, yyyy) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mm,10)-1]}-${yyyy.slice(2)}`;
}

function extractPortalMetadata(workbook) {
  // Use B2B sheet if present, else first sheet
  const sheetName =
    workbook.SheetNames.find(n => n.trim().toUpperCase() === 'B2B') ||
    workbook.SheetNames[0];
  const ws   = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let period = '', gstin = '', tradeName = '';

  for (let i = 0; i < Math.min(rows.length, 13); i++) {
    const row = rows[i];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim();
      if (!cell) continue;
      const lo = cell.toLowerCase();

      // ── GSTIN of taxpayer ──────────────────────────────────────────────
      if (!gstin) {
        // Pattern: "GSTIN : 24XXXXX" in one cell
        const gm = cell.match(/gstin\s*[:\-]\s*([A-Z0-9]{15})/i);
        if (gm && GSTIN_PATTERN.test(gm[1].toUpperCase())) {
          gstin = gm[1].toUpperCase();
        }
        // Previous/current cell is "GSTIN" and this cell is the value
        if (!gstin && GSTIN_PATTERN.test(cell.toUpperCase().replace(/\s/g,''))) {
          const prev = String(row[c-1] ?? '').toLowerCase();
          if (prev.includes('gstin') || i < 6) {
            gstin = cell.toUpperCase().replace(/\s/g,'');
          }
        }
      }

      // ── Return period ───────────────────────────────────────────────────
      if (!period) {
        if (lo.includes('return period') || lo.includes('tax period') || lo.includes('filing period')) {
          // "Return Period : 102024" — value may be in next cell or same cell
          const inCell = cell.match(/period\s*[:\-]\s*(.+)/i);
          if (inCell) { period = _parsePeriodString(inCell[1].trim()); }
          else {
            const next = String(row[c+1] ?? '').trim();
            if (next) period = _parsePeriodString(next);
          }
        }
        // "Period : 102024" standalone label in col 0
        if (!period && lo.startsWith('period')) {
          const vm = cell.match(/period\s*[:\-]\s*(.+)/i);
          if (vm) period = _parsePeriodString(vm[1].trim());
          else {
            const next = String(row[c+1] ?? '').trim();
            if (next) period = _parsePeriodString(next);
          }
        }
        // Raw 6-digit numeric period e.g. "102024" sitting alone in a cell
        if (!period && /^(0[1-9]|1[0-2])\d{4}$/.test(cell)) {
          period = _parsePeriodString(cell);
        }
      }

      // ── Trade / Legal name ──────────────────────────────────────────────
      if (!tradeName) {
        if (lo.includes('trade name') || lo.includes('legal name') || lo.includes('trade/legal')) {
          const nm = cell.match(/(?:trade|legal)\s*(?:name)?\s*[:\-]\s*(.+)/i);
          if (nm && nm[1].trim().length > 1) { tradeName = nm[1].trim(); }
          else {
            const next = String(row[c+1] ?? '').trim();
            if (next && next.length > 1 && !GSTIN_PATTERN.test(next.toUpperCase()))
              tradeName = next;
          }
        }
      }

      if (period && gstin && tradeName) break;
    }
    if (period && gstin && tradeName) break;
  }

  return { period, gstin, tradeName };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RECONCILIATION ENGINE
═══════════════════════════════════════════════════════════════════════════ */
const TOLERANCE = 1.01;

/**
 * extractNumericSuffix — delegates to normaliseInvoice (same logic).
 * Used by the secondary prefix-match pass.
 */
function extractNumericSuffix(invNo) {
  return normaliseInvoice(invNo);
}

/**
 * Check whether two invoices differ ONLY in invoice prefix
 * (all financial + identity fields match, numeric part of invoice is same)
 */
function isPrefixOnlyMismatch(p, b) {
  const pNum = extractNumericSuffix(p.invoiceNoRaw || p.invoiceNo);
  const bNum = extractNumericSuffix(b.invoiceNoRaw || b.invoiceNo);
  if (pNum !== bNum || !pNum) return false;
  // GSTIN must match
  if (p.gstin !== b.gstin) return false;
  // All financial fields must match within tolerance
  const vd = Math.abs(p.invoiceValue - b.invoiceValue);
  const taxD  = Math.abs((p.igst+p.cgst+p.sgst) - (b.igst+b.cgst+b.sgst));
  const taxableD = Math.abs(p.taxableValue - b.taxableValue);
  if (vd > TOLERANCE || taxD > TOLERANCE || taxableD > TOLERANCE) return false;
  // Date must match (if both present)
  if (p.invoiceDate && b.invoiceDate && p.invoiceDate !== b.invoiceDate) return false;
  // Place of supply: normalise by stripping leading state-code prefix (e.g. "24-Gujarat" → "GUJARAT")
  // so portal "Gujarat" matches books "24-Gujarat"
  const ps1 = (p.placeOfSupply||'').trim().toUpperCase().replace(/^\d{1,2}-/, '');
  const ps2 = (b.placeOfSupply||'').trim().toUpperCase().replace(/^\d{1,2}-/, '');
  if (ps1 && ps2 && ps1 !== ps2) return false;
  return true;
}

/**
 * Count how many fields differ between a portal and books invoice pair.
 * Returns { count, fields[] } so callers can decide routing.
 */
function countMismatchFields(p, b) {
  const fields = [];
  if (Math.abs(p.invoiceValue - b.invoiceValue) > TOLERANCE)  fields.push('Invoice Value');
  const ptax = p.igst + p.cgst + p.sgst;
  const btax = b.igst + b.cgst + b.sgst;
  if (Math.abs(ptax - btax) > TOLERANCE)                       fields.push('Total Tax');
  if (Math.abs(p.igst - b.igst) > TOLERANCE)                  fields.push('IGST');
  if (Math.abs(p.cgst - b.cgst) > TOLERANCE)                  fields.push('CGST');
  if (Math.abs(p.sgst - b.sgst) > TOLERANCE)                  fields.push('SGST');
  if (Math.abs(p.taxableValue - b.taxableValue) > TOLERANCE)  fields.push('Taxable Value');
  if (p.invoiceDate && b.invoiceDate && p.invoiceDate !== b.invoiceDate) fields.push('Invoice Date');
  const ps = (p.placeOfSupply||'').trim().toUpperCase().replace(/^\d+-/,'');
  const bs = (b.placeOfSupply||'').trim().toUpperCase().replace(/^\d+-/,'');
  if (ps && bs && ps !== bs)                                   fields.push('Place of Supply');
  // Reverse charge: intentionally NOT counted as a financial mismatch.
  // It's a metadata flag — invoices where only RC flag differs are still considered matched.
  const rcMismatch = !!(
    p.reverseCharge && b.reverseCharge &&
    p.reverseCharge.toUpperCase() !== b.reverseCharge.toUpperCase()
  );
  return { count: fields.length, fields, rcMismatch };
}

function reconcile(portalData, booksData) {
  const pm = new Map(), bm = new Map();
  portalData.forEach(inv => { const k = `${inv.gstin}__${inv.invoiceNo}`; if (!pm.has(k)) pm.set(k, inv); });
  booksData.forEach(inv  => { const k = `${inv.gstin}__${inv.invoiceNo}`; if (!bm.has(k)) bm.set(k, inv); });

  const matched = [], mismatch = [], portalOnly = [], booksOnly = [], checkOne = [];

  // Track which books keys have been consumed
  const bUsed = new Set();

  pm.forEach((p, key) => {
    if (bm.has(key)) {
      bUsed.add(key);
      const b = bm.get(key);
      const { count, fields, rcMismatch } = countMismatchFields(p, b);
      const normalizedMatch = p.invoiceNoRaw !== b.invoiceNoRaw;
      if (count === 0) {
        matched.push({ portal: p, books: b, key, rcMismatch, normalizedMatch });
      } else {
        // All mismatches (1 field or 10 fields) go to Amount Mismatch
        mismatch.push({
          portal: p, books: b, key,
          mismatchFields: fields,
          mismatchCount: count,
          rcMismatch, normalizedMatch,
          valueDiff: p.invoiceValue - b.invoiceValue,
          taxDiff: (p.igst+p.cgst+p.sgst)-(b.igst+b.cgst+b.sgst),
        });
      }
    } else {
      portalOnly.push({ portal: p, key });
    }
  });

  bm.forEach((b, key) => { if (!pm.has(key)) booksOnly.push({ books: b, key }); });

  // ── PREFIX-ONLY MATCH PASS ──────────────────────────────────────────────
  const portalOnlyFinal = [];
  const booksOnlyUsed   = new Set();

  portalOnly.forEach(po => {
    let found = null;
    for (const bo of booksOnly) {
      if (booksOnlyUsed.has(bo.key)) continue;
      if (isPrefixOnlyMismatch(po.portal, bo.books)) { found = bo; break; }
    }
    if (found) {
      booksOnlyUsed.add(found.key);
      const p = po.portal, b = found.books;
      const { count, fields, rcMismatch } = countMismatchFields(p, b);
      const allMatch = count === 0 &&
        (!p.invoiceDate || !b.invoiceDate || p.invoiceDate === b.invoiceDate);
      checkOne.push({
        portal: p, books: b, key: po.key,
        prefixMismatch: true,
        portalInvRaw: p.invoiceNoRaw, booksInvRaw: b.invoiceNoRaw,
        allOtherMatch: allMatch,
        rcMismatch,
        mismatchFields: allMatch ? ['Invoice No (prefix only)'] : ['Invoice No (prefix)', ...fields],
        mismatchCount: allMatch ? 1 : count + 1,
        valueDiff: p.invoiceValue - b.invoiceValue,
        taxDiff: (p.igst+p.cgst+p.sgst)-(b.igst+b.cgst+b.sgst),
      });
    } else {
      portalOnlyFinal.push(po);
    }
  });

  const booksOnlyFinal = booksOnly.filter(bo => !booksOnlyUsed.has(bo.key));

  // Prefix-matched with all values matching → goes to Matched (yellow row)
  const matchedFinal = [
    ...matched,
    ...checkOne.filter(c => c.allOtherMatch).map(c => ({ ...c, prefixMismatch: true })),
  ];
  // Prefix-matched with value diffs → goes to Amount Mismatch
  const mismatchFinal = [
    ...mismatch,
    ...checkOne.filter(c => !c.allOtherMatch),
  ];

  return {
    matched:    matchedFinal,
    mismatch:   mismatchFinal,
    portalOnly: portalOnlyFinal,
    booksOnly:  booksOnlyFinal,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
═══════════════════════════════════════════════════════════════════════════ */
const fmt = n => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const sumVal = (arr, src) => arr.reduce((s, r) => s + (r[src]?.invoiceValue || 0), 0);
const sumTax = (arr, src) => arr.reduce((s, r) => { const i = r[src]; return s + (i ? i.igst+i.cgst+i.sgst : 0); }, 0);

/* ═══════════════════════════════════════════════════════════════════════════
   PDF EXPORT  (jsPDF + autotable — landscape A4)
═══════════════════════════════════════════════════════════════════════════ */
function exportPDF(results, company, period) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const BRAND  = [13, 59, 102];
  const BRAND2 = [31, 111, 178];
  const GREEN  = [16, 185, 129];
  const AMBER  = [245, 158, 11];
  const BLUE   = [59, 130, 246];
  const ROSE   = [239, 68, 68];
  const LGRAY  = [248, 250, 252];
  const GRAY   = [100, 116, 139];
  const DGRAY  = [30, 41, 59];

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── Helper: add page header ────────────────────────────────────────────
  function addPageHeader(title, pageColor) {
    doc.setFillColor(...(pageColor || BRAND));
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('GST RECONCILIATION REPORT', 14, 7);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(company.name || '', 14, 13);
    doc.setFontSize(8);
    doc.text(`${period || ''} | Generated: ${dateStr}`, W - 14, 7, { align: 'right' });
    doc.text(`GSTIN: ${company.gstin || ''}`, W - 14, 13, { align: 'right' });
    doc.setTextColor(...DGRAY);
  }

  // ── Helper: section heading ────────────────────────────────────────────
  function sectionHeading(y, text, color, count, value) {
    doc.setFillColor(...(color || BRAND));
    doc.roundedRect(14, y, W - 28, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(text, 18, y + 6);
    if (count !== undefined) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`${count} invoices  |  ₹${fmt(value)}`, W - 18, y + 6, { align: 'right' });
    }
    doc.setTextColor(...DGRAY);
    return y + 12;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PAGE 1 — COVER + SUMMARY
  // ─────────────────────────────────────────────────────────────────────
  // Full-width gradient banner
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 55, 'F');
  doc.setFillColor(...BRAND2);
  doc.triangle(W - 80, 0, W, 0, W, 55, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text('GST Reconciliation Report', 14, 22);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(company.name || 'Company Name', 14, 32);
  doc.setFontSize(9);
  const subtitle = [
    company.gstin ? `GSTIN: ${company.gstin}` : null,
    period ? `Period: ${period}` : null,
    company.fy ? `FY: ${company.fy}` : null,
  ].filter(Boolean).join('   •   ');
  doc.text(subtitle, 14, 40);
  doc.text(`Generated on ${dateStr}`, 14, 48);

  if (company.address) {
    doc.setFontSize(8);
    doc.text(company.address, W - 14, 30, { align: 'right', maxWidth: 100 });
  }

  // Summary stat cards
  const cards = [
    { label: 'Total Portal Invoices',  val: results.matched.length + results.mismatch.length + results.portalOnly.length, sub: '', color: BRAND },
    { label: 'Total Books Invoices',   val: results.matched.length + results.mismatch.length + results.booksOnly.length,  sub: '', color: BRAND2 },
    { label: 'Matched',                val: results.matched.length,    sub: `₹${fmt(sumVal(results.matched,'portal'))}`,    color: GREEN },
    { label: 'Amount Mismatch',        val: results.mismatch.length,   sub: `₹${fmt(sumVal(results.mismatch,'portal'))}`,   color: AMBER },
    { label: 'In Portal Only',         val: results.portalOnly.length, sub: `₹${fmt(sumVal(results.portalOnly,'portal'))}`, color: BLUE },
    { label: 'In Books Only',          val: results.booksOnly.length,  sub: `₹${fmt(sumVal(results.booksOnly,'books'))}`,   color: ROSE },
  ];
  const cardW = (W - 28 - 10) / 6;
  cards.forEach((card, i) => {
    const x = 14 + i * (cardW + 2);
    const y = 62;
    doc.setFillColor(...card.color);
    doc.roundedRect(x, y, cardW, 22, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(String(card.val), x + cardW / 2, y + 10, { align: 'center' });
    doc.setFontSize(6); doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + cardW / 2, y + 15, { align: 'center' });
    if (card.sub) doc.text(card.sub, x + cardW / 2, y + 19.5, { align: 'center' });
  });

  // Tax summary table
  doc.setTextColor(...DGRAY);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Tax Summary', 14, 96);
  autoTable(doc, {
    startY: 99,
    head: [['Category', 'Invoices', 'Invoice Value (₹)', 'Taxable Value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Total Tax (₹)']],
    body: [
      ['Matched',
        results.matched.length,
        fmt(sumVal(results.matched, 'portal')),
        fmt(results.matched.reduce((s,r) => s + r.portal.taxableValue, 0)),
        fmt(results.matched.reduce((s,r) => s + r.portal.igst, 0)),
        fmt(results.matched.reduce((s,r) => s + r.portal.cgst, 0)),
        fmt(results.matched.reduce((s,r) => s + r.portal.sgst, 0)),
        fmt(sumTax(results.matched, 'portal')),
      ],
      ['Amount Mismatch',
        results.mismatch.length,
        fmt(sumVal(results.mismatch, 'portal')),
        fmt(results.mismatch.reduce((s,r) => s + r.portal.taxableValue, 0)),
        fmt(results.mismatch.reduce((s,r) => s + r.portal.igst, 0)),
        fmt(results.mismatch.reduce((s,r) => s + r.portal.cgst, 0)),
        fmt(results.mismatch.reduce((s,r) => s + r.portal.sgst, 0)),
        fmt(sumTax(results.mismatch, 'portal')),
      ],
      ['In Portal Only (Not in Books)',
        results.portalOnly.length,
        fmt(sumVal(results.portalOnly, 'portal')),
        fmt(results.portalOnly.reduce((s,r) => s + r.portal.taxableValue, 0)),
        fmt(results.portalOnly.reduce((s,r) => s + r.portal.igst, 0)),
        fmt(results.portalOnly.reduce((s,r) => s + r.portal.cgst, 0)),
        fmt(results.portalOnly.reduce((s,r) => s + r.portal.sgst, 0)),
        fmt(sumTax(results.portalOnly, 'portal')),
      ],
      ['In Books Only (ITC Risk)',
        results.booksOnly.length,
        fmt(sumVal(results.booksOnly, 'books')),
        fmt(results.booksOnly.reduce((s,r) => s + r.books.taxableValue, 0)),
        fmt(results.booksOnly.reduce((s,r) => s + r.books.igst, 0)),
        fmt(results.booksOnly.reduce((s,r) => s + r.books.cgst, 0)),
        fmt(results.booksOnly.reduce((s,r) => s + r.books.sgst, 0)),
        fmt(sumTax(results.booksOnly, 'books')),
      ],
    ],
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: LGRAY },
    columnStyles: { 0: { fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
    tableWidth: 'auto',
  });

  // ─────────────────────────────────────────────────────────────────────
  // PAGE 2 — MATCHED INVOICES
  // ─────────────────────────────────────────────────────────────────────
  if (results.matched.length > 0) {
    doc.addPage();
    addPageHeader('Matched Invoices', GREEN);
    let y = sectionHeading(22, '✓  Matched Invoices — Present in both GST Portal and Books with matching amounts', GREEN, results.matched.length, sumVal(results.matched, 'portal'));
    autoTable(doc, {
      startY: y,
      head: [['#', 'GSTIN', 'Party Name', 'Invoice No', 'Date', 'Invoice Value (₹)', 'Taxable Value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Cess (₹)']],
      body: results.matched.map((r, i) => [
        i + 1, r.portal.gstin, r.portal.tradeOrLegalName || '—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate, fmt(r.portal.invoiceValue), fmt(r.portal.taxableValue),
        fmt(r.portal.igst), fmt(r.portal.cgst), fmt(r.portal.sgst), fmt(r.portal.cess),
      ]),
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 32 }, 2: { cellWidth: 38 }, 3: { cellWidth: 22 } },
      margin: { left: 14, right: 14 },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // PAGE 3 — AMOUNT MISMATCH
  // ─────────────────────────────────────────────────────────────────────
  if (results.mismatch.length > 0) {
    doc.addPage();
    addPageHeader('Amount Mismatch', AMBER);
    let y = sectionHeading(22, '⚠  Amount Mismatch — Invoice found in both but amounts differ', AMBER, results.mismatch.length, sumVal(results.mismatch, 'portal'));
    autoTable(doc, {
      startY: y,
      head: [['#', 'GSTIN', 'Party Name', 'Inv No', 'Date', 'Portal Value', 'Books Value', 'Diff (₹)', 'Portal Tax', 'Books Tax', 'Tax Diff (₹)']],
      body: results.mismatch.map((r, i) => [
        i + 1, r.portal.gstin, r.portal.tradeOrLegalName || '—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate,
        fmt(r.portal.invoiceValue), fmt(r.books.invoiceValue),
        { content: (r.valueDiff > 0 ? '+' : '') + fmt(r.valueDiff), styles: { textColor: r.valueDiff > 0 ? [37,99,235] : [220,38,38], fontStyle: 'bold' }},
        fmt(r.portal.igst + r.portal.cgst + r.portal.sgst),
        fmt(r.books.igst + r.books.cgst + r.books.sgst),
        { content: (r.taxDiff > 0 ? '+' : '') + fmt(r.taxDiff), styles: { textColor: r.taxDiff > 0 ? [37,99,235] : [220,38,38], fontStyle: 'bold' }},
      ]),
      headStyles: { fillColor: AMBER, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 32 }, 2: { cellWidth: 36 } },
      margin: { left: 14, right: 14 },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // PAGE 4 — IN PORTAL ONLY
  // ─────────────────────────────────────────────────────────────────────
  if (results.portalOnly.length > 0) {
    doc.addPage();
    addPageHeader('In Portal Only', BLUE);
    let y = sectionHeading(22, '🌐  In GST Portal Only — Vendor uploaded but NOT recorded in Books. Action required.', BLUE, results.portalOnly.length, sumVal(results.portalOnly, 'portal'));
    autoTable(doc, {
      startY: y,
      head: [['#', 'GSTIN', 'Party Name', 'Invoice No', 'Date', 'Invoice Value (₹)', 'Taxable (₹)', 'IGST', 'CGST', 'SGST', 'Place', 'ITC']],
      body: results.portalOnly.map((r, i) => [
        i + 1, r.portal.gstin, r.portal.tradeOrLegalName || '—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate, fmt(r.portal.invoiceValue), fmt(r.portal.taxableValue),
        fmt(r.portal.igst), fmt(r.portal.cgst), fmt(r.portal.sgst),
        r.portal.placeOfSupply || '—',
        { content: r.portal.itcAvailability || '—', styles: { textColor: r.portal.itcAvailability?.toLowerCase() === 'yes' ? [5,150,105] : [100,116,139], fontStyle: 'bold' }},
      ]),
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 32 }, 2: { cellWidth: 36 } },
      margin: { left: 14, right: 14 },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // PAGE 5 — IN BOOKS ONLY
  // ─────────────────────────────────────────────────────────────────────
  if (results.booksOnly.length > 0) {
    doc.addPage();
    addPageHeader('In Books Only', ROSE);
    let y = sectionHeading(22, '📒  In Books Only — Recorded in Books but vendor has NOT uploaded to GST Portal. ITC at risk!', ROSE, results.booksOnly.length, sumVal(results.booksOnly, 'books'));

    // Risk warning box
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(...ROSE);
    doc.roundedRect(14, y, W - 28, 10, 2, 2, 'FD');
    doc.setTextColor(...ROSE);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('⚠ ITC RISK: These invoices are in your books but the vendor has not filed them on the GST portal. You may need to follow up with the vendor to avoid ITC reversal.', 18, y + 6.5, { maxWidth: W - 36 });
    doc.setTextColor(...DGRAY);
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [['#', 'GSTIN', 'Invoice No', 'Date', 'Invoice Value (₹)', 'Taxable (₹)', 'IGST', 'CGST', 'SGST', 'Cess', 'Place', 'Type', 'Rate%']],
      body: results.booksOnly.map((r, i) => [
        i + 1, r.books.gstin, r.books.invoiceNoRaw, r.books.invoiceDate,
        fmt(r.books.invoiceValue), fmt(r.books.taxableValue),
        fmt(r.books.igst), fmt(r.books.cgst), fmt(r.books.sgst), fmt(r.books.cess),
        r.books.placeOfSupply || '—', r.books.invoiceType || '—', r.books.rate || '—',
      ]),
      headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: [255, 241, 242] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 32 } },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Page numbers ───────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(`Page ${p} of ${totalPages}`, W / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
    doc.text('Confidential — GST Reconciliation Report', 14, doc.internal.pageSize.getHeight() - 5);
    doc.text(company.name || '', W - 14, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
  }

  const fname = `GST_Recon_${(company.name || 'Report').replace(/\s+/g,'_')}_${period ? period.replace(/\s+/g,'_') : 'Export'}.pdf`;
  doc.save(fname);
  toast.success('PDF report downloaded successfully!');
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORD (.doc) EXPORT  — HTML-to-Word via Blob + file-saver
═══════════════════════════════════════════════════════════════════════════ */
function exportWord(results, company, period) {
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const rowsHtml = (headers, rows, headBg = '#0D3B66') => `
    <table style="border-collapse:collapse;width:100%;font-size:9pt;margin-bottom:14pt;">
      <thead>
        <tr>${headers.map(h => `<th style="background:${headBg};color:#fff;padding:5pt 7pt;border:1px solid #cbd5e1;text-align:left;font-weight:bold;white-space:nowrap;">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row, ri) => `
          <tr style="background:${ri % 2 === 0 ? '#f8fafc' : '#fff'};">
            ${row.map(cell => {
              const val = typeof cell === 'object' ? cell.v : cell;
              const style = typeof cell === 'object' ? `color:${cell.c};font-weight:bold;` : '';
              return `<td style="padding:4pt 7pt;border:1px solid #e2e8f0;${style}">${val ?? ''}</td>`;
            }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;

  const section = (title, badge, badgeBg, rows, total, description, extraHtml = '') => `
    <div style="page-break-before:always;">
      <div style="background:${badgeBg};color:#fff;padding:10pt 14pt;border-radius:4pt;margin-bottom:10pt;">
        <span style="font-size:13pt;font-weight:bold;">${title}</span>
        <span style="float:right;font-size:10pt;">${rows.length} invoices &nbsp;|&nbsp; ₹${fmt(total)}</span>
      </div>
      ${description ? `<p style="background:#f1f5f9;border-left:4pt solid ${badgeBg};padding:8pt 12pt;font-size:9pt;color:#475569;margin-bottom:10pt;">${description}</p>` : ''}
      ${extraHtml}
    </div>`;

  const matchedSection = results.matched.length === 0 ? '' : section(
    '✓  Matched Invoices', '', '#10b981', results.matched,
    sumVal(results.matched, 'portal'),
    'These invoices are present in both the GST Portal (GSTR-2B) and your Books of Account with matching amounts. No action required.',
    rowsHtml(
      ['#','GSTIN','Party Name','Invoice No','Date','Invoice Value (₹)','Taxable Value (₹)','IGST (₹)','CGST (₹)','SGST (₹)','Cess (₹)'],
      results.matched.map((r, i) => [
        i+1, r.portal.gstin, r.portal.tradeOrLegalName||'—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate, fmt(r.portal.invoiceValue), fmt(r.portal.taxableValue),
        fmt(r.portal.igst), fmt(r.portal.cgst), fmt(r.portal.sgst), fmt(r.portal.cess),
      ]),
      '#10b981'
    )
  );

  const mismatchSection = results.mismatch.length === 0 ? '' : section(
    '⚠  Amount Mismatch', '', '#f59e0b', results.mismatch,
    sumVal(results.mismatch, 'portal'),
    'Invoice numbers match but the invoice value or tax amount differs between the GST Portal and Books. Please verify and correct the entries.',
    rowsHtml(
      ['#','GSTIN','Party Name','Invoice No','Date','Portal Value','Books Value','Diff (₹)','Portal Tax','Books Tax','Tax Diff (₹)'],
      results.mismatch.map((r, i) => [
        i+1, r.portal.gstin, r.portal.tradeOrLegalName||'—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate,
        fmt(r.portal.invoiceValue), fmt(r.books.invoiceValue),
        { v: (r.valueDiff>0?'+':'')+fmt(r.valueDiff), c: r.valueDiff>0?'#1d4ed8':'#dc2626' },
        fmt(r.portal.igst+r.portal.cgst+r.portal.sgst),
        fmt(r.books.igst+r.books.cgst+r.books.sgst),
        { v: (r.taxDiff>0?'+':'')+fmt(r.taxDiff), c: r.taxDiff>0?'#1d4ed8':'#dc2626' },
      ]),
      '#f59e0b'
    )
  );

  const portalOnlySection = results.portalOnly.length === 0 ? '' : section(
    '🌐  In GST Portal Only', '', '#3b82f6', results.portalOnly,
    sumVal(results.portalOnly, 'portal'),
    'Vendor has filed these invoices on the GST Portal but they are NOT recorded in your Books of Account. These must be booked to avail ITC.',
    rowsHtml(
      ['#','GSTIN','Party Name','Invoice No','Date','Invoice Value (₹)','Taxable (₹)','IGST','CGST','SGST','Place of Supply','ITC Available'],
      results.portalOnly.map((r, i) => [
        i+1, r.portal.gstin, r.portal.tradeOrLegalName||'—', r.portal.invoiceNoRaw,
        r.portal.invoiceDate, fmt(r.portal.invoiceValue), fmt(r.portal.taxableValue),
        fmt(r.portal.igst), fmt(r.portal.cgst), fmt(r.portal.sgst),
        r.portal.placeOfSupply||'—',
        { v: r.portal.itcAvailability||'—', c: r.portal.itcAvailability?.toLowerCase()==='yes'?'#059669':'#64748b' },
      ]),
      '#3b82f6'
    )
  );

  const booksOnlySection = results.booksOnly.length === 0 ? '' : section(
    '📒  In Books Only (ITC Risk)', '', '#ef4444', results.booksOnly,
    sumVal(results.booksOnly, 'books'),
    '⚠ ITC RISK: These invoices are recorded in your Books of Account but the vendor has NOT uploaded them to the GST Portal. You cannot claim ITC on these until the vendor files. Follow up with the vendor immediately.',
    rowsHtml(
      ['#','GSTIN','Invoice No','Date','Invoice Value (₹)','Taxable (₹)','IGST','CGST','SGST','Cess','Place','Type','Rate%'],
      results.booksOnly.map((r, i) => [
        i+1, r.books.gstin, r.books.invoiceNoRaw, r.books.invoiceDate,
        fmt(r.books.invoiceValue), fmt(r.books.taxableValue),
        fmt(r.books.igst), fmt(r.books.cgst), fmt(r.books.sgst), fmt(r.books.cess),
        r.books.placeOfSupply||'—', r.books.invoiceType||'—', r.books.rate||'—',
      ]),
      '#ef4444'
    )
  );

  const totalPortal = results.matched.length + results.mismatch.length + results.portalOnly.length;
  const totalBooks  = results.matched.length + results.mismatch.length + results.booksOnly.length;

  const html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <title>GST Reconciliation Report</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>90</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { size: A4 landscape; margin: 2cm 1.5cm; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #1e293b; margin: 0; }
    h1 { font-size: 22pt; color: #0D3B66; margin-bottom: 4pt; }
    h2 { font-size: 14pt; color: #0D3B66; margin: 16pt 0 8pt; }
    h3 { font-size: 11pt; color: #334155; margin: 12pt 0 6pt; }
    p  { margin: 4pt 0; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; font-size: 9pt; margin-bottom: 14pt; }
    th { background: #0D3B66; color: #fff; padding: 5pt 7pt; border: 1px solid #cbd5e1; text-align: left; font-weight: bold; }
    td { padding: 4pt 7pt; border: 1px solid #e2e8f0; }
    .cover-box { background: #0D3B66; color: #fff; padding: 20pt; margin-bottom: 20pt; }
    .meta-grid { display: table; width: 100%; margin-bottom: 16pt; }
    .meta-cell { display: table-cell; width: 50%; vertical-align: top; }
    .stat-row { display: table; width: 100%; margin: 12pt 0; }
    .stat-cell { display: table-cell; width: 16.66%; padding: 8pt; text-align: center; vertical-align: top; }
    .stat-num { font-size: 18pt; font-weight: bold; display: block; }
    .stat-lbl { font-size: 7pt; display: block; }
    .footer { border-top: 1px solid #e2e8f0; margin-top: 20pt; padding-top: 8pt; font-size: 8pt; color: #94a3b8; }
  </style>
</head>
<body>

<!-- ═══ COVER PAGE ═══ -->
<div class="cover-box">
  <h1 style="color:#fff;margin:0 0 6pt;">GST Reconciliation Report</h1>
  <p style="font-size:16pt;font-weight:bold;color:#93c5fd;margin:0 0 10pt;">${company.name || ''}</p>
  <table style="border:none;background:transparent;margin:0;font-size:10pt;">
    <tr>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 0;width:120pt;font-weight:bold;">GSTIN</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${company.gstin || '—'}</td>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 30pt;font-weight:bold;">PAN</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${company.pan || '—'}</td>
    </tr>
    <tr>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 0;font-weight:bold;">Tax Period</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${period || '—'}</td>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 30pt;font-weight:bold;">Financial Year</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${company.fy || '—'}</td>
    </tr>
    <tr>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 0;font-weight:bold;">Address</td>
      <td style="border:none;color:#fff;padding:2pt 0;" colspan="3">${company.address || '—'}</td>
    </tr>
    <tr>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 0;font-weight:bold;">Phone</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${company.phone || '—'}</td>
      <td style="border:none;color:#cbd5e1;padding:2pt 10pt 2pt 30pt;font-weight:bold;">Email</td>
      <td style="border:none;color:#fff;padding:2pt 0;">${company.email || '—'}</td>
    </tr>
    <tr>
      <td style="border:none;color:#cbd5e1;padding:8pt 10pt 2pt 0;font-weight:bold;">Generated On</td>
      <td style="border:none;color:#fff;padding:8pt 0 2pt;" colspan="3">${dateStr}</td>
    </tr>
  </table>
</div>

<!-- ═══ SUMMARY ═══ -->
<h2>Reconciliation Summary</h2>

<table>
  <thead>
    <tr>
      <th style="background:#0D3B66;">Category</th>
      <th style="background:#0D3B66;">Count</th>
      <th style="background:#0D3B66;">Invoice Value (₹)</th>
      <th style="background:#0D3B66;">Taxable Value (₹)</th>
      <th style="background:#0D3B66;">IGST (₹)</th>
      <th style="background:#0D3B66;">CGST (₹)</th>
      <th style="background:#0D3B66;">SGST (₹)</th>
      <th style="background:#0D3B66;">Total Tax (₹)</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background:#f0fdf4;">
      <td style="font-weight:bold;color:#059669;">✓ Matched</td>
      <td style="text-align:center;">${results.matched.length}</td>
      <td>₹${fmt(sumVal(results.matched,'portal'))}</td>
      <td>₹${fmt(results.matched.reduce((s,r)=>s+r.portal.taxableValue,0))}</td>
      <td>₹${fmt(results.matched.reduce((s,r)=>s+r.portal.igst,0))}</td>
      <td>₹${fmt(results.matched.reduce((s,r)=>s+r.portal.cgst,0))}</td>
      <td>₹${fmt(results.matched.reduce((s,r)=>s+r.portal.sgst,0))}</td>
      <td style="font-weight:bold;">₹${fmt(sumTax(results.matched,'portal'))}</td>
    </tr>
    <tr style="background:#fffbeb;">
      <td style="font-weight:bold;color:#d97706;">⚠ Amount Mismatch</td>
      <td style="text-align:center;">${results.mismatch.length}</td>
      <td>₹${fmt(sumVal(results.mismatch,'portal'))}</td>
      <td>₹${fmt(results.mismatch.reduce((s,r)=>s+r.portal.taxableValue,0))}</td>
      <td>₹${fmt(results.mismatch.reduce((s,r)=>s+r.portal.igst,0))}</td>
      <td>₹${fmt(results.mismatch.reduce((s,r)=>s+r.portal.cgst,0))}</td>
      <td>₹${fmt(results.mismatch.reduce((s,r)=>s+r.portal.sgst,0))}</td>
      <td style="font-weight:bold;">₹${fmt(sumTax(results.mismatch,'portal'))}</td>
    </tr>
    <tr style="background:#eff6ff;">
      <td style="font-weight:bold;color:#2563eb;">🌐 In Portal Only</td>
      <td style="text-align:center;">${results.portalOnly.length}</td>
      <td>₹${fmt(sumVal(results.portalOnly,'portal'))}</td>
      <td>₹${fmt(results.portalOnly.reduce((s,r)=>s+r.portal.taxableValue,0))}</td>
      <td>₹${fmt(results.portalOnly.reduce((s,r)=>s+r.portal.igst,0))}</td>
      <td>₹${fmt(results.portalOnly.reduce((s,r)=>s+r.portal.cgst,0))}</td>
      <td>₹${fmt(results.portalOnly.reduce((s,r)=>s+r.portal.sgst,0))}</td>
      <td style="font-weight:bold;">₹${fmt(sumTax(results.portalOnly,'portal'))}</td>
    </tr>
    <tr style="background:#fff1f2;">
      <td style="font-weight:bold;color:#dc2626;">📒 In Books Only (ITC Risk)</td>
      <td style="text-align:center;">${results.booksOnly.length}</td>
      <td>₹${fmt(sumVal(results.booksOnly,'books'))}</td>
      <td>₹${fmt(results.booksOnly.reduce((s,r)=>s+r.books.taxableValue,0))}</td>
      <td>₹${fmt(results.booksOnly.reduce((s,r)=>s+r.books.igst,0))}</td>
      <td>₹${fmt(results.booksOnly.reduce((s,r)=>s+r.books.cgst,0))}</td>
      <td>₹${fmt(results.booksOnly.reduce((s,r)=>s+r.books.sgst,0))}</td>
      <td style="font-weight:bold;">₹${fmt(sumTax(results.booksOnly,'books'))}</td>
    </tr>
    <tr style="background:#f1f5f9;font-weight:bold;">
      <td>TOTAL</td>
      <td style="text-align:center;">${totalPortal}</td>
      <td colspan="6"></td>
    </tr>
  </tbody>
</table>

<p style="font-size:8pt;color:#64748b;margin-top:4pt;">
  Total invoices in Portal: <strong>${totalPortal}</strong> &nbsp;|&nbsp;
  Total invoices in Books: <strong>${totalBooks}</strong>
</p>

<!-- ═══ DETAIL SECTIONS ═══ -->
${matchedSection}
${mismatchSection}
${portalOnlySection}
${booksOnlySection}

<div class="footer">
  <p><strong>Note:</strong> This report is generated automatically based on data uploaded by the user.
     Figures are for reconciliation purposes only. Please verify all discrepancies with source documents before filing.</p>
  <p>Report generated by TaskOsphere &nbsp;|&nbsp; ${dateStr} &nbsp;|&nbsp; ${company.name || ''} &nbsp;|&nbsp; GSTIN: ${company.gstin || ''}</p>
</div>

</body>
</html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const fname = `GST_Recon_${(company.name || 'Report').replace(/\s+/g,'_')}_${period ? period.replace(/\s+/g,'_') : 'Export'}.doc`;
  saveAs(blob, fname);
  toast.success('Word document downloaded successfully!');
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXCEL EXPORT
═══════════════════════════════════════════════════════════════════════════ */
function exportExcel(results, company, period) {
  const wb = XLSX.utils.book_new();
  const summaryRows = [
    ['GST Reconciliation Report', '', '', company.name || ''],
    ['GSTIN', company.gstin || '', 'PAN', company.pan || ''],
    ['Address', company.address || '', 'Phone', company.phone || ''],
    ['Period', period || '', 'FY', company.fy || ''],
    ['Generated On', new Date().toLocaleDateString('en-IN')],
    [],
    ['Category', 'Count', 'Invoice Value (₹)', 'Total Tax (₹)'],
    ['Matched',           results.matched.length,    sumVal(results.matched,'portal').toFixed(2),    sumTax(results.matched,'portal').toFixed(2)],
    ['Amount Mismatch',   results.mismatch.length,   sumVal(results.mismatch,'portal').toFixed(2),   sumTax(results.mismatch,'portal').toFixed(2)],
    ['In Portal Only',    results.portalOnly.length, sumVal(results.portalOnly,'portal').toFixed(2), sumTax(results.portalOnly,'portal').toFixed(2)],
    ['In Books Only',     results.booksOnly.length,  sumVal(results.booksOnly,'books').toFixed(2),   sumTax(results.booksOnly,'books').toFixed(2)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
  const mH = ['GSTIN','Party Name','Invoice No','Date','Portal Value','Books Value','Value Diff','Portal Tax','Books Tax','Tax Diff'];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#','GSTIN','Party Name','Invoice No','Date','Invoice Value (₹)','Taxable (₹)','IGST','CGST','SGST','Cess'],
    ...results.matched.map((r,i)=>[i+1,r.portal.gstin,r.portal.tradeOrLegalName||'',r.portal.invoiceNoRaw,r.portal.invoiceDate,r.portal.invoiceValue,r.portal.taxableValue,r.portal.igst,r.portal.cgst,r.portal.sgst,r.portal.cess])
  ]), 'Matched');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#',...mH],
    ...results.mismatch.map((r,i)=>[i+1,r.portal.gstin,r.portal.tradeOrLegalName||'',r.portal.invoiceNoRaw,r.portal.invoiceDate,r.portal.invoiceValue,r.books.invoiceValue,r.valueDiff.toFixed(2),(r.portal.igst+r.portal.cgst+r.portal.sgst).toFixed(2),(r.books.igst+r.books.cgst+r.books.sgst).toFixed(2),r.taxDiff.toFixed(2)])
  ]), 'Mismatch');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#','GSTIN','Party Name','Invoice No','Date','Invoice Value','Taxable','IGST','CGST','SGST','Place','ITC'],
    ...results.portalOnly.map((r,i)=>[i+1,r.portal.gstin,r.portal.tradeOrLegalName||'',r.portal.invoiceNoRaw,r.portal.invoiceDate,r.portal.invoiceValue,r.portal.taxableValue,r.portal.igst,r.portal.cgst,r.portal.sgst,r.portal.placeOfSupply,r.portal.itcAvailability])
  ]), 'In Portal Only');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#','GSTIN','Invoice No','Date','Invoice Value','Taxable','IGST','CGST','SGST','Cess','Place','Type','Rate'],
    ...results.booksOnly.map((r,i)=>[i+1,r.books.gstin,r.books.invoiceNoRaw,r.books.invoiceDate,r.books.invoiceValue,r.books.taxableValue,r.books.igst,r.books.cgst,r.books.sgst,r.books.cess,r.books.placeOfSupply,r.books.invoiceType,r.books.rate])
  ]), 'In Books Only');
  XLSX.writeFile(wb, `GST_Recon_${(company.name||'Report').replace(/\s+/g,'_')}_${period?period.replace(/\s+/g,'_'):'Export'}.xlsx`);
  toast.success('Excel report downloaded successfully!');
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id:'matched',    label:'Matched',        icon:CheckCircle2,  color:{ activeBg:'bg-emerald-50 dark:bg-emerald-900/20', activeBorder:'border-emerald-400', activeText:'text-emerald-700 dark:text-emerald-300', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }, desc:'Invoices present in both GSTR-2B and Books with matching amounts. No action required.' },
  { id:'mismatch',   label:'Amount Mismatch',icon:AlertTriangle,  color:{ activeBg:'bg-amber-50 dark:bg-amber-900/20',   activeBorder:'border-amber-400',   activeText:'text-amber-700 dark:text-amber-300',   badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'   }, desc:'Invoice number matches but invoice value or tax differs between Portal and Books.' },
  { id:'portalOnly', label:'In Portal Only', icon:Globe,          color:{ activeBg:'bg-blue-50 dark:bg-blue-900/20',     activeBorder:'border-blue-400',     activeText:'text-blue-700 dark:text-blue-300',     badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'     }, desc:'Vendor uploaded to GST Portal but NOT in Books. Book these to avail ITC.' },
  { id:'booksOnly',  label:'In Books Only',  icon:BookOpen,       color:{ activeBg:'bg-rose-50 dark:bg-rose-900/20',     activeBorder:'border-rose-400',     activeText:'text-rose-700 dark:text-rose-300',     badge:'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'     }, desc:'In Books but vendor NOT filed on portal. ITC at risk — follow up with vendor.' },
  { id:'search',     label:'Search',         icon:ScanSearch,     color:{ activeBg:'bg-purple-50 dark:bg-purple-900/20', activeBorder:'border-purple-400',   activeText:'text-purple-700 dark:text-purple-300', badge:'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' }, desc:'Search across all invoices in one place.' },
];
const PAGE_SIZE = 50;

/* ═══════════════════════════════════════════════════════════════════════════
   DROPZONE COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
const DropZone = ({ label, icon:Icon, colors, file, onFile, onClear, hint }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const handleDrop = useCallback(e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }, [onFile]);
  return (
    <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
      onClick={()=>!file&&inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed transition-all duration-200 p-5 flex flex-col items-center justify-center gap-3 min-h-[140px] ${
        file ? `${colors.done} cursor-default` : dragging ? `${colors.drag} cursor-copy` : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-400 cursor-pointer'
      }`}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>{const f=e.target.files[0];if(f)onFile(f);e.target.value='';}} />
      <div className={`p-2.5 rounded-full ${file?colors.iconBg:'bg-slate-200 dark:bg-slate-700'}`}>
        {file ? <CheckCircle2 className={`h-5 w-5 ${colors.iconColor}`}/> : <Icon className="h-5 w-5 text-slate-400"/>}
      </div>
      <div className="text-center">
        <p className="font-semibold text-sm text-slate-700 dark:text-slate-200">{label}</p>
        {file ? (
          <div className="flex items-center gap-2 mt-1 justify-center">
            <span className={`text-xs font-medium ${colors.iconColor} truncate max-w-[180px]`}>{file.name}</span>
            <button onClick={e=>{e.stopPropagation();onClear();}} className="p-0.5 rounded hover:bg-white/50"><X className={`h-3.5 w-3.5 ${colors.iconColor}`}/></button>
          </div>
        ) : <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
      {!file && <button onClick={e=>{e.stopPropagation();inputRef.current?.click();}} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${colors.btn}`}>Browse File</button>}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   RESULT TABLE COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
const ResultTable = ({ tabId, records, onDelete, onMarkMatched }) => {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const filtered = records.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const inv = tabId === 'booksOnly' ? r.books : r.portal;
    return (inv?.gstin||'').toLowerCase().includes(q)||(inv?.invoiceNoRaw||'').toLowerCase().includes(q)||(inv?.tradeOrLegalName||'').toLowerCase().includes(q);
  });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const totalValue = records.reduce((s,r)=>s+(tabId==='booksOnly'?r.books:r.portal)?.invoiceValue||0, 0);
  const totalTax   = records.reduce((s,r)=>{const inv=tabId==='booksOnly'?r.books:r.portal;return s+(inv?.igst||0)+(inv?.cgst||0)+(inv?.sgst||0);}, 0);

  if (records.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400">
      <CheckCircle2 className="h-12 w-12 mb-3 text-slate-300"/>
      <p className="font-medium text-slate-500">No records in this category</p>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
        <span className="text-slate-500 whitespace-nowrap">Records: <strong className="text-slate-700 dark:text-slate-200">{records.length}</strong></span>
        <span className="text-slate-500 whitespace-nowrap">Total Value: <strong className="text-slate-700 dark:text-slate-200">₹{fmt(totalValue)}</strong></span>
        <span className="text-slate-500 whitespace-nowrap">Total Tax: <strong className="text-slate-700 dark:text-slate-200">₹{fmt(totalTax)}</strong></span>
        {tabId === 'matched' && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs whitespace-nowrap">
            <span className="w-3 h-3 rounded-sm bg-yellow-200 dark:bg-yellow-700 inline-block border border-yellow-400 flex-shrink-0"/>
            Yellow = prefix differs, values match
          </span>
        )}
        {tabId === 'matched' && records.some(r => r.normalizedMatch) && (
          <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-xs whitespace-nowrap">
            <span className="w-3 h-3 rounded-full bg-indigo-200 dark:bg-indigo-700 inline-block border border-indigo-400 flex-shrink-0"/>
            <strong>auto-matched ✓</strong> = portal &amp; books numbers differ in format (e.g. T1326 ↔ 1326)
          </span>
        )}
        {tabId === 'matched' && records.some(r => r.manualMatch) && (
          <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 text-xs whitespace-nowrap">
            <span className="w-3 h-3 rounded-full bg-indigo-200 dark:bg-indigo-700 inline-block border border-indigo-400 flex-shrink-0"/>
            <strong>✓ Manual</strong> = manually confirmed matched
          </span>
        )}
        {tabId === 'matched' && records.some(r => r.rcMismatch) && (
          <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400 text-xs whitespace-nowrap">
            <span className="w-3 h-3 rounded-full bg-violet-200 dark:bg-violet-700 inline-block border border-violet-400 flex-shrink-0"/>
            <strong>RCM</strong> = Reverse Charge flag differs (financially matched)
          </span>
        )}
      </div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search GSTIN, Invoice No, Party Name…" className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs min-w-[860px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap w-8">#</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">GSTIN</th>
              {tabId !== 'booksOnly' && <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Party Name</th>}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Invoice No</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Date</th>
              {tabId === 'mismatch' ? <>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Portal ₹</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Books ₹</th>
                <th className="px-3 py-2.5 text-right font-semibold text-amber-600 whitespace-nowrap">Diff ₹</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">P.Tax</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">B.Tax</th>
                <th className="px-3 py-2.5 text-right font-semibold text-amber-600 whitespace-nowrap">Tax Diff</th>
                <th className="px-3 py-2.5 text-left font-semibold text-amber-600 whitespace-nowrap">Fields</th>
              </> : <>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Value</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Taxable</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">IGST</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">CGST</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">SGST</th>
                {tabId === 'portalOnly' && <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap min-w-[64px]">ITC</th>}
              </>}
              {(tabId === 'mismatch' || tabId === 'portalOnly' || tabId === 'booksOnly') && (
                <th className="px-3 py-2.5 text-center font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Status</th>
              )}
              {onDelete && <th className="px-3 py-2.5 text-center font-semibold text-slate-400 whitespace-nowrap">Del</th>}
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => {
              const inv = tabId === 'booksOnly' ? r.books : r.portal;
              const n = (page-1)*PAGE_SIZE + idx + 1;
              const isPrefixRow = r.prefixMismatch === true;
              return (
                <tr key={r.key||idx} className={`border-b border-slate-100 dark:border-slate-700/50 ${isPrefixRow ? 'bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                  <td className="px-3 py-2 text-slate-400">{n}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{inv?.gstin}</td>
                  {tabId !== 'booksOnly' && <td className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[140px] truncate" title={inv?.tradeOrLegalName}>{inv?.tradeOrLegalName||'—'}</td>}
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                    {isPrefixRow ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-[10px] font-mono">{r.portal?.invoiceNoRaw}</span>
                        <span className="text-violet-600 dark:text-violet-400 text-[10px] font-mono">{r.books?.invoiceNoRaw}</span>
                        <span className="text-[9px] text-yellow-600 dark:text-yellow-400 font-semibold">prefix differs</span>
                      </span>
                    ) : r.normalizedMatch ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-blue-600 dark:text-blue-400 text-[10px] font-mono">{r.portal?.invoiceNoRaw}</span>
                        <span className="text-violet-600 dark:text-violet-400 text-[10px] font-mono">{r.books?.invoiceNoRaw}</span>
                        <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold">auto-matched ✓</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span>{inv?.invoiceNoRaw}</span>
                        {r.rcMismatch && (
                          <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800">RCM</span>
                        )}
                        {r.manualMatch && (
                          <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">✓ Manual</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{inv?.invoiceDate}</td>
                  {tabId === 'mismatch' ? <>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(r.portal.invoiceValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(r.books.invoiceValue)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.valueDiff>0?'text-blue-600':'text-rose-600'}`}>{r.valueDiff>0?'+':''}{fmt(r.valueDiff)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">₹{fmt(r.portal.igst+r.portal.cgst+r.portal.sgst)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">₹{fmt(r.books.igst+r.books.cgst+r.books.sgst)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${r.taxDiff>0?'text-blue-600':'text-rose-600'}`}>{r.taxDiff>0?'+':''}{fmt(r.taxDiff)}</td>
                    <td className="px-3 py-2">
                      {(r.mismatchFields||[]).map(f => (
                        <span key={f} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">{f}</span>
                      ))}
                      {r.rcMismatch && (
                        <span className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 whitespace-nowrap">RCM flag</span>
                      )}
                    </td>
                  </> : <>
                    <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(inv?.invoiceValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">₹{fmt(inv?.taxableValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.igst)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.cgst)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{fmt(inv?.sgst)}</td>
                    {tabId === 'portalOnly' && <td className="px-3 py-2 text-center min-w-[64px]">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${inv?.itcAvailability?.toLowerCase()==='yes'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{inv?.itcAvailability||'—'}</span>
                    </td>}
                  </>}
                  {/* Per-row Matching / Not Matching status toggle */}
                  {(tabId === 'mismatch' || tabId === 'portalOnly' || tabId === 'booksOnly') && (
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onMarkMatched ? (
                          <button
                            onClick={() => onMarkMatched(r)}
                            title="Mark as matched"
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800 transition-colors whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0"/> Match
                          </button>
                        ) : null}
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-500 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800 whitespace-nowrap">
                          <X className="h-2.5 w-2.5 flex-shrink-0"/> No
                        </span>
                      </div>
                    </td>
                  )}
                  {onDelete && (
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => onDelete(r)}
                        title="Remove this entry from reconciliation"
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-slate-500">Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Prev</button>
            <span className="py-1.5 text-slate-500">Page {page}/{totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   CHECK ONE TAB — Side-by-side prefix-mismatch invoice comparison
═══════════════════════════════════════════════════════════════════════════ */
const CheckOneTab = ({ records }) => {
  const [subTab, setSubTab]   = useState('matching');   // 'matching' | 'notMatching'
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const matching    = records.filter(r => r.allOtherMatch);
  const notMatching = records.filter(r => !r.allOtherMatch);
  const list        = subTab === 'matching' ? matching : notMatching;

  const filtered = list.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.portal?.gstin||'').toLowerCase().includes(q) ||
      (r.portal?.invoiceNoRaw||'').toLowerCase().includes(q) ||
      (r.books?.invoiceNoRaw||'').toLowerCase().includes(q) ||
      (r.portal?.tradeOrLegalName||'').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const COLS = ['GSTIN','Party Name','Portal Invoice No','Books Invoice No','Date','Invoice Value','Taxable','IGST','CGST','SGST','Place','Status'];

  const fieldRow = (label, pVal, bVal, match) => (
    <div key={label} className={`flex items-center gap-2 py-1 px-2 rounded text-xs ${match ? '' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
      <span className="w-28 text-slate-500 shrink-0 font-medium">{label}</span>
      <span className="flex-1 font-mono text-blue-700 dark:text-blue-300 truncate">{pVal ?? '—'}</span>
      <span className={`w-4 text-center ${match ? 'text-emerald-500' : 'text-rose-500'}`}>{match ? '✓' : '✗'}</span>
      <span className="flex-1 font-mono text-violet-700 dark:text-violet-300 truncate text-right">{bVal ?? '—'}</span>
    </div>
  );

  if (records.length === 0) return (
    <div className="flex flex-col items-center py-16 text-slate-400">
      <CheckCircle2 className="h-12 w-12 mb-3 text-slate-300"/>
      <p className="font-medium text-slate-500">No prefix-only mismatches found</p>
      <p className="text-xs mt-1">All invoices either matched exactly or have differing values.</p>
    </div>
  );

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"/>Portal Invoice No</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-500 inline-block"/>Books Invoice No</span>
        <span className="text-slate-400 ml-auto">Total prefix-mismatches: <strong className="text-slate-700 dark:text-slate-200">{records.length}</strong></span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl mb-4 w-fit">
        {[
          { id:'matching',    label:`Matching (${matching.length})`,    color:'text-emerald-600' },
          { id:'notMatching', label:`Not Matching (${notMatching.length})`, color:'text-rose-600' },
        ].map(st => (
          <button key={st.id} onClick={()=>{setSubTab(st.id);setPage(1);}}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${subTab===st.id ? 'bg-white dark:bg-slate-800 shadow-sm '+st.color : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {st.label}
          </button>
        ))}
      </div>

      {/* Info banner */}
      {subTab === 'matching' && matching.length > 0 && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0"/>
          <span>These invoices have <strong>only a prefix difference</strong> in invoice number — all financial values, date, GSTIN, and place of supply match. They are counted as <strong>Matched</strong> and highlighted yellow there.</span>
        </div>
      )}
      {subTab === 'notMatching' && notMatching.length > 0 && (
        <div className="flex items-start gap-2 p-3 mb-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0"/>
          <span>These invoices have a prefix difference AND value/date mismatches. The portal record stays in <strong>Portal Only</strong> and the books record stays in <strong>Books Only</strong>.</span>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          placeholder="Search GSTIN, Invoice No, Party Name…"
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"/>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">GSTIN</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Party Name</th>
              <th className="px-3 py-2.5 text-left font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">Portal Invoice No</th>
              <th className="px-3 py-2.5 text-left font-semibold text-violet-600 dark:text-violet-400 whitespace-nowrap">Books Invoice No</th>
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Date</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Invoice Value</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Taxable</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">IGST</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">CGST</th>
              <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">SGST</th>
              <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={12} className="py-12 text-center text-slate-400 text-sm">No records found</td></tr>
            )}
            {paged.map((r, idx) => {
              const p = r.portal, b = r.books;
              const n = (page-1)*PAGE_SIZE + idx + 1;
              const valMatch  = Math.abs((p?.invoiceValue||0) - (b?.invoiceValue||0)) <= TOLERANCE;
              const taxMatch  = Math.abs(((p?.igst||0)+(p?.cgst||0)+(p?.sgst||0)) - ((b?.igst||0)+(b?.cgst||0)+(b?.sgst||0))) <= TOLERANCE;
              const dateMatch = !p?.invoiceDate || !b?.invoiceDate || p.invoiceDate === b.invoiceDate;
              const rowBg     = r.allOtherMatch
                ? 'bg-emerald-50/60 dark:bg-emerald-900/10'
                : 'bg-rose-50/60 dark:bg-rose-900/10';
              return (
                <tr key={r.key||idx} className={`border-b border-slate-100 dark:border-slate-700/50 ${rowBg}`}>
                  <td className="px-3 py-2 text-slate-400">{n}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{p?.gstin}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[120px] truncate" title={p?.tradeOrLegalName}>{p?.tradeOrLegalName||'—'}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-blue-600 dark:text-blue-400">{p?.invoiceNoRaw}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-violet-600 dark:text-violet-400">{b?.invoiceNoRaw}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${dateMatch ? 'text-slate-500' : 'text-rose-600 font-semibold'}`}>
                    {dateMatch ? p?.invoiceDate : <><span className="block text-blue-600">{p?.invoiceDate}</span><span className="block text-violet-600">{b?.invoiceDate}</span></>}
                  </td>
                  <td className={`px-3 py-2 text-right ${valMatch ? 'text-slate-700 dark:text-slate-200' : 'text-rose-600 font-semibold'}`}>
                    {valMatch ? `₹${fmt(p?.invoiceValue)}` : <><span className="block text-blue-600">₹{fmt(p?.invoiceValue)}</span><span className="block text-violet-600">₹{fmt(b?.invoiceValue)}</span></>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">₹{fmt(p?.taxableValue)}</td>
                  <td className={`px-3 py-2 text-right ${Math.abs((p?.igst||0)-(b?.igst||0))<=TOLERANCE?'text-slate-500':'text-rose-600 font-semibold'}`}>{fmt(p?.igst)}</td>
                  <td className={`px-3 py-2 text-right ${Math.abs((p?.cgst||0)-(b?.cgst||0))<=TOLERANCE?'text-slate-500':'text-rose-600 font-semibold'}`}>{fmt(p?.cgst)}</td>
                  <td className={`px-3 py-2 text-right ${Math.abs((p?.sgst||0)-(b?.sgst||0))<=TOLERANCE?'text-slate-500':'text-rose-600 font-semibold'}`}>{fmt(p?.sgst)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.allOtherMatch
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3"/>Matched</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"><AlertTriangle className="h-3 w-3"/>Mismatch</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-slate-500">Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
          <div className="flex gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Prev</button>
            <span className="py-1.5 text-slate-500">Page {page}/{totalPages}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL SEARCH TAB  — search across ALL categories simultaneously
═══════════════════════════════════════════════════════════════════════════ */

// Category metadata used in the search tab
const CAT_META = {
  matched:    { label: 'Matched',         short: 'Matched',     bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  mismatch:   { label: 'Amount Mismatch', short: 'Mismatch',    bg: 'bg-amber-100 dark:bg-amber-900/40',    text: 'text-amber-700 dark:text-amber-300',    dot: 'bg-amber-500'   },
  portalOnly: { label: 'In Portal Only',  short: 'Portal Only', bg: 'bg-blue-100 dark:bg-blue-900/40',      text: 'text-blue-700 dark:text-blue-300',      dot: 'bg-blue-500'    },
  booksOnly:  { label: 'In Books Only',   short: 'Books Only',  bg: 'bg-rose-100 dark:bg-rose-900/40',      text: 'text-rose-700 dark:text-rose-300',      dot: 'bg-rose-500'    },
};

const SORT_COLS = [
  { id: 'invoiceNo',    label: 'Invoice No'    },
  { id: 'invoiceDate',  label: 'Date'          },
  { id: 'invoiceValue', label: 'Invoice Value' },
  { id: 'totalTax',     label: 'Total Tax'     },
  { id: 'gstin',        label: 'GSTIN'         },
  { id: 'partyName',    label: 'Party Name'    },
];

function highlight(text, query) {
  if (!query || !text) return text || '—';
  const str = String(text);
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return str;
  return (
    <>
      {str.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 rounded px-0.5 not-italic">
        {str.slice(idx, idx + query.length)}
      </mark>
      {str.slice(idx + query.length)}
    </>
  );
}

const GlobalSearchTab = ({ results }) => {
  const [query,       setQuery]       = useState('');
  const [catFilter,   setCatFilter]   = useState(['matched','mismatch','portalOnly','booksOnly']);
  const [minVal,      setMinVal]      = useState('');
  const [maxVal,      setMaxVal]      = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [sortCol,     setSortCol]     = useState('invoiceValue');
  const [sortDir,     setSortDir]     = useState('desc');
  const [page,        setPage]        = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef(null);

  // Focus search on mount
  React.useEffect(() => { searchRef.current?.focus(); }, []);

  // Flatten all records into a unified list
  const allRecords = React.useMemo(() => {
    const flat = [];
    const push = (arr, catId, invFn, extra = {}) =>
      arr.forEach(r => {
        const inv = invFn(r);
        flat.push({
          catId,
          gstin:        inv.gstin        || '',
          partyName:    inv.tradeOrLegalName || '',
          invoiceNo:    inv.invoiceNo    || '',
          invoiceNoRaw: inv.invoiceNoRaw || '',
          invoiceDate:  inv.invoiceDate  || '',
          invoiceValue: inv.invoiceValue || 0,
          taxableValue: inv.taxableValue || 0,
          igst:         inv.igst         || 0,
          cgst:         inv.cgst         || 0,
          sgst:         inv.sgst         || 0,
          cess:         inv.cess         || 0,
          totalTax:    (inv.igst||0) + (inv.cgst||0) + (inv.sgst||0),
          placeOfSupply: inv.placeOfSupply || '',
          itcAvailability: inv.itcAvailability || '',
          ...extra,
          _raw: r,
        });
      });

    push(results.matched,    'matched',    r => r.portal);
    push(results.mismatch,   'mismatch',   r => r.portal, { valueDiff: null, taxDiff: null,
      _valueDiff: r => r.valueDiff, _taxDiff: r => r.taxDiff });
    push(results.portalOnly, 'portalOnly', r => r.portal);
    push(results.booksOnly,  'booksOnly',  r => r.books);

    // Re-attach mismatch diffs
    flat.forEach(item => {
      if (item.catId === 'mismatch') {
        item.valueDiff = item._raw.valueDiff;
        item.taxDiff   = item._raw.taxDiff;
      }
    });

    return flat;
  }, [results]);

  // Filter
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const minV = minVal !== '' ? parseFloat(minVal) : null;
    const maxV = maxVal !== '' ? parseFloat(maxVal) : null;

    return allRecords.filter(r => {
      if (!catFilter.includes(r.catId)) return false;

      if (q) {
        const hit =
          r.gstin.toLowerCase().includes(q) ||
          r.partyName.toLowerCase().includes(q) ||
          r.invoiceNoRaw.toLowerCase().includes(q) ||
          r.invoiceDate.toLowerCase().includes(q) ||
          r.placeOfSupply.toLowerCase().includes(q) ||
          CAT_META[r.catId].label.toLowerCase().includes(q);
        if (!hit) return false;
      }

      if (minV !== null && r.invoiceValue < minV) return false;
      if (maxV !== null && r.invoiceValue > maxV) return false;

      // Date filter — simple string prefix match (works for DD/MM/YYYY and YYYY-MM-DD)
      if (dateFrom && r.invoiceDate && r.invoiceDate < dateFrom.split('-').reverse().join('/')) return false;
      if (dateTo   && r.invoiceDate && r.invoiceDate > dateTo.split('-').reverse().join('/'))   return false;

      return true;
    });
  }, [allRecords, query, catFilter, minVal, maxVal, dateFrom, dateTo]);

  // Sort
  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleCat = id => {
    setCatFilter(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(c => c !== id) : prev) : [...prev, id]
    );
    setPage(1);
  };

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ col }) => (
    sortCol === col
      ? <ArrowUpDown className={`h-3 w-3 ml-1 inline ${sortDir === 'asc' ? 'rotate-0' : 'rotate-180'} transition-transform`}/>
      : <ChevronsUpDown className="h-3 w-3 ml-1 inline opacity-30"/>
  );

  const totalValue = filtered.reduce((s, r) => s + r.invoiceValue, 0);
  const totalTax   = filtered.reduce((s, r) => s + r.totalTax, 0);

  const catCounts = React.useMemo(() => {
    const c = { matched: 0, mismatch: 0, portalOnly: 0, booksOnly: 0 };
    filtered.forEach(r => { c[r.catId] = (c[r.catId] || 0) + 1; });
    return c;
  }, [filtered]);

  return (
    <div>
      {/* ── Big Search Bar ── */}
      <div className="relative mb-4">
        <ScanSearch className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-purple-400"/>
        <input
          ref={searchRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          placeholder="Search by GSTIN, Invoice No, Party Name, Place of Supply or Category…"
          className="w-full pl-12 pr-12 py-3.5 text-sm rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm"
        />
        {query && (
          <button onClick={() => { setQuery(''); setPage(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="h-4 w-4 text-slate-400"/>
          </button>
        )}
      </div>

      {/* ── Category Filter Chips ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1"><Tag className="h-3 w-3"/>Category:</span>
        {Object.entries(CAT_META).map(([id, meta]) => (
          <button
            key={id}
            onClick={() => toggleCat(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              catFilter.includes(id)
                ? `${meta.bg} ${meta.text} border-transparent shadow-sm`
                : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 opacity-60'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${catFilter.includes(id) ? meta.dot : 'bg-slate-300'}`}/>
            {meta.short}
            <span className="ml-0.5 opacity-70">({catCounts[id] || 0})</span>
          </button>
        ))}

        <button
          onClick={() => setShowFilters(v => !v)}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            showFilters || minVal || maxVal || dateFrom || dateTo
              ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
              : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
          }`}
        >
          <Filter className="h-3 w-3"/>
          Advanced Filters
          {(minVal || maxVal || dateFrom || dateTo) && (
            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-purple-500"/>
          )}
        </button>
      </div>

      {/* ── Advanced Filters Panel ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 mb-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
              <div>
                <label className="block text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Min Invoice Value (₹)</label>
                <input
                  type="number" value={minVal} onChange={e => { setMinVal(e.target.value); setPage(1); }}
                  placeholder="e.g. 1000"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Max Invoice Value (₹)</label>
                <input
                  type="number" value={maxVal} onChange={e => { setMaxVal(e.target.value); setPage(1); }}
                  placeholder="e.g. 100000"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Invoice Date From</label>
                <input
                  type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Invoice Date To</label>
                <input
                  type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="col-span-2 md:col-span-4 flex items-center gap-2">
                <label className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">Sort by:</label>
                <div className="flex flex-wrap gap-1.5">
                  {SORT_COLS.map(sc => (
                    <button
                      key={sc.id}
                      onClick={() => handleSort(sc.id)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                        sortCol === sc.id
                          ? 'bg-purple-600 text-white border-transparent'
                          : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      {sc.label} {sortCol === sc.id ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  ))}
                </div>
                {(minVal || maxVal || dateFrom || dateTo) && (
                  <button
                    onClick={() => { setMinVal(''); setMaxVal(''); setDateFrom(''); setDateTo(''); setPage(1); }}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-200 dark:border-rose-800 transition-colors"
                  >
                    <X className="h-3 w-3"/> Clear Filters
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results Summary Bar ── */}
      <div className="flex flex-wrap gap-4 mb-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
        <span className="text-slate-500">Results: <strong className="text-slate-700 dark:text-slate-200">{filtered.length}</strong></span>
        <span className="text-slate-500">Total Value: <strong className="text-slate-700 dark:text-slate-200">₹{fmt(totalValue)}</strong></span>
        <span className="text-slate-500">Total Tax: <strong className="text-slate-700 dark:text-slate-200">₹{fmt(totalTax)}</strong></span>
        {query && <span className="text-purple-600 dark:text-purple-400 font-medium">Showing results for: "<em>{query}</em>"</span>}
      </div>

      {/* ── No Results ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <ScanSearch className="h-14 w-14 mb-3 text-slate-300"/>
          <p className="font-medium text-slate-500 text-base">No invoices found</p>
          <p className="text-sm mt-1 text-slate-400">
            {query ? `No match for "${query}"` : 'Try adjusting your filters'}
          </p>
          {(query || minVal || maxVal) && (
            <button onClick={() => { setQuery(''); setMinVal(''); setMaxVal(''); setDateFrom(''); setDateTo(''); }}
              className="mt-4 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 transition-colors">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Results Table ── */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 w-8">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('gstin')}>
                  GSTIN <SortIcon col="gstin"/>
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('partyName')}>
                  Party Name <SortIcon col="partyName"/>
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('invoiceNo')}>
                  Invoice No <SortIcon col="invoiceNo"/>
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('invoiceDate')}>
                  Date <SortIcon col="invoiceDate"/>
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('invoiceValue')}>
                  Invoice Value <SortIcon col="invoiceValue"/>
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Taxable</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 cursor-pointer hover:text-purple-600" onClick={() => handleSort('totalTax')}>
                  Total Tax <SortIcon col="totalTax"/>
                </th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">IGST</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">CGST</th>
                <th className="px-3 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">SGST</th>
                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Place</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r, idx) => {
                const meta = CAT_META[r.catId];
                const n    = (page - 1) * PAGE_SIZE + idx + 1;
                const isMismatch = r.catId === 'mismatch';
                return (
                  <tr
                    key={`${r.catId}-${r.invoiceNo}-${idx}`}
                    className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-slate-400">{n}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.bg} ${meta.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}/>
                        {meta.short}
                      </span>
                      {isMismatch && r.valueDiff !== undefined && (
                        <span className={`ml-1 text-[9px] font-bold ${r.valueDiff > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                          {r.valueDiff > 0 ? '▲' : '▼'}₹{Math.abs(r.valueDiff).toFixed(0)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {highlight(r.gstin, query)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-[130px] truncate" title={r.partyName}>
                      {highlight(r.partyName || '—', query)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {highlight(r.invoiceNoRaw, query)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.invoiceDate}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-700 dark:text-slate-200">₹{fmt(r.invoiceValue)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">₹{fmt(r.taxableValue)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">₹{fmt(r.totalTax)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{fmt(r.igst)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{fmt(r.cgst)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">{fmt(r.sgst)}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap max-w-[80px] truncate" title={r.placeOfSupply}>
                      {highlight(r.placeOfSupply || '—', query)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-slate-500">
            Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">«</button>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Prev</button>
            <span className="px-2 py-1.5 text-slate-500">Page {page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">Next</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1.5 rounded-lg border text-xs disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">»</button>
          </div>
        </div>
      )}
    </div>
  );
};



/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT SELECTOR — searchable dropdown linked to the clients DB
═══════════════════════════════════════════════════════════════════════════ */
const ClientSelector = ({ clients, selectedId, onSelect }) => {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = clients.find(c => c.id === selectedId);
  const filtered = clients.filter(c =>
    !search.trim() ||
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.gstin || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 pl-3 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
      >
        <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 truncate ${selected ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
          {selected ? `${selected.company_name}${selected.gstin ? ` — ${selected.gstin}` : ''}` : 'Select a client (optional)'}
        </span>
        {selected && (
          <span onClick={e => { e.stopPropagation(); onSelect(null); setSearch(''); }}
            className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-3.5 w-3.5 text-slate-400" />
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or GSTIN…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No clients found</p>
              ) : filtered.map(c => (
                <button
                  key={c.id} type="button"
                  onClick={() => { onSelect(c); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-2 ${c.id === selectedId ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                >
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{c.company_name[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{c.company_name}</p>
                    {c.gstin && <p className="text-[10px] font-mono text-slate-400">{c.gstin}</p>}
                  </div>
                  {c.id === selectedId && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY VIEW — past reconciliation sessions
═══════════════════════════════════════════════════════════════════════════ */
const HistoryView = ({ onOpenSession }) => {
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [deleting,  setDeleting]  = useState(null);
  const [opening,   setOpening]   = useState(null);
  const [expanded,  setExpanded]  = useState(null);

  const handleOpen = async (id) => {
    setOpening(id);
    try {
      const r = await api.get(`/gst-reconciliation/history/${id}`);
      const sess = r.data || {};
      const full = sess.full_result || sess.fullResult;
      if (!full || (!full.matched && !full.mismatch && !full.portalOnly && !full.booksOnly)) {
        toast.error('This older session was saved without full data — re-run the reconciliation to view & edit.');
        setOpening(null);
        return;
      }
      onOpenSession?.({
        result: full,
        company: sess.company || {},
        period: sess.period || '',
        portalFilename: sess.portal_filename || '',
        booksFilename: sess.books_filename || '',
        sessionId: sess.id,
        clientName: sess.client_name || '',
        clientGstin: sess.client_gstin || '',
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to open session');
    } finally {
      setOpening(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/gst-reconciliation/history?limit=100');
      setSessions(r.data.sessions || []);
    } catch { toast.error('Failed to load history'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this reconciliation history entry?')) return;
    setDeleting(id);
    try {
      await api.delete(`/gst-reconciliation/history/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success('Deleted');
    } catch { toast.error('Could not delete session'); }
    finally { setDeleting(null); }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  const StatPill = ({ label, val, bg, text }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${bg} ${text}`}>
      {label}: {val}
    </span>
  );

  if (loading) return (
    <div className="flex flex-col items-center py-20 text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin mb-3 text-indigo-400" />
      <p className="text-sm">Loading history…</p>
    </div>
  );

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center py-20 text-slate-400">
      <History className="h-14 w-14 mb-3 text-slate-200 dark:text-slate-700" />
      <p className="font-medium text-slate-500 text-base">No reconciliation history yet</p>
      <p className="text-sm mt-1 text-slate-400">Run a reconciliation and it will appear here.</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{sessions.length} reconciliation{sessions.length !== 1 ? 's' : ''} saved</p>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      <div className="space-y-3">
        {sessions.map(s => {
          const sm = s.summary || {};
          const isExp = expanded === s.id;
          return (
            <motion.div key={s.id} layout className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Header row */}
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(isExp ? null : s.id)}>
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex-shrink-0">
                  <ArrowLeftRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                      {s.client_name || 'Unknown Client'}
                    </p>
                    {s.client_gstin && (
                      <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">
                        {s.client_gstin}
                      </span>
                    )}
                    {s.period && (
                      <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                        {s.period}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <StatPill label="✓" val={sm.matched_count ?? 0}     bg="bg-emerald-100 dark:bg-emerald-900/30" text="text-emerald-700 dark:text-emerald-300" />
                    <StatPill label="⚠" val={sm.mismatch_count ?? 0}    bg="bg-amber-100 dark:bg-amber-900/30"    text="text-amber-700 dark:text-amber-300" />
                    <StatPill label="🌐" val={sm.portal_only_count ?? 0} bg="bg-blue-100 dark:bg-blue-900/30"      text="text-blue-700 dark:text-blue-300" />
                    <StatPill label="📒" val={sm.books_only_count ?? 0}  bg="bg-rose-100 dark:bg-rose-900/30"      text="text-rose-700 dark:text-rose-300" />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" /> {fmtDate(s.created_at)}
                    </p>
                    {s.created_by_name && (
                      <p className="text-[10px] text-slate-400 mt-0.5">by {s.created_by_name}</p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleOpen(s.id); }}
                    disabled={opening === s.id}
                    title="Open full reconciliation — view, edit & generate reports"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition-colors"
                  >
                    {opening === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                    Open
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                    disabled={deleting === s.id}
                    className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    {deleting === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded details */}
              <AnimatePresence>
                {isExp && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }} 
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-100 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        {[
                          { label: 'Portal Invoices',  val: sm.total_portal ?? '—',          color: 'text-slate-700 dark:text-slate-200' },
                          { label: 'Books Invoices',   val: sm.total_books  ?? '—',           color: 'text-slate-700 dark:text-slate-200' },
                          { label: 'Matched Value',    val: sm.matched_value != null ? `₹${fmt(sm.matched_value)}` : '—',     color: 'text-emerald-700 dark:text-emerald-300' },
                          { label: 'Books Only Value', val: sm.books_only_value != null ? `₹${fmt(sm.books_only_value)}` : '—', color: 'text-rose-700 dark:text-rose-300' },
                        ].map(item => (
                          <div key={item.label} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">{item.label}</p>
                            <p className={`text-sm font-bold ${item.color}`}>{item.val}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        {s.portal_filename && <span>🌐 Portal file: <strong>{s.portal_filename}</strong></span>}
                        {s.books_filename  && <span>📒 Books file: <strong>{s.books_filename}</strong></span>}
                        <span className="sm:hidden flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDate(s.created_at)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
};
/* ═══════════════════════════════════════════════════════════════════════════
   ITC DETAIL MODAL — full invoice list for ITC Claimable / ITC to Book / ITC at Risk
═══════════════════════════════════════════════════════════════════════════ */
const ITC_MODAL_META = {
  claimable: {
    title: 'ITC Claimable',
    desc: 'Tax from invoices present in both portal and books (matched). These can be claimed in GSTR-3B.',
    color: 'emerald',
    headerBg: 'bg-emerald-600',
  },
  toBook: {
    title: 'ITC to Book',
    desc: 'Tax from portal-only invoices not yet entered in books. Book these entries to avail ITC.',
    color: 'blue',
    headerBg: 'bg-blue-600',
  },
  atRisk: {
    title: 'ITC at Risk',
    desc: 'Tax from books-only invoices where vendor has NOT filed on portal. Follow up with vendor or reverse ITC.',
    color: 'rose',
    headerBg: 'bg-rose-600',
  },
};

const ITCDetailModal = ({ type, results, onClose }) => {
  const [search, setSearch] = useState('');
  const meta = ITC_MODAL_META[type];
  if (!meta) return null;

  let invoices = [];
  if (type === 'claimable') {
    invoices = (results.matched || []).map(r => ({
      gstin: r.portal?.gstin,
      partyName: r.portal?.tradeOrLegalName || '—',
      invoiceNo: r.portal?.invoiceNoRaw,
      date: r.portal?.invoiceDate,
      value: r.portal?.invoiceValue,
      igst: r.portal?.igst, cgst: r.portal?.cgst, sgst: r.portal?.sgst,
      tax: (r.portal?.igst||0)+(r.portal?.cgst||0)+(r.portal?.sgst||0),
      rcm: r.rcMismatch,
    }));
  } else if (type === 'toBook') {
    invoices = (results.portalOnly || []).map(r => ({
      gstin: r.portal?.gstin,
      partyName: r.portal?.tradeOrLegalName || '—',
      invoiceNo: r.portal?.invoiceNoRaw,
      date: r.portal?.invoiceDate,
      value: r.portal?.invoiceValue,
      igst: r.portal?.igst, cgst: r.portal?.cgst, sgst: r.portal?.sgst,
      tax: (r.portal?.igst||0)+(r.portal?.cgst||0)+(r.portal?.sgst||0),
      itc: r.portal?.itcAvailability,
    }));
  } else {
    invoices = (results.booksOnly || []).map(r => ({
      gstin: r.books?.gstin,
      partyName: '—',
      invoiceNo: r.books?.invoiceNoRaw,
      date: r.books?.invoiceDate,
      value: r.books?.invoiceValue,
      igst: r.books?.igst, cgst: r.books?.cgst, sgst: r.books?.sgst,
      tax: (r.books?.igst||0)+(r.books?.cgst||0)+(r.books?.sgst||0),
    }));
  }

  const filtered = search.trim()
    ? invoices.filter(inv => {
        const q = search.toLowerCase();
        return (inv.gstin||'').toLowerCase().includes(q) ||
               (inv.invoiceNo||'').toLowerCase().includes(q) ||
               (inv.partyName||'').toLowerCase().includes(q);
      })
    : invoices;

  const totalTaxAmt = filtered.reduce((s, inv) => s + (inv.tax || 0), 0);
  const totalVal = filtered.reduce((s, inv) => s + (inv.value || 0), 0);

  const colorMap = {
    emerald: { badge:'bg-emerald-100 text-emerald-700', row:'hover:bg-emerald-50 dark:hover:bg-emerald-900/10', ring:'focus:ring-emerald-400 border-emerald-200' },
    blue:    { badge:'bg-blue-100 text-blue-700',       row:'hover:bg-blue-50 dark:hover:bg-blue-900/10',       ring:'focus:ring-blue-400 border-blue-200' },
    rose:    { badge:'bg-rose-100 text-rose-700',       row:'hover:bg-rose-50 dark:hover:bg-rose-900/10',       ring:'focus:ring-rose-400 border-rose-200' },
  };
  const c = colorMap[meta.color];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className={`${meta.headerBg} px-6 py-4 flex items-center justify-between flex-shrink-0`}>
          <div>
            <h2 className="text-lg font-bold text-white">{meta.title}</h2>
            <p className="text-xs text-white/80 mt-0.5">{meta.desc}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors">
            <X className="h-5 w-5"/>
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-4 px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 text-sm">
          <span className="text-slate-500">Invoices: <strong className="text-slate-800 dark:text-slate-100">{filtered.length}</strong></span>
          <span className="text-slate-500">Total Value: <strong className="text-slate-800 dark:text-slate-100">₹{fmt(totalVal)}</strong></span>
          <span className="text-slate-500">Total Tax: <strong className="text-slate-800 dark:text-slate-100">₹{fmt(totalTaxAmt)}</strong></span>
        </div>

        {/* Search */}
        <div className="px-6 py-3 flex-shrink-0 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search GSTIN, Invoice No, Party Name…"
              className={`w-full pl-9 pr-4 py-2 text-sm rounded-xl border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 ${c.ring} dark:border-slate-700`}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">GSTIN</th>
                {type !== 'atRisk' && <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Party Name</th>}
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Invoice No</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Date</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Invoice Value</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">IGST</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">CGST</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">SGST</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Total Tax</th>
                {type === 'claimable' && <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Flag</th>}
                {type === 'toBook'    && <th className="px-4 py-2.5 text-center font-semibold text-slate-500">ITC Avail</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-slate-400">No invoices found</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={i} className={`border-b border-slate-100 dark:border-slate-700/50 ${c.row} transition-colors`}>
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">{inv.gstin}</td>
                  {type !== 'atRisk' && <td className="px-4 py-2 text-slate-700 dark:text-slate-200 max-w-[140px] truncate" title={inv.partyName}>{inv.partyName}</td>}
                  <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200">{inv.invoiceNo}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{inv.date}</td>
                  <td className="px-4 py-2 text-right text-slate-700 dark:text-slate-200">₹{fmt(inv.value)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmt(inv.igst)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmt(inv.cgst)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{fmt(inv.sgst)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${c.badge.split(' ')[1]}`}>₹{fmt(inv.tax)}</td>
                  {type === 'claimable' && (
                    <td className="px-4 py-2 text-center">
                      {inv.rcm && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">RCM</span>}
                    </td>
                  )}
                  {type === 'toBook' && (
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${inv.itc?.toLowerCase()==='yes'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{inv.itc||'—'}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 sticky bottom-0">
                <tr>
                  <td colSpan={type === 'atRisk' ? 5 : 6} className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-200 text-xs">TOTAL ({filtered.length} invoices)</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">₹{fmt(totalVal)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-500">{fmt(filtered.reduce((s,r)=>s+(r.igst||0),0))}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-500">{fmt(filtered.reduce((s,r)=>s+(r.cgst||0),0))}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-500">{fmt(filtered.reduce((s,r)=>s+(r.sgst||0),0))}</td>
                  <td className={`px-4 py-2.5 text-right font-bold text-lg ${meta.color==='emerald'?'text-emerald-700 dark:text-emerald-300':meta.color==='blue'?'text-blue-700 dark:text-blue-300':'text-rose-700 dark:text-rose-300'}`}>₹{fmt(totalTaxAmt)}</td>
                  {(type === 'claimable' || type === 'toBook') && <td/>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   SIDE-BY-SIDE COMPARE — Portal Only vs Books Only with smart pairing
═══════════════════════════════════════════════════════════════════════════ */
const CONF_COLOR = { high:'bg-emerald-100 text-emerald-700 border-emerald-200', medium:'bg-amber-100 text-amber-700 border-amber-200', low:'bg-orange-100 text-orange-700 border-orange-200', none:'bg-slate-100 text-slate-400 border-slate-200' };
const CONF_LABEL = { high:'✓ Match', medium:'≈ Near', low:'~ Possible', none:'—' };

const SideBySideCompare = ({ portalOnly, booksOnly, onConfirmMatch, onClose }) => {
  const [search, setSearch]             = useState('');
  const [gstinFilter, setGstinFilter]   = useState('');
  const [gstinNames, setGstinNames]     = useState({});
  const [lookingUp, setLookingUp]       = useState({});
  const [confirmed, setConfirmed]       = useState(new Set());

  /* Portal name map — free lookup from already-loaded data */
  const portalNameMap = React.useMemo(() => {
    const m = {};
    portalOnly.forEach(r => { if (r.portal?.gstin && r.portal?.tradeOrLegalName) m[r.portal.gstin] = r.portal.tradeOrLegalName; });
    return m;
  }, [portalOnly]);

  /* Smart pairing */
  const pairs = React.useMemo(() => {
    const portalUsed = new Set(), booksUsed = new Set(), result = [];

    // Pass 1: exact normalised invoice + same GSTIN
    booksOnly.forEach(bo => {
      const bNum = normaliseInvoice(bo.books?.invoiceNoRaw || '');
      booksOnly; // lint
      for (const po of portalOnly) {
        if (portalUsed.has(po.key)) continue;
        const pNum = normaliseInvoice(po.portal?.invoiceNoRaw || '');
        if (pNum === bNum && bNum && po.portal?.gstin === bo.books?.gstin) {
          const vd = Math.abs((po.portal?.invoiceValue||0) - (bo.books?.invoiceValue||0));
          const td = Math.abs(((po.portal?.igst||0)+(po.portal?.cgst||0)+(po.portal?.sgst||0)) - ((bo.books?.igst||0)+(bo.books?.cgst||0)+(bo.books?.sgst||0)));
          result.push({ portal:po, books:bo, confidence: vd<=1.01&&td<=1.01?'high':'medium', valueDiff:vd, taxDiff:td });
          portalUsed.add(po.key); booksUsed.add(bo.key); break;
        }
      }
    });
    // Pass 2: same GSTIN, value within 2%
    booksOnly.forEach(bo => {
      if (booksUsed.has(bo.key)) return;
      const bVal = bo.books?.invoiceValue||0;
      let best=null, bestDiff=Infinity;
      for (const po of portalOnly) {
        if (portalUsed.has(po.key) || po.portal?.gstin !== bo.books?.gstin) continue;
        const d = Math.abs((po.portal?.invoiceValue||0)-bVal);
        if (d<bestDiff && d/(bVal||1)<0.02) { best=po; bestDiff=d; }
      }
      if (best) { result.push({ portal:best, books:bo, confidence:'low', valueDiff:bestDiff, taxDiff:0 }); portalUsed.add(best.key); booksUsed.add(bo.key); }
    });
    // Unpaired
    portalOnly.forEach(po => { if (!portalUsed.has(po.key)) result.push({ portal:po, books:null, confidence:'none' }); });
    booksOnly.forEach(bo  => { if (!booksUsed.has(bo.key))  result.push({ portal:null, books:bo,  confidence:'none' }); });
    return result;
  }, [portalOnly, booksOnly]);

  const allGstins = React.useMemo(() => {
    const s=new Set();
    pairs.forEach(p=>{ if(p.portal?.portal?.gstin) s.add(p.portal.portal.gstin); if(p.books?.books?.gstin) s.add(p.books.books.gstin); });
    return [...s].sort();
  }, [pairs]);

  const lookupName = async (gstin) => {
    if (!gstin || lookingUp[gstin]) return;
    // Skip if we already have a name from portal data or a previous lookup
    if (gstinNames[gstin] || portalNameMap[gstin]) return;
    setLookingUp(p => ({ ...p, [gstin]: true }));
    try {
      const result = await clientGstinLookup(gstin);
      const name = result.tradeName || result.legalName || '';
      // Even if no name found, cache static state info so we show state tooltip
      setGstinNames(p => ({
        ...p,
        [gstin]: name || (result.state ? `[${result.state}]` : ''),
      }));
    } catch (_) { /* clientGstinLookup never rejects, but guard anyway */ }
    setLookingUp(p => ({ ...p, [gstin]: false }));
  };

  // Auto-fetch names for all unique GSTINs without a name (batched)
  React.useEffect(() => {
    const need = new Set();
    pairs.forEach(p => {
      const pg = p.portal?.portal?.gstin;
      const bg = p.books?.books?.gstin;
      if (pg && !p.portal?.portal?.tradeOrLegalName && !portalNameMap[pg]) need.add(pg);
      if (bg && !portalNameMap[bg]) need.add(bg);
    });
    const todo = [...need].filter(g => !gstinNames[g] && !lookingUp[g]).slice(0, 8);
    todo.forEach(g => lookupName(g));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

  const filtered = pairs.filter(p => {
    const g = p.portal?.portal?.gstin || p.books?.books?.gstin || '';
    if (gstinFilter && g !== gstinFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const pInv=(p.portal?.portal?.invoiceNoRaw||'').toLowerCase();
    const bInv=(p.books?.books?.invoiceNoRaw||'').toLowerCase();
    const name=(p.portal?.portal?.tradeOrLegalName||portalNameMap[g]||gstinNames[g]||'').toLowerCase();
    return g.toLowerCase().includes(q)||pInv.includes(q)||bInv.includes(q)||name.includes(q);
  });

  const stats = { high:0, medium:0, low:0, confirmed:confirmed.size };
  filtered.forEach(p => { if(p.portal&&p.books) stats[p.confidence]=(stats[p.confidence]||0)+1; });

  const handleConfirm = (pair, idx) => {
    onConfirmMatch(pair);
    setConfirmed(s => new Set([...s, `${pair.portal?.key}__${pair.books?.key}`]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <motion.div
        initial={{opacity:0,scale:0.96,y:12}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.96,y:12}}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-[97vw] max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2"><ArrowLeftRight className="h-4 w-4"/>Portal Only vs Books Only — Smart Compare</h2>
            <p className="text-[11px] text-white/75 mt-0.5">Auto-paired by invoice number &amp; value. Click Confirm to move matched pairs into Matched.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white"><X className="h-4 w-4"/></button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice, GSTIN…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400"/>
          </div>
          <select value={gstinFilter} onChange={e=>setGstinFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400 max-w-[200px]">
            <option value="">All GSTINs ({allGstins.length})</option>
            {allGstins.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          <div className="flex items-center gap-2 ml-auto text-[11px]">
            <span className={`px-1.5 py-0.5 rounded border font-bold ${CONF_COLOR.high}`}>✓ {stats.high} exact</span>
            <span className={`px-1.5 py-0.5 rounded border font-bold ${CONF_COLOR.medium}`}>≈ {stats.medium} near</span>
            <span className={`px-1.5 py-0.5 rounded border font-bold ${CONF_COLOR.low}`}>~ {stats.low} possible</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">P:<strong className="text-blue-600">{portalOnly.length}</strong> B:<strong className="text-violet-600">{booksOnly.length}</strong></span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-center font-semibold text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 w-8">#</th>
                {/* Portal */}
                <th className="px-2 py-2 text-left font-semibold text-blue-600 bg-blue-50/80 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Portal Invoice</th>
                <th className="px-2 py-2 text-left font-semibold text-blue-500 bg-blue-50/80 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">GSTIN / Party</th>
                <th className="px-2 py-2 text-left font-semibold text-blue-500 bg-blue-50/80 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-right font-semibold text-blue-500 bg-blue-50/80 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Value</th>
                <th className="px-2 py-2 text-right font-semibold text-blue-500 bg-blue-50/80 dark:bg-blue-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Tax</th>
                {/* Status */}
                <th className="px-2 py-2 text-center font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700/50 border-b border-l-2 border-r-2 border-slate-300 dark:border-slate-600 w-20">Match</th>
                {/* Books */}
                <th className="px-2 py-2 text-left font-semibold text-violet-600 bg-violet-50/80 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Books Invoice</th>
                <th className="px-2 py-2 text-left font-semibold text-violet-500 bg-violet-50/80 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">GSTIN / Party</th>
                <th className="px-2 py-2 text-left font-semibold text-violet-500 bg-violet-50/80 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Date</th>
                <th className="px-2 py-2 text-right font-semibold text-violet-500 bg-violet-50/80 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Value</th>
                <th className="px-2 py-2 text-right font-semibold text-violet-500 bg-violet-50/80 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Tax</th>
                <th className="px-2 py-2 text-center font-semibold text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-400 text-sm">No records match your filters</td></tr>
              )}
              {filtered.map((pair, i) => {
                const po  = pair.portal?.portal;
                const bo  = pair.books?.books;
                const g   = po?.gstin || bo?.gstin || '';
                const pName = po?.tradeOrLegalName || portalNameMap[g] || gstinNames[g] || '';
                const bName = portalNameMap[bo?.gstin] || gstinNames[bo?.gstin] || pName;
                const pTax  = po ? (po.igst||0)+(po.cgst||0)+(po.sgst||0) : null;
                const bTax  = bo ? (bo.igst||0)+(bo.cgst||0)+(bo.sgst||0) : null;
                const pairKey = `${pair.portal?.key}__${pair.books?.key}`;
                const isConfirmed = confirmed.has(pairKey);
                const rowBg = isConfirmed ? 'opacity-40' :
                              pair.confidence==='high'   ? 'bg-emerald-50/20 dark:bg-emerald-900/5'  :
                              pair.confidence==='medium' ? 'bg-amber-50/20 dark:bg-amber-900/5'      :
                              pair.confidence==='low'    ? 'bg-orange-50/20 dark:bg-orange-900/5'    : '';
                return (
                  <tr key={i} className={`border-b border-slate-100 dark:border-slate-700/50 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-700/20 ${rowBg}`}>
                    <td className="px-2 py-1.5 text-center text-slate-300 text-[11px]">{i+1}</td>
                    {/* Portal side */}
                    <td className="px-2 py-1.5 font-mono font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">{po?.invoiceNoRaw||<span className="text-slate-200">—</span>}</td>
                    <td className="px-3 py-2 min-w-[220px] max-w-[260px]">
                      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{po?.gstin||'—'}</div>
                      <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 leading-tight mt-0.5" title={pName}>{pName||(!isConfirmed&&po?.gstin?(
                        <button onClick={()=>lookupName(po.gstin)} disabled={lookingUp[po.gstin]} className="text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                          {lookingUp[po.gstin]?<Loader2 className="h-2.5 w-2.5 animate-spin"/>:<Search className="h-2.5 w-2.5"/>}lookup name
                        </button>
                      ):'—')}</div>
                    </td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap text-[11px]">{po?.invoiceDate||'—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">₹{po?fmt(po.invoiceValue):'—'}</td>
                    <td className="px-2 py-1.5 text-right text-blue-500 whitespace-nowrap">₹{pTax!=null?fmt(pTax):'—'}</td>
                    {/* Confidence */}
                    <td className="px-2 py-2 text-center bg-slate-50/40 dark:bg-slate-700/20 border-l-2 border-r-2 border-slate-200 dark:border-slate-600">
                      <span className={`px-1 py-0.5 rounded border text-[9px] font-bold ${CONF_COLOR[pair.confidence]}`}>{CONF_LABEL[pair.confidence]}</span>
                      {pair.valueDiff>0&&pair.confidence!=='none'&&<div className="text-[9px] text-slate-300 mt-0.5">Δ{pair.valueDiff.toFixed(1)}</div>}
                    </td>
                    {/* Books side */}
                    <td className="px-2 py-1.5 font-mono font-semibold text-violet-700 dark:text-violet-300 whitespace-nowrap">{bo?.invoiceNoRaw||<span className="text-slate-200">—</span>}</td>
                    <td className="px-3 py-2 min-w-[220px] max-w-[260px]">
                      <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{bo?.gstin||'—'}</div>
                      <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 leading-tight mt-0.5" title={bName}>{bName||(!isConfirmed&&bo?.gstin?(
                        <button onClick={()=>lookupName(bo.gstin)} disabled={lookingUp[bo.gstin]} className="text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                          {lookingUp[bo.gstin]?<Loader2 className="h-2.5 w-2.5 animate-spin"/>:<Search className="h-2.5 w-2.5"/>}lookup name
                        </button>
                      ):'—')}</div>
                    </td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap text-[11px]">{bo?.invoiceDate||'—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium text-violet-700 dark:text-violet-300 whitespace-nowrap">₹{bo?fmt(bo.invoiceValue):'—'}</td>
                    <td className="px-2 py-1.5 text-right text-violet-500 whitespace-nowrap">₹{bTax!=null?fmt(bTax):'—'}</td>
                    {/* Action */}
                    <td className="px-2 py-1.5 text-center">
                      {isConfirmed ? (
                        <span className="text-[10px] text-emerald-500 font-bold">✓ Done</span>
                      ) : pair.portal && pair.books ? (
                        <button onClick={()=>handleConfirm(pair,i)}
                          className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap">
                          Confirm
                        </button>
                      ) : (
                        <span className="text-slate-200 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 flex-shrink-0 text-[11px] text-slate-500">
          <span>{filtered.length} rows shown</span>
          <span className="text-emerald-600 font-medium">{stats.confirmed} confirmed this session</span>
          <span className="ml-auto">Portal: <strong className="text-blue-600">{portalOnly.length}</strong> unmatched | Books: <strong className="text-violet-600">{booksOnly.length}</strong> unmatched</span>
        </div>
      </motion.div>
    </div>
  );
};

const EMPTY_COMPANY = {
  name: '', gstin: '', pan: '', address: '', phone: '', email: '', fy: '',
};

export default function GSTReconciliation() {
  const [pageView,        setPageView]        = useState('new');   // 'new' | 'history'
  const [portalFile,      setPortalFile]       = useState(null);
  const [booksFile,       setBooksFile]        = useState(null);
  const [period,          setPeriod]           = useState('');
  const [company,         setCompany]          = useState(EMPTY_COMPANY);
  const [loading,         setLoading]          = useState(false);
  const [results,         setResults]          = useState(null);
  const [activeTab,       setActiveTab]        = useState('matched');
  const [showCo,          setShowCo]           = useState(true);
  const [itcModal,        setItcModal]         = useState(null); // null | 'claimable' | 'toBook' | 'atRisk'
  const [showCompare,     setShowCompare]      = useState(false);
  const [loadedSessionId, setLoadedSessionId]  = useState(null);  // when user opens a saved session
  const [baselineSnapshot, setBaselineSnapshot] = useState(null); // immutable copy of opened session
  const [snapshotSaved,    setSnapshotSaved]    = useState(false); // becomes true after baseline auto-save
  const [snapshotSaving,   setSnapshotSaving]   = useState(false);
  const [snapshotPrompt,   setSnapshotPrompt]   = useState(null); // {pendingEdit: () => void} | null

  // Client integration
  const [clients,         setClients]          = useState([]);
  const [selectedClient,  setSelectedClient]   = useState(null);
  const [clientsLoading,  setClientsLoading]   = useState(false);

  const [gstinLookupLoading, setGstinLookupLoading] = useState(false);
  const gstinLookupTimer = useRef(null);

  const setCo = (k, v) => {
    setCompany(p => ({ ...p, [k]: v }));
    // Auto-fetch company name from GST portal when a valid GSTIN is typed
    if (k === 'gstin') {
      const g = v.trim().toUpperCase();
      clearTimeout(gstinLookupTimer.current);
      if (GSTIN_PATTERN.test(g)) {
        gstinLookupTimer.current = setTimeout(async () => {
          setGstinLookupLoading(true);
          try {
            const result = await clientGstinLookup(g);
            const name = result.tradeName || result.legalName || '';
            if (name) {
              setCompany(prev => ({ ...prev, name: prev.name || name }));
              toast.success(`Company name fetched: ${name}`, { duration: 3000 });
            } else if (result.state) {
              toast.info(`GSTIN valid — ${result.entityType}, ${result.state}`, { duration: 2500 });
            }
          } catch (_) { /* silent */ }
          finally { setGstinLookupLoading(false); }
        }, 800);
      }
    }
  };

  // Auto-save the original (pre-edit) baseline of an opened history session.
  // Returns a Promise that resolves when the snapshot is safely persisted.
  const saveBaselineSnapshot = useCallback(async () => {
    if (!baselineSnapshot || snapshotSaved) return true;
    setSnapshotSaving(true);
    try {
      const snap = baselineSnapshot;
      const sm = {
        total_portal:       (snap.result?.matched?.length || 0) + (snap.result?.mismatch?.length || 0) + (snap.result?.portalOnly?.length || 0),
        total_books:        (snap.result?.matched?.length || 0) + (snap.result?.mismatch?.length || 0) + (snap.result?.booksOnly?.length || 0),
        matched_count:      snap.result?.matched?.length     || 0,
        mismatch_count:     snap.result?.mismatch?.length    || 0,
        portal_only_count:  snap.result?.portalOnly?.length  || 0,
        books_only_count:   snap.result?.booksOnly?.length   || 0,
        matched_value:      sumVal(snap.result?.matched || [], 'portal'),
        mismatch_value:     sumVal(snap.result?.mismatch || [], 'portal'),
        portal_only_value:  sumVal(snap.result?.portalOnly || [], 'portal'),
        books_only_value:   sumVal(snap.result?.booksOnly || [], 'books'),
        is_baseline_snapshot: true,
        original_session_id:  snap.sessionId || null,
      };
      const r = await api.post('/gst-reconciliation/save-session', {
        period:          snap.period || period,
        client_id:       selectedClient?.id || null,
        client_name:     (snap.company?.name) || company.name || `[Snapshot] ${snap.clientName || 'Reconciliation'}`,
        client_gstin:    (snap.company?.gstin) || company.gstin || snap.clientGstin || null,
        portal_filename: `[snapshot] ${snap.portalFilename || ''}`,
        books_filename:  `[snapshot] ${snap.booksFilename || ''}`,
        summary:         sm,
        full_result:     snap.result,
        company:         snap.company || {},
      });
      setSnapshotSaved(true);
      toast.success('Baseline snapshot saved to history — your original is safe.', {
        description: r?.data?.session_id ? `Snapshot ID: ${r.data.session_id.slice(0,8)}…` : undefined,
      });
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Could not save snapshot. Edit cancelled — please try again.');
      return false;
    } finally {
      setSnapshotSaving(false);
    }
  }, [baselineSnapshot, snapshotSaved, period, selectedClient, company]);

  // Wrap any edit action: if we are inside an opened history session and have not
  // yet saved a baseline snapshot, prompt the user to confirm. Once confirmed and
  // the snapshot is persisted, run the edit. If no baseline (fresh run), run immediately.
  const guardEdit = useCallback((editFn) => {
    if (!baselineSnapshot || snapshotSaved) {
      editFn();
      return;
    }
    setSnapshotPrompt({ pendingEdit: editFn });
  }, [baselineSnapshot, snapshotSaved]);

  // Mark an invoice from mismatch/portalOnly/booksOnly as manually matched
  const handleMarkMatched = useCallback((record, tabId) => {
    guardEdit(() => setResults(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      // Remove from source tab
      if (tabId === 'mismatch')    updated.mismatch    = prev.mismatch.filter(r => r.key !== record.key);
      if (tabId === 'portalOnly')  updated.portalOnly  = prev.portalOnly.filter(r => r.key !== record.key);
      if (tabId === 'booksOnly')   updated.booksOnly   = prev.booksOnly.filter(r => r.key !== record.key);
      // Add to matched as manually confirmed
      const portal = record.portal || record.books;
      const books  = record.books  || record.portal;
      updated.matched = [...prev.matched, { ...record, portal, books, manualMatch: true }];
      return updated;
    }));
    toast.success('Invoice marked as Matched');
  }, [guardEdit]);

  // Confirm a pair from Side-by-Side Compare as manually matched
  const handleConfirmMatch = useCallback((pair) => {
    guardEdit(() => setResults(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      updated.portalOnly = prev.portalOnly.filter(r => r.key !== pair.portal?.key);
      updated.booksOnly  = prev.booksOnly.filter(r  => r.key !== pair.books?.key);
      updated.matched = [...prev.matched, {
        portal: pair.portal?.portal,
        books:  pair.books?.books,
        key:    pair.portal?.key || pair.books?.key,
        manualMatch: true,
        normalizedMatch: (pair.portal?.portal?.invoiceNoRaw || '') !== (pair.books?.books?.invoiceNoRaw || ''),
      }];
      return updated;
    }));
    toast.success(`Matched: ${pair.portal?.portal?.invoiceNoRaw} ↔ ${pair.books?.books?.invoiceNoRaw}`);
  }, [guardEdit]);

  // Fetch clients on mount
  useEffect(() => {
    setClientsLoading(true);
    api.get('/gst-reconciliation/clients')
      .then(r => setClients(r.data.clients || []))
      .catch(() => {})
      .finally(() => setClientsLoading(false));
  }, []);

  // When client is selected, auto-fill company form
  const handleClientSelect = (client) => {
    setSelectedClient(client);
    if (!client) return;
    const address = [client.address, client.city, client.state].filter(Boolean).join(', ');
    const email   = client.email || client.contact_persons?.[0]?.email || '';
    const phone   = client.phone || client.contact_persons?.[0]?.phone || '';
    setCompany(prev => ({
      ...prev,
      name:    client.company_name || prev.name,
      gstin:   client.gstin        || prev.gstin,
      pan:     client.pan          || prev.pan,
      address: address             || prev.address,
      phone:   phone               || prev.phone,
      email:   email               || prev.email,
    }));
  };

  const handlePortalFile = async (file) => {
    setPortalFile(file);
    if (!file) return;
    try {
      const wb = await readWorkbook(file);
      const meta = extractPortalMetadata(wb);
      // Auto-fill period only if user hasn't typed one yet
      if (meta.period) setPeriod(prev => prev || meta.period);
      // Auto-fill company fields from the portal header
      setCompany(prev => ({
        ...prev,
        name:  prev.name  || meta.tradeName || '',
        gstin: prev.gstin || meta.gstin     || '',
      }));
      if (meta.period || meta.tradeName || meta.gstin) {
        toast.success('Period & company auto-detected from GSTR-2B file', { duration: 3000 });
      }
      // If we got a GSTIN and no name yet, trigger client-side GSTIN lookup
      if (meta.gstin && !meta.tradeName) {
        try {
          const result = await clientGstinLookup(meta.gstin);
          const name = result.tradeName || result.legalName || '';
          if (name) setCompany(prev => ({ ...prev, name: prev.name || name }));
        } catch (_) { /* best-effort */ }
      }
    } catch (_) { /* If metadata extraction fails, silently continue */ }
  };

  const readWorkbook = file => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => { try { res(XLSX.read(e.target.result, { type:'array', raw:false })); } catch(err) { rej(err); } };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });

  const handleReconcile = async () => {
    if (!portalFile || !booksFile) { toast.error('Please upload both files.'); return; }
    setLoading(true); setResults(null);
    try {
      const [portalWB, booksWB] = await Promise.all([readWorkbook(portalFile), readWorkbook(booksFile)]);
      const portalData = parseGSTPortalFile(portalWB);
      const booksData  = parseBooksFile(booksWB);
      if (!portalData.length && !booksData.length) { toast.error('Could not parse data from the files. Please check the file formats.'); return; }
      const res = reconcile(portalData, booksData);
      setResults(res); setActiveTab('matched');
      toast.success(`Reconciliation complete — ${portalData.length} portal + ${booksData.length} books invoices.`);

      // Auto-save session to history
      const summary = {
        total_portal:       portalData.length,
        total_books:        booksData.length,
        matched_count:      res.matched.length,
        mismatch_count:     res.mismatch.length,
        portal_only_count:  res.portalOnly.length,
        books_only_count:   res.booksOnly.length,
        matched_value:      sumVal(res.matched, 'portal'),
        mismatch_value:     sumVal(res.mismatch, 'portal'),
        portal_only_value:  sumVal(res.portalOnly, 'portal'),
        books_only_value:   sumVal(res.booksOnly, 'books'),
        matched_tax:        sumTax(res.matched, 'portal'),
        mismatch_tax:       sumTax(res.mismatch, 'portal'),
        portal_only_tax:    sumTax(res.portalOnly, 'portal'),
        books_only_tax:     sumTax(res.booksOnly, 'books'),
      };
      api.post('/gst-reconciliation/save-session', {
        period,
        client_id:       selectedClient?.id       || null,
        client_name:     company.name              || selectedClient?.company_name || null,
        client_gstin:    company.gstin             || selectedClient?.gstin || null,
        portal_filename: portalFile.name,
        books_filename:  booksFile.name,
        summary,
        full_result: res,                  // full reconciliation payload — enables re-open + edit
        company,                            // company details for header restoration
      }).then(r => {
        if (r?.data?.session_id) setLoadedSessionId(r.data.session_id);
      }).catch(() => {}); // fire-and-forget

    } catch (err) {
      console.error(err); toast.error(`Failed: ${err.message}`);
    } finally { setLoading(false); }
  };

  const handleReset = () => { setPortalFile(null); setBooksFile(null); setResults(null); setPeriod(''); setLoadedSessionId(null); setBaselineSnapshot(null); setSnapshotSaved(false); setSnapshotPrompt(null); };

  const activeRecords = results && activeTab !== 'search'
    ? { matched:results.matched, mismatch:results.mismatch, portalOnly:results.portalOnly, booksOnly:results.booksOnly }[activeTab] || []
    : [];
  const activeTabMeta = TABS.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
                <ArrowLeftRight className="h-5 w-5 text-indigo-600 dark:text-indigo-400"/>
              </div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">GST Reconciliation</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 ml-12">Reconcile GSTR-2B (GST Portal) with Purchase Register (Books of Account)</p>
          </div>
          {results && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={()=>exportPDF(results, company, period)} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors">
                <FileText className="h-4 w-4"/> PDF Report
              </button>
              <button onClick={()=>exportWord(results, company, period)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors">
                <FileText className="h-4 w-4"/> Word Report
              </button>
              <button onClick={()=>exportExcel(results, company, period)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors">
                <FileSpreadsheet className="h-4 w-4"/> Excel
              </button>
              <button onClick={handleReset} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <RefreshCw className="h-4 w-4"/> Reset
              </button>
            </div>
          )}
        </div>

        {/* ── Page View Switcher ── */}
        {!results && (
          <div className="flex gap-1 p-1 bg-slate-200 dark:bg-slate-700 rounded-xl mb-5 w-fit">
            {[
              { id: 'new',     label: 'New Reconciliation', icon: ArrowLeftRight },
              { id: 'history', label: 'History',            icon: History },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setPageView(v.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  pageView === v.id
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <v.icon className="h-4 w-4" />
                {v.label}
              </button>
            ))}
          </div>
        )}

        {/* ── History View ── */}
        {pageView === 'history' && !results && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <History className="h-5 w-5 text-indigo-500" />
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Reconciliation History</h2>
              <span className="ml-auto text-[11px] text-slate-400">Click <strong className="text-indigo-500">Open</strong> on any entry to reload the full reconciliation, edit it, and re-generate reports.</span>
            </div>
            <HistoryView onOpenSession={(payload) => {
              // Restore full reconciliation into the active workspace
              setResults(payload.result);
              setActiveTab('matched');
              setPeriod(payload.period || '');
              if (payload.company && Object.keys(payload.company).length) {
                setCompany(prev => ({ ...prev, ...payload.company }));
              } else if (payload.clientName || payload.clientGstin) {
                setCompany(prev => ({ ...prev, name: payload.clientName || prev.name, gstin: payload.clientGstin || prev.gstin }));
              }
              setLoadedSessionId(payload.sessionId || null);
              // Capture an immutable baseline snapshot — used to confirm-save before the first edit
              setBaselineSnapshot({
                result:         JSON.parse(JSON.stringify(payload.result)),
                company:        payload.company || {},
                period:         payload.period || '',
                portalFilename: payload.portalFilename || '',
                booksFilename:  payload.booksFilename  || '',
                sessionId:      payload.sessionId || null,
                clientName:     payload.clientName || '',
                clientGstin:    payload.clientGstin || '',
                openedAt:       new Date().toISOString(),
              });
              setSnapshotSaved(false);
              setPageView('new');
              toast.success('Reconciliation loaded — fully editable. Your first edit will be confirmed before changes apply.');
            }} />
          </div>
        )}

        {/* ── Upload + Company Details Section ── */}
        {pageView === 'new' && !results && (
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-6 shadow-sm">

            {/* Client Selector */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Link to Client
                {clientsLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
              </label>
              <ClientSelector
                clients={clients}
                selectedId={selectedClient?.id}
                onSelect={handleClientSelect}
              />
              {selectedClient && (
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Company details auto-filled from client record
                </p>
              )}
            </div>

            {/* Company Details */}
            <div className="mb-6">
              <button onClick={()=>setShowCo(v=>!v)} className="flex items-center gap-2 w-full text-left mb-3">
                <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400"/>
                <span className="font-semibold text-slate-700 dark:text-slate-200">Company Details</span>
                <span className="text-xs text-slate-400 ml-1">(for report header)</span>
                <ChevronRight className={`h-4 w-4 text-slate-400 ml-auto transition-transform ${showCo?'rotate-90':''}`}/>
              </button>
              <AnimatePresence>
                {showCo && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                      {[
                        { k:'name',    label:'Company / Trade Name*', icon:Building2,  ph:'e.g. MED 7 PHARMACY' },
                        { k:'gstin',   label:'GSTIN*',                icon:Hash,       ph:'e.g. 24ARQPP3237M1Z9' },
                        { k:'pan',     label:'PAN',                   icon:Hash,       ph:'e.g. ARQPP3237M' },
                        { k:'address', label:'Address',               icon:MapPin,     ph:'Street, Area, City' },
                        { k:'phone',   label:'Phone',                 icon:Phone,      ph:'e.g. +91 98765 43210' },
                        { k:'email',   label:'Email',                 icon:Mail,       ph:'e.g. accounts@company.com' },
                        { k:'fy',      label:'Financial Year',        icon:Calendar,   ph:'e.g. 2025-26' },
                      ].map(f => (
                        <div key={f.k}>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                            {f.label}
                            {f.k === 'gstin' && gstinLookupLoading && (
                              <Loader2 className="h-3 w-3 animate-spin text-indigo-500 ml-1" />
                            )}
                            {f.k === 'gstin' && !gstinLookupLoading && GSTIN_PATTERN.test((company.gstin||'').trim().toUpperCase()) && (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-1" title="GSTIN validated" />
                            )}
                          </label>
                          <div className="relative">
                            <f.icon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"/>
                            <input
                              value={company[f.k]}
                              onChange={e=>setCo(f.k, e.target.value)}
                              placeholder={f.ph}
                              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Period */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Tax Period *
                {portalFile && period && (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-normal normal-case">
                    ✓ auto-detected from file
                  </span>
                )}
              </label>
              <div className="relative w-full sm:w-64">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"/>
                <input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="e.g. March 2026"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
              </div>
            </div>

            {/* File Upload */}
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4 text-indigo-600 dark:text-indigo-400"/> Upload Files
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <DropZone label="GSTR-2B (GST Portal)" icon={Globe}   hint="Download GSTR-2B Excel from GST portal"        file={portalFile} onFile={handlePortalFile} onClear={()=>{ setPortalFile(null); }} colors={{ done:'bg-blue-50 dark:bg-blue-900/20 border-blue-400', drag:'bg-blue-50 dark:bg-blue-900/10 border-blue-400', iconBg:'bg-blue-100 dark:bg-blue-900/40', iconColor:'text-blue-600 dark:text-blue-300', btn:'bg-blue-600 hover:bg-blue-700 text-white' }}/>
              <DropZone label="Purchase Register (Books)" icon={BookOpen} hint="Export b2b sheet from your accounting software" file={booksFile}  onFile={setBooksFile}  onClear={()=>setBooksFile(null)}  colors={{ done:'bg-violet-50 dark:bg-violet-900/20 border-violet-400', drag:'bg-violet-50 dark:bg-violet-900/10 border-violet-400', iconBg:'bg-violet-100 dark:bg-violet-900/40', iconColor:'text-violet-600 dark:text-violet-300', btn:'bg-violet-600 hover:bg-violet-700 text-white' }}/>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 mb-5 text-xs text-amber-700 dark:text-amber-300">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0"/>
              <span><strong>Supported: </strong>GSTR-2B Excel from GST portal (.xlsx) and GSTR-2 offline tool (.xls/.xlsx) with b2b sheet. Each reconciliation is saved to history automatically.</span>
            </div>

            <button onClick={handleReconcile} disabled={!portalFile||!booksFile||loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl shadow-sm transition-colors">
              {loading ? <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Processing…</> : <><ArrowLeftRight className="h-4 w-4"/>Reconcile Now</>}
            </button>
          </motion.div>
        )}

        {/* ── Results ── */}
        <AnimatePresence>
          {results && (
            <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0}}>

              {/* Company info bar */}
              {company.name && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 mb-4 text-xs text-indigo-700 dark:text-indigo-300">
                  <Building2 className="h-4 w-4 flex-shrink-0"/>
                  <span className="font-bold">{company.name}</span>
                  {company.gstin && <span>GSTIN: {company.gstin}</span>}
                  {period        && <span>Period: {period}</span>}
                  {company.fy    && <span>FY: {company.fy}</span>}
                  <span className="ml-auto flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Saved to history
                  </span>
                </div>
              )}

              {/* ITC Summary Banner */}
              {results && (() => {
                const itcEligible = results.matched.reduce((s,r) => {
                  const inv = r.portal;
                  if (!inv) return s;
                  return s + (inv.igst||0) + (inv.cgst||0) + (inv.sgst||0);
                }, 0);
                const itcAtRisk = results.booksOnly.reduce((s,r) => {
                  const inv = r.books;
                  if (!inv) return s;
                  return s + (inv.igst||0) + (inv.cgst||0) + (inv.sgst||0);
                }, 0);
                const itcPending = results.portalOnly.reduce((s,r) => {
                  const inv = r.portal;
                  if (!inv) return s;
                  return s + (inv.igst||0) + (inv.cgst||0) + (inv.sgst||0);
                }, 0);
                return (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <button
                      onClick={() => setItcModal('claimable')}
                      className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 p-3 text-left hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-600 transition-all group cursor-pointer"
                    >
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1">ITC Claimable <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">₹{fmt(itcEligible)}</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400">From {results.matched.length} matched invoices</p>
                    </button>
                    <button
                      onClick={() => setItcModal('toBook')}
                      className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-3 text-left hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all group cursor-pointer"
                    >
                      <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">ITC to Book <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-0.5">₹{fmt(itcPending)}</p>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400">From {results.portalOnly.length} portal-only invoices</p>
                    </button>
                    <button
                      onClick={() => setItcModal('atRisk')}
                      className="bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800 p-3 text-left hover:shadow-md hover:border-rose-400 dark:hover:border-rose-600 transition-all group cursor-pointer"
                    >
                      <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide flex items-center gap-1">ITC at Risk <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity"/></p>
                      <p className="text-lg font-bold text-rose-700 dark:text-rose-300 mt-0.5">₹{fmt(itcAtRisk)}</p>
                      <p className="text-[10px] text-rose-600 dark:text-rose-400">From {results.booksOnly.length} books-only invoices</p>
                    </button>
                  </div>
                );
              })()}

              {/* Summary cards — 4 data tabs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {TABS.filter(t => t.id !== 'search').map(tab => {
                  const count = results[tab.id]?.length || 0;
                  const val = (results[tab.id]||[]).reduce((s,r) => s+((tab.id==='booksOnly'?r.books:r.portal)?.invoiceValue||0), 0);
                  const isActive = activeTab === tab.id;
                  return (
                    <motion.div key={tab.id} whileHover={{y:-2}} onClick={()=>setActiveTab(tab.id)}
                      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 ${isActive ? `${tab.color.activeBg} ${tab.color.activeBorder} shadow-md` : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-md'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-xs font-medium mb-1 ${isActive ? tab.color.activeText : 'text-slate-500 dark:text-slate-400'}`}>{tab.label}</p>
                          <p className={`text-2xl font-bold ${isActive ? tab.color.activeText : 'text-slate-800 dark:text-slate-100'}`}>{count}</p>
                          <p className={`text-xs mt-1 ${isActive ? tab.color.activeText : 'text-slate-400'}`}>₹{fmt(val)}</p>
                        </div>
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-white/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                          <tab.icon className={`h-5 w-5 ${isActive ? tab.color.activeText : 'text-slate-400'}`}/>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Tab panel */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                {/* Tab bar — tabs + Compare action button at the end */}
                <div className="flex items-center overflow-x-auto border-b border-slate-200 dark:border-slate-700 px-2 pt-2 gap-0">
                  {TABS.map(tab => {
                    const count = tab.id === 'search'
                      ? (results.matched.length + results.mismatch.length + results.portalOnly.length + results.booksOnly.length)
                      : results[tab.id]?.length || 0;
                    const isActive = activeTab === tab.id;
                    return (
                      <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-xl whitespace-nowrap transition-all border-b-2 mr-1 ${isActive ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        <tab.icon className="h-3.5 w-3.5"/>
                        {tab.label}
                        <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab.color.badge}`}>{count}</span>
                      </button>
                    );
                  })}
                  {/* Compare action button in tab row */}
                  <button
                    onClick={() => setShowCompare(true)}
                    className="flex items-center gap-1.5 ml-auto mr-1 mb-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap transition-colors shadow-sm flex-shrink-0"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5"/> Compare P vs B
                  </button>
                </div>
                <div className="p-4">
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 mb-3 text-xs">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-400"/>
                    <span className="text-slate-600 dark:text-slate-400">{activeTabMeta?.desc}</span>
                  </div>
                  {activeTab === 'search'
                    ? <GlobalSearchTab key="search" results={results}/>
                    : <ResultTable
                        key={activeTab}
                        tabId={activeTab}
                        records={activeRecords}
                        onMarkMatched={['mismatch','portalOnly','booksOnly'].includes(activeTab) ? (r) => handleMarkMatched(r, activeTab) : undefined}
                      />
                  }
                </div>
              </div>

              {/* Export reminder */}
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Download Report:</span>
                <button onClick={()=>exportPDF(results, company, period)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg transition-colors">
                  <FileText className="h-3.5 w-3.5"/> PDF
                </button>
                <button onClick={()=>exportWord(results, company, period)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                  <FileText className="h-3.5 w-3.5"/> Word (.doc)
                </button>
                <button onClick={()=>exportExcel(results, company, period)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors">
                  <FileSpreadsheet className="h-3.5 w-3.5"/> Excel
                </button>
                <button onClick={() => { handleReset(); setPageView('history'); }} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs transition-colors border border-indigo-200 dark:border-indigo-800 rounded-lg font-medium">
                  <History className="h-3.5 w-3.5" /> View History
                </button>
                {baselineSnapshot && (
                  <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${snapshotSaved
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}
                    title={snapshotSaved ? 'Original baseline already saved as a separate session.' : 'Your first edit will prompt to save a baseline snapshot before applying changes.'}>
                    {snapshotSaved
                      ? <><CheckCircle2 className="h-3.5 w-3.5" /> Baseline snapshot saved</>
                      : <><AlertTriangle className="h-3.5 w-3.5" /> Editing opened session — snapshot pending</>}
                  </span>
                )}
                <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs transition-colors">
                  <RefreshCw className="h-3.5 w-3.5"/> New Reconciliation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── Side-by-Side Compare Modal ── */}
      <AnimatePresence>
        {showCompare && results && (
          <SideBySideCompare
            portalOnly={results.portalOnly || []}
            booksOnly={results.booksOnly   || []}
            onConfirmMatch={handleConfirmMatch}
            onClose={() => setShowCompare(false)}
          />
        )}
      </AnimatePresence>

      {/* ── ITC Detail Modal ── */}
      <AnimatePresence>
        {itcModal && results && (
          <ITCDetailModal
            type={itcModal}
            results={results}
            onClose={() => setItcModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Baseline Snapshot Confirmation Modal ── */}
      <AnimatePresence>
        {snapshotPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !snapshotSaving && setSnapshotPrompt(null)}/>
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-start gap-3 px-5 py-4 bg-gradient-to-r from-amber-500 to-orange-500">
                <div className="p-2 rounded-lg bg-white/20 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-white"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Save baseline snapshot before editing?</h3>
                  <p className="text-[11px] text-white/85 mt-0.5">We'll save the original (unedited) reconciliation as a separate history entry first, so your edits never overwrite it.</p>
                </div>
              </div>
              <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
                <p>This is a one-time prompt for this opened session. After confirming, all subsequent edits apply immediately.</p>
                <ul className="text-[12px] text-slate-500 dark:text-slate-400 list-disc pl-5 space-y-0.5">
                  <li>Original session: <strong>{baselineSnapshot?.clientName || baselineSnapshot?.portalFilename || 'Opened reconciliation'}</strong></li>
                  <li>Snapshot will be tagged <code className="px-1 bg-slate-100 dark:bg-slate-700 rounded text-[11px]">[snapshot]</code> in history.</li>
                </ul>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
                <button
                  disabled={snapshotSaving}
                  onClick={() => setSnapshotPrompt(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={snapshotSaving}
                  onClick={async () => {
                    const ok = await saveBaselineSnapshot();
                    if (ok) {
                      const fn = snapshotPrompt?.pendingEdit;
                      setSnapshotPrompt(null);
                      if (typeof fn === 'function') fn();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60"
                >
                  {snapshotSaving
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin"/> Saving...</>
                    : <><CheckCircle2 className="h-3.5 w-3.5"/> Save & continue</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
