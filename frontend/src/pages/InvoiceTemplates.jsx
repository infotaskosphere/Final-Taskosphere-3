/**
 * InvoiceTemplates.jsx
 *
 * 5 Freepik-inspired invoice templates, each featuring:
 *   • A company logo zone that adapts to any colour theme
 *   • Supports logo_url (image) or auto-generates an SVG initials badge
 *   • Full Indian GST (CGST / SGST / IGST) breakup
 *
 * ─── Exports ────────────────────────────────────────────────────────────────
 *   COLOR_THEMES          8 presets + custom
 *   INVOICE_TEMPLATES     5 template metadata objects
 *   generateInvoiceHTML() returns a complete HTML string ready to print
 *   openInvoicePrint()    opens a browser print-preview popup
 *   InvoiceDesignModal    full picker UI: template + colour + live preview
 *
 * ─── Usage in invoicing.jsx ─────────────────────────────────────────────────
 *   import { InvoiceDesignModal, openInvoicePrint } from './InvoiceTemplates';
 *
 *   const [designOpen,       setDesignOpen]       = useState(false);
 *   const [selectedTemplate, setSelectedTemplate] = useState('prestige');
 *   const [selectedTheme,    setSelectedTheme]    = useState('ocean');
 *   const [customColor,      setCustomColor]      = useState('#0D3B66');
 *
 *   // Print any invoice:
 *   <button onClick={() =>
 *     openInvoicePrint(invoice, company, selectedTemplate, selectedTheme, customColor)
 *   }>Print</button>
 *
 *   // Design picker modal:
 *   <InvoiceDesignModal
 *     open={designOpen}           onClose={() => setDesignOpen(false)}
 *     selectedTemplate={selectedTemplate} onTemplateChange={setSelectedTemplate}
 *     selectedTheme={selectedTheme}       onThemeChange={setSelectedTheme}
 *     customColor={customColor}           onCustomColorChange={setCustomColor}
 *     sampleInvoice={invoices[0]}         sampleCompany={companies[0]}
 *     isDark={isDark}
 *   />
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { X, Printer, Eye, Check, Palette, Layout } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// 1.  COLOR THEMES
// ═══════════════════════════════════════════════════════════════════════════════

export const COLOR_THEMES = [
  { id: 'ocean',   name: 'Ocean Blue',   primary: '#0D3B66', secondary: '#1F6FB2', light: '#EFF6FF', accent: '#93C5FD' },
  { id: 'forest',  name: 'Forest Green', primary: '#064e3b', secondary: '#059669', light: '#ECFDF5', accent: '#6EE7B7' },
  { id: 'royal',   name: 'Royal Purple', primary: '#3b0764', secondary: '#7c3aed', light: '#F5F3FF', accent: '#C4B5FD' },
  { id: 'crimson', name: 'Crimson Red',  primary: '#7f1d1d', secondary: '#dc2626', light: '#FEF2F2', accent: '#FCA5A5' },
  { id: 'amber',   name: 'Amber Gold',   primary: '#78350f', secondary: '#d97706', light: '#FFFBEB', accent: '#FCD34D' },
  { id: 'teal',    name: 'Teal',         primary: '#134e4a', secondary: '#0d9488', light: '#F0FDFA', accent: '#99F6E4' },
  { id: 'slate',   name: 'Slate',        primary: '#1e293b', secondary: '#475569', light: '#F8FAFC', accent: '#CBD5E1' },
  { id: 'rose',    name: 'Rose',         primary: '#881337', secondary: '#e11d48', light: '#FFF1F2', accent: '#FDA4AF' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 2.  TEMPLATE METADATA  (5 templates)
// ═══════════════════════════════════════════════════════════════════════════════

export const INVOICE_TEMPLATES = [
  {
    id:    'prestige',
    name:  'Prestige',
    desc:  'Two-column header: logo + company left, colour panel right. Clean white body, full GST table.',
    badge: 'Most Popular',
  },
  {
    id:    'arc',
    name:  'Bold Arc',
    desc:  'Full-width curved colour banner with centred circular logo. Dramatic, brand-forward layout.',
    badge: 'Standout',
  },
  {
    id:    'minimal',
    name:  'Minimal Corner',
    desc:  'Ultra-clean white page; logo anchored top-right with a colour underline accent. Typography-first.',
    badge: 'Clean',
  },
  {
    id:    'splitpanel',
    name:  'Split Panel',
    desc:  'Coloured left sidebar carries logo, client info & bank details; white right panel holds items.',
    badge: 'Premium',
  },
  {
    id:    'gradient',
    name:  'Gradient Banner',
    desc:  'Wide gradient hero with floating info cards below. Circular logo badge with white ring.',
    badge: 'Modern',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// 3.  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Format a number with Indian comma style and 2 decimal places. */
const fmtN = (n) =>
  new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

/** Prepend ₹ symbol. */
const fmtC = (n) => `₹${fmtN(n)}`;

/** Convert a numeric amount to Indian English words. */
function amountToWords(amount) {
  const num = Math.round(amount);
  if (num === 0) return 'Zero Rupees Only';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n) {
    if (n === 0)   return '';
    if (n < 20)    return ones[n] + ' ';
    if (n < 100)   return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    return ones[Math.floor(n / 100)] + ' Hundred ' + conv(n % 100);
  }
  const cr = Math.floor(num / 10000000);
  const lk = Math.floor((num % 10000000) / 100000);
  const th = Math.floor((num % 100000) / 1000);
  const re = num % 1000;
  let r = '';
  if (cr) r += conv(cr) + 'Crore ';
  if (lk) r += conv(lk) + 'Lakh ';
  if (th) r += conv(th) + 'Thousand ';
  if (re) r += conv(re);
  return r.trim() + ' Rupees Only';
}

/** Resolve a theme object from an id or custom hex. */
function getThemeColor(selectedTheme, customColor) {
  if (selectedTheme === 'custom')
    return { primary: customColor, secondary: customColor, light: '#F8FAFC', accent: '#CBD5E1' };
  return COLOR_THEMES.find((t) => t.id === selectedTheme) || COLOR_THEMES[0];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4.  LOGO HELPER
//
//     Every template calls getLogoHTML() which returns an HTML string.
//     • If company.logo_url is set   → renders <img> (colour-filtered on dark bg)
//     • Otherwise                    → renders an SVG badge with company initials
//       The badge background / ring colours are driven by the active theme,
//       so the logo automatically "recolours" when the user picks a new theme.
//
//     Parameters
//       company  – company object (name, logo_url …)
//       theme    – active theme object { primary, secondary, light, accent }
//       size     – badge width & height in px (default 52)
//       shape    – 'circle' | 'rounded' | 'sharp'
//       variant  – 'on-color'  (logo sits on a coloured background → use white glass style)
//                  'on-white'  (logo sits on white background       → use filled colour style)
// ═══════════════════════════════════════════════════════════════════════════════

function getLogoHTML(company, theme, size = 52, shape = 'rounded', variant = 'on-white') {
  /* ── Derive initials ── */
  const rawName  = (company?.name || 'CO').trim();
  const words    = rawName.split(/\s+/);
  const initials =
    words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : rawName.slice(0, 2).toUpperCase();

  /* ── Corner radius ── */
  const r =
    shape === 'circle'  ? size / 2 :
    shape === 'sharp'   ? 3 :
    /* rounded */         size * 0.22;

  /* ── Colours vary by variant ── */
  const bgFill   = variant === 'on-color' ? 'rgba(255,255,255,0.18)' : theme.primary;
  const rimColor = variant === 'on-color' ? 'rgba(255,255,255,0.35)' : theme.secondary;
  const fontSize = size * 0.37;

  /* ── If caller supplied an uploaded logo image ── */
  if (company?.logo_url) {
    // On a coloured background invert to white; on white leave as-is
    const imgFilter = variant === 'on-color' ? 'brightness(0) invert(1)' : 'none';
    return `<img
      src="${company.logo_url}"
      alt="${rawName}"
      style="height:${size}px;width:auto;max-width:${size * 3}px;
             object-fit:contain;filter:${imgFilter};display:block;" />`;
  }

  /* ── Auto-generated SVG initials badge ── */
  return `<svg
    width="${size}" height="${size}"
    viewBox="0 0 ${size} ${size}"
    xmlns="http://www.w3.org/2000/svg"
    style="display:block;flex-shrink:0;">
    <!-- outer fill -->
    <rect width="${size}" height="${size}" rx="${r}" fill="${bgFill}" />
    <!-- inner rim -->
    <rect
      x="2.5" y="2.5"
      width="${size - 5}" height="${size - 5}"
      rx="${Math.max(r - 2, 1)}"
      fill="none"
      stroke="${rimColor}"
      stroke-width="1.5" />
    <!-- initials -->
    <text
      x="${size / 2}"
      y="${size / 2 + fontSize * 0.38}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="'Segoe UI', Arial, sans-serif"
      font-weight="900"
      font-size="${fontSize}"
      fill="white"
      letter-spacing="1">${initials}</text>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5.  BASE CSS  (injected into every template's <style> block)
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    color: #1a1a1a;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table { width: 100%; border-collapse: collapse; }
  @media print {
    body { margin: 0; }
    @page { size: A4; margin: 10mm; }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// 6.  TEMPLATE 1 — PRESTIGE
//     Inspired by Freepik's classic two-column header layout.
//     Left: logo badge + company name + address.
//     Right: theme-coloured panel holding invoice number, date, status pill.
//     Body: white with full GST items table + two-column totals footer.
// ═══════════════════════════════════════════════════════════════════════════════

function tplPrestige(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items   = inv.items || [];

  /* Logo sits on white background in the left panel */
  const logo = getLogoHTML(company, theme, 56, 'rounded', 'on-white');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${inv.invoice_no || 'Invoice'}</title>
  <style>
    ${BASE_CSS}

    /* ── PAGE ── */
    .page { max-width: 210mm; margin: 0 auto; padding: 12mm; }

    /* ── HEADER ── */
    .header {
      display: flex;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 22px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }

    /* Left white panel */
    .h-left {
      flex: 1;
      padding: 20px 22px;
      background: #ffffff;
      border: 1px solid #E2E8F0;
      border-right: none;
      border-radius: 10px 0 0 10px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .h-left-text {}
    .co-name {
      font-size: 20px;
      font-weight: 900;
      color: ${theme.primary};
      letter-spacing: -0.3px;
      margin-top: 6px;
    }
    .co-addr  { font-size: 10px; color: #9CA3AF; line-height: 1.7; margin-top: 3px; }
    .co-gstin {
      display: inline-block;
      margin-top: 6px;
      background: ${theme.light};
      border: 1px solid ${theme.accent};
      color: ${theme.primary};
      font-size: 9px;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 10px;
    }

    /* Right coloured panel */
    .h-right {
      width: 220px;
      flex-shrink: 0;
      background: ${theme.primary};
      border-radius: 0 10px 10px 0;
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    /* decorative circle in corner */
    .h-right::before {
      content: '';
      position: absolute;
      bottom: -30px;
      right: -30px;
      width: 110px;
      height: 110px;
      background: rgba(255,255,255,0.07);
      border-radius: 50%;
    }
    .h-right::after {
      content: '';
      position: absolute;
      top: -20px;
      right: 40px;
      width: 70px;
      height: 70px;
      background: rgba(255,255,255,0.05);
      border-radius: 50%;
    }
    .inv-type-pill {
      display: inline-block;
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.35);
      color: white;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 3px 12px;
      border-radius: 20px;
      margin-bottom: 10px;
      position: relative;
    }
    .inv-no {
      font-size: 22px;
      font-weight: 900;
      color: white;
      position: relative;
      line-height: 1.1;
    }
    .inv-date-line {
      font-size: 10px;
      color: rgba(255,255,255,0.65);
      margin-top: 6px;
      position: relative;
    }

    /* ── PARTY GRID ── */
    .party-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }
    .party-box {
      background: ${theme.light};
      border: 1px solid ${theme.accent};
      border-radius: 8px;
      padding: 13px 15px;
    }
    .party-box h4 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${theme.secondary};
      margin-bottom: 7px;
    }
    .party-box .p-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .party-box p       { font-size: 11px; color: #374151; line-height: 1.7; }
    .gstin-tag {
      display: inline-block;
      background: ${theme.primary};
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 3px;
      margin-top: 4px;
    }

    /* ── ITEMS TABLE ── */
    table.items thead tr         { background: ${theme.primary}; }
    table.items thead th         { color: white; padding: 9px 7px; font-size: 10px; font-weight: 700; text-align: left; }
    table.items thead th.r       { text-align: right; }
    table.items tbody tr:nth-child(even) { background: ${theme.light}; }
    table.items tbody td         { padding: 8px 7px; font-size: 11px; border-bottom: 1px solid #F1F5F9; color: #374151; vertical-align: top; }
    table.items tbody td.r       { text-align: right; }
    table.items tbody td.b       { font-weight: 700; color: #111827; }

    /* ── TOTALS FOOTER ── */
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 260px;
      gap: 16px;
      margin-top: 16px;
    }

    /* Bank + words block */
    .bank-block {
      background: ${theme.light};
      border: 1px solid ${theme.accent};
      border-radius: 8px;
      padding: 13px;
    }
    .bank-block h4 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${theme.primary};
      margin-bottom: 8px;
    }
    .bank-row      { display: flex; gap: 6px; font-size: 11px; margin-bottom: 3px; }
    .bank-key      { color: #6B7280; min-width: 80px; }
    .bank-val      { font-weight: 600; color: #111827; }
    .words-block {
      margin-top: 10px;
      border-left: 3px solid ${theme.secondary};
      padding: 8px 11px;
      background: white;
      border-radius: 0 6px 6px 0;
    }
    .words-label   { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #9CA3AF; }
    .words-text    { font-size: 11px; font-weight: 700; color: ${theme.primary}; margin-top: 2px; }

    /* Totals table */
    table.totals     { width: 100%; }
    table.totals td  { padding: 5px 10px; font-size: 11px; }
    .t-lbl           { color: #6B7280; text-align: right; }
    .t-val           { font-weight: 600; text-align: right; }
    .t-grand         { background: ${theme.primary}; border-radius: 6px; }
    .t-grand td      { color: white; font-size: 14px; font-weight: 800; padding: 10px 10px; }

    /* ── SIGN FOOTER ── */
    .sign-footer {
      display: flex;
      justify-content: space-between;
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid #E2E8F0;
    }
    .notes-text    { font-size: 10px; color: #6B7280; line-height: 1.7; max-width: 60%; }
    .sign-box      { text-align: right; }
    .sign-line     {
      border-top: 1px solid #9CA3AF;
      margin-top: 38px;
      padding-top: 6px;
      font-size: 10px;
      color: #6B7280;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div class="header">

    <!-- Left: logo + company info -->
    <div class="h-left">
      ${logo}
      <div class="h-left-text">
        <div class="co-name">${company?.name || 'Your Company'}</div>
        <div class="co-addr">${company?.address || ''}</div>
        ${company?.gstin ? `<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>` : ''}
      </div>
    </div>

    <!-- Right: coloured invoice-number panel -->
    <div class="h-right">
      <div class="inv-type-pill">Tax Invoice</div>
      <div class="inv-no">${inv.invoice_no || '—'}</div>
      <div class="inv-date-line">
        Date&nbsp;${inv.invoice_date || ''}
        &nbsp;·&nbsp;
        Due&nbsp;${inv.due_date || ''}
      </div>
    </div>

  </div><!-- /header -->

  <!-- ── PARTY DETAILS ── -->
  <div class="party-grid">

    <div class="party-box">
      <h4>Bill To</h4>
      <div class="p-name">${inv.client_name || '—'}</div>
      <p>${inv.client_address || ''}</p>
      ${inv.client_email  ? `<p>✉ ${inv.client_email}</p>`  : ''}
      ${inv.client_phone  ? `<p>📞 ${inv.client_phone}</p>` : ''}
      ${inv.client_gstin  ? `<span class="gstin-tag">GSTIN&nbsp;${inv.client_gstin}</span>` : ''}
    </div>

    <div class="party-box">
      <h4>Invoice Details</h4>
      <p><strong>Payment Terms:</strong>&nbsp;${inv.payment_terms || 'Due on receipt'}</p>
      ${inv.reference_no ? `<p><strong>Ref / PO:</strong>&nbsp;${inv.reference_no}</p>` : ''}
      <p><strong>Supply Type:</strong>&nbsp;${isInter ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}</p>
      <p><strong>State of Supply:</strong>&nbsp;${inv.client_state || '—'}</p>
    </div>

  </div><!-- /party-grid -->

  <!-- ── ITEMS TABLE ── -->
  <table class="items">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="r">Qty</th>
        <th class="r">Unit</th>
        <th class="r">Rate&nbsp;(₹)</th>
        <th class="r">Disc&nbsp;%</th>
        <th class="r">Taxable&nbsp;(₹)</th>
        <th class="r">GST&nbsp;%</th>
        ${isInter
          ? '<th class="r">IGST&nbsp;(₹)</th>'
          : '<th class="r">CGST&nbsp;(₹)</th><th class="r">SGST&nbsp;(₹)</th>'}
        <th class="r">Total&nbsp;(₹)</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it, i) => `
      <tr>
        <td style="color:#9CA3AF">${i + 1}</td>
        <td class="b">${it.description || ''}</td>
        <td>${it.hsn_sac || ''}</td>
        <td class="r">${it.quantity || 0}</td>
        <td class="r">${it.unit || ''}</td>
        <td class="r">${fmtN(it.unit_price)}</td>
        <td class="r">${it.discount_pct || 0}%</td>
        <td class="r">${fmtN(it.taxable_value)}</td>
        <td class="r">${it.gst_rate || 0}%</td>
        ${isInter
          ? `<td class="r">${fmtN(it.igst_amount)}</td>`
          : `<td class="r">${fmtN(it.cgst_amount)}</td>
             <td class="r">${fmtN(it.sgst_amount)}</td>`}
        <td class="r b">${fmtN(it.total_amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- ── TOTALS FOOTER ── -->
  <div class="footer-grid">

    <!-- Left: bank + amount-in-words -->
    <div>
      ${company?.bank_name ? `
      <div class="bank-block">
        <h4>Bank Details</h4>
        ${company.bank_name    ? `<div class="bank-row"><span class="bank-key">Bank</span><span class="bank-val">${company.bank_name}</span></div>` : ''}
        ${company.bank_account ? `<div class="bank-row"><span class="bank-key">Account&nbsp;No.</span><span class="bank-val">${company.bank_account}</span></div>` : ''}
        ${company.bank_ifsc    ? `<div class="bank-row"><span class="bank-key">IFSC</span><span class="bank-val">${company.bank_ifsc}</span></div>` : ''}
        ${company.upi_id       ? `<div class="bank-row"><span class="bank-key">UPI</span><span class="bank-val">${company.upi_id}</span></div>` : ''}
      </div>` : ''}
      <div class="words-block" style="margin-top:${company?.bank_name ? '10px' : '0'}">
        <div class="words-label">Amount in Words</div>
        <div class="words-text">${amountToWords(inv.grand_total || 0)}</div>
      </div>
    </div>

    <!-- Right: numeric totals -->
    <div>
      <table class="totals">
        <tr><td class="t-lbl">Subtotal</td><td class="t-val">${fmtC(inv.subtotal)}</td></tr>
        ${(inv.total_discount || 0) > 0
          ? `<tr><td class="t-lbl">Discount</td><td class="t-val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`
          : ''}
        <tr><td class="t-lbl">Taxable Value</td><td class="t-val">${fmtC(inv.total_taxable)}</td></tr>
        ${isInter
          ? `<tr><td class="t-lbl">IGST</td><td class="t-val">${fmtC(inv.total_igst)}</td></tr>`
          : `<tr><td class="t-lbl">CGST</td><td class="t-val">${fmtC(inv.total_cgst)}</td></tr>
             <tr><td class="t-lbl">SGST / UTGST</td><td class="t-val">${fmtC(inv.total_sgst)}</td></tr>`}
        ${(inv.shipping_charges || 0) > 0
          ? `<tr><td class="t-lbl">Shipping</td><td class="t-val">${fmtC(inv.shipping_charges)}</td></tr>`
          : ''}
        <tr class="t-grand">
          <td>Grand Total</td>
          <td style="text-align:right">${fmtC(inv.grand_total)}</td>
        </tr>
        ${(inv.amount_paid || 0) > 0
          ? `<tr><td class="t-lbl" style="color:#059669">Amount Paid</td><td class="t-val" style="color:#059669">−${fmtC(inv.amount_paid)}</td></tr>`
          : ''}
        ${(inv.amount_due || 0) > 0
          ? `<tr><td class="t-lbl" style="color:#DC2626;font-weight:700">Balance Due</td><td class="t-val" style="color:#DC2626;font-weight:800">${fmtC(inv.amount_due)}</td></tr>`
          : ''}
      </table>
    </div>

  </div><!-- /footer-grid -->

  <!-- ── SIGNATURE FOOTER ── -->
  <div class="sign-footer">
    <div class="notes-text">
      ${inv.notes            ? `<strong>Notes:</strong> ${inv.notes}<br>`                      : ''}
      ${inv.terms_conditions ? `<strong>Terms:</strong> ${inv.terms_conditions}`               : ''}
      ${!inv.notes && !inv.terms_conditions ? '<em>Thank you for your business!</em>' : ''}
    </div>
    <div class="sign-box">
      <div style="font-size:10px;color:#9CA3AF">For&nbsp;${company?.name || 'Your Company'}</div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>

</div><!-- /page -->
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7.  TEMPLATE 2 — BOLD ARC
//     Inspired by Freepik's curved / scalloped top-banner invoices.
//     Full-width coloured hero with SVG arc clip at the bottom.
//     Centred circular logo badge + company name inside the hero.
//     White body with three info cards below the arc.
// ═══════════════════════════════════════════════════════════════════════════════

function tplArc(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items   = inv.items || [];

  /* Circular logo sits on the coloured hero */
  const logo = getLogoHTML(company, theme, 60, 'circle', 'on-color');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${inv.invoice_no || 'Invoice'}</title>
  <style>
    ${BASE_CSS}

    .page { max-width: 210mm; margin: 0 auto; overflow: hidden; }

    /* ── HERO ── */
    .hero {
      background: ${theme.primary};
      padding: 26px 30px 70px;
      position: relative;
      overflow: hidden;
    }
    /* Decorative blobs */
    .hero::before {
      content: '';
      position: absolute;
      top: -60px; right: -60px;
      width: 200px; height: 200px;
      background: rgba(255,255,255,0.06);
      border-radius: 50%;
    }
    .hero::after {
      content: '';
      position: absolute;
      bottom: 10px; left: -40px;
      width: 140px; height: 140px;
      background: ${theme.secondary};
      border-radius: 50%;
      opacity: 0.25;
    }
    .hero-inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: relative;
    }

    /* Logo + company (left) */
    .hero-co {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .hero-co-text {}
    .hero-co-name {
      font-size: 22px;
      font-weight: 900;
      color: white;
      letter-spacing: -0.3px;
    }
    .hero-co-addr {
      font-size: 10px;
      color: rgba(255,255,255,0.6);
      margin-top: 3px;
      line-height: 1.6;
    }
    .hero-co-gstin {
      display: inline-block;
      margin-top: 5px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      color: rgba(255,255,255,0.9);
      font-size: 9px;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 10px;
    }

    /* Invoice number (right) */
    .hero-inv {
      text-align: right;
      position: relative;
    }
    .hero-inv-pill {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1.5px solid rgba(255,255,255,0.3);
      color: white;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 20px;
      margin-bottom: 8px;
    }
    .hero-inv-no {
      font-size: 30px;
      font-weight: 900;
      color: white;
      line-height: 1;
    }
    .hero-inv-dates {
      font-size: 10.5px;
      color: rgba(255,255,255,0.6);
      margin-top: 6px;
    }

    /* SVG arc divider rendered inline */
    .arc-svg { display: block; margin-top: -2px; }

    /* ── BODY ── */
    .body { padding: 0 26px 22px; margin-top: -24px; }

    /* Three info cards */
    .info-cards {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .info-card {
      background: white;
      border: 1px solid #E2E8F0;
      border-top: 3px solid ${theme.secondary};
      border-radius: 0 0 8px 8px;
      padding: 12px 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .info-card h4 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${theme.secondary};
      margin-bottom: 7px;
    }
    .info-card .ic-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 3px; }
    .info-card p        { font-size: 11px; color: #374151; line-height: 1.7; }
    .gstin-chip {
      display: inline-block;
      background: ${theme.primary};
      color: white;
      font-size: 8.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 3px;
      margin-top: 3px;
    }

    /* ── ITEMS TABLE ── */
    table.items thead tr         { background: ${theme.primary}; }
    table.items thead th         { color: white; padding: 9px 7px; font-size: 10px; font-weight: 700; text-align: left; }
    table.items thead th.r       { text-align: right; }
    table.items tbody tr:nth-child(even) { background: ${theme.light}; }
    table.items tbody td         { padding: 8px 7px; font-size: 11px; border-bottom: 1px solid #F1F5F9; color: #374151; vertical-align: top; }
    table.items tbody td.r       { text-align: right; }
    table.items tbody td.b       { font-weight: 700; color: #111827; }

    /* ── SUMMARY ── */
    .summary {
      display: grid;
      grid-template-columns: 1fr 240px;
      gap: 18px;
      margin-top: 18px;
    }
    .sum-left { font-size: 10.5px; color: #6B7280; }
    .sum-words {
      font-style: italic;
      color: ${theme.primary};
      font-weight: 600;
      font-size: 11px;
      margin-bottom: 10px;
    }
    table.totals     { width: 100%; }
    table.totals td  { padding: 5px 10px; font-size: 11px; }
    .t-lbl           { color: #9CA3AF; text-align: right; }
    .t-val           { font-weight: 600; text-align: right; }
    .grand-pill {
      background: linear-gradient(135deg, ${theme.primary}, ${theme.secondary});
      color: white;
      border-radius: 8px;
      padding: 13px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }
    .grand-pill .gl  { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; }
    .grand-pill .gv  { font-size: 22px; font-weight: 900; }

    /* ── SIGN FOOTER ── */
    .sign-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 22px;
      padding-top: 14px;
      border-top: 1px solid #F1F5F9;
    }
    .notes-text { font-size: 10px; color: #6B7280; line-height: 1.7; max-width: 60%; }
    .sign-box   { text-align: right; }
    .sign-line  {
      border-top: 1px solid #9CA3AF;
      margin-top: 38px;
      padding-top: 6px;
      font-size: 10px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── HERO ── -->
  <div class="hero">
    <div class="hero-inner">

      <!-- Company + logo -->
      <div class="hero-co">
        ${logo}
        <div class="hero-co-text">
          <div class="hero-co-name">${company?.name || 'Your Company'}</div>
          <div class="hero-co-addr">${company?.address || ''}</div>
          ${company?.gstin ? `<span class="hero-co-gstin">GSTIN&nbsp;${company.gstin}</span>` : ''}
        </div>
      </div>

      <!-- Invoice number -->
      <div class="hero-inv">
        <div class="hero-inv-pill">Tax Invoice</div>
        <div class="hero-inv-no">${inv.invoice_no || '—'}</div>
        <div class="hero-inv-dates">
          Issued&nbsp;${inv.invoice_date || ''}<br>Due&nbsp;${inv.due_date || ''}
        </div>
      </div>

    </div>
  </div><!-- /hero -->

  <!-- Arc SVG divider -->
  <svg class="arc-svg"
       viewBox="0 0 794 56"
       preserveAspectRatio="none"
       height="50"
       xmlns="http://www.w3.org/2000/svg">
    <path d="M0,0 Q397,56 794,0 L794,0 L0,0 Z" fill="${theme.primary}" />
  </svg>

  <!-- ── BODY ── -->
  <div class="body">

    <!-- Three info cards -->
    <div class="info-cards">

      <div class="info-card">
        <h4>Billed To</h4>
        <div class="ic-name">${inv.client_name || '—'}</div>
        <p>${inv.client_address || ''}</p>
        ${inv.client_gstin ? `<span class="gstin-chip">GSTIN&nbsp;${inv.client_gstin}</span>` : ''}
      </div>

      <div class="info-card">
        <h4>Contact</h4>
        <p>${inv.client_email || '—'}</p>
        <p>${inv.client_phone || ''}</p>
      </div>

      <div class="info-card">
        <h4>Invoice Info</h4>
        <p><strong>Terms:</strong>&nbsp;${inv.payment_terms || 'Due on receipt'}</p>
        <p><strong>Tax:</strong>&nbsp;${isInter ? 'IGST (Interstate)' : 'CGST + SGST'}</p>
        ${inv.reference_no ? `<p><strong>Ref:</strong>&nbsp;${inv.reference_no}</p>` : ''}
      </div>

    </div><!-- /info-cards -->

    <!-- Items table -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Description</th>
          <th>HSN/SAC</th>
          <th class="r">Qty</th>
          <th class="r">Rate&nbsp;(₹)</th>
          <th class="r">Disc&nbsp;%</th>
          <th class="r">Taxable&nbsp;(₹)</th>
          ${isInter
            ? '<th class="r">IGST&nbsp;(₹)</th>'
            : '<th class="r">CGST&nbsp;(₹)</th><th class="r">SGST&nbsp;(₹)</th>'}
          <th class="r">Total&nbsp;(₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, i) => `
        <tr>
          <td style="color:#9CA3AF">${i + 1}</td>
          <td class="b">${it.description || ''}</td>
          <td>${it.hsn_sac || ''}</td>
          <td class="r">${it.quantity || 0}&nbsp;${it.unit || ''}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${it.discount_pct || 0}%</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter
            ? `<td class="r">${fmtN(it.igst_amount)}</td>`
            : `<td class="r">${fmtN(it.cgst_amount)}</td>
               <td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Summary -->
    <div class="summary">

      <div class="sum-left">
        <div class="sum-words">${amountToWords(inv.grand_total || 0)}</div>
        ${company?.bank_name
          ? `<p><strong>Bank:</strong>&nbsp;${company.bank_name}
             ${company.bank_account ? `&nbsp;|&nbsp;<strong>A/c:</strong>&nbsp;${company.bank_account}` : ''}
             ${company.bank_ifsc    ? `&nbsp;|&nbsp;<strong>IFSC:</strong>&nbsp;${company.bank_ifsc}` : ''}</p>`
          : ''}
        ${inv.notes ? `<p style="margin-top:8px"><strong>Notes:</strong>&nbsp;${inv.notes}</p>` : ''}
        ${inv.terms_conditions ? `<p style="margin-top:4px"><strong>T&amp;C:</strong>&nbsp;${inv.terms_conditions}</p>` : ''}
      </div>

      <div>
        <table class="totals">
          <tr><td class="t-lbl">Taxable Value</td><td class="t-val">${fmtC(inv.total_taxable)}</td></tr>
          ${isInter
            ? `<tr><td class="t-lbl">IGST</td><td class="t-val">${fmtC(inv.total_igst)}</td></tr>`
            : `<tr><td class="t-lbl">CGST</td><td class="t-val">${fmtC(inv.total_cgst)}</td></tr>
               <tr><td class="t-lbl">SGST</td><td class="t-val">${fmtC(inv.total_sgst)}</td></tr>`}
          ${(inv.total_discount || 0) > 0
            ? `<tr><td class="t-lbl" style="color:#DC2626">Discount</td><td class="t-val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`
            : ''}
        </table>
        <div class="grand-pill">
          <div class="gl">Grand Total</div>
          <div class="gv">${fmtC(inv.grand_total)}</div>
        </div>
        ${(inv.amount_due || 0) > 0
          ? `<div style="display:flex;justify-content:space-between;padding:6px 8px;margin-top:5px;
                         background:#FEF2F2;border-radius:6px;font-size:11px;font-weight:700;color:#DC2626">
               <span>Balance Due</span><span>${fmtC(inv.amount_due)}</span>
             </div>`
          : ''}
      </div>

    </div><!-- /summary -->

    <!-- Sign footer -->
    <div class="sign-footer">
      <div class="notes-text">
        ${!inv.notes && !inv.terms_conditions ? '<em>Thank you for your business!</em>' : ''}
      </div>
      <div class="sign-box">
        <div style="font-size:10px;color:#9CA3AF">For&nbsp;${company?.name || ''}</div>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>

  </div><!-- /body -->
</div><!-- /page -->
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8.  TEMPLATE 3 — MINIMAL CORNER
//     Inspired by Freepik's ultra-clean minimalist invoice designs.
//     Plain white page; logo badge anchored top-right.
//     A single thin colour underline separates header from body.
//     All typography is left-aligned, generous spacing, no coloured fills
//     except the grand-total row and the logo badge itself.
// ═══════════════════════════════════════════════════════════════════════════════

function tplMinimal(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items   = inv.items || [];

  /* Logo sits on white background → uses coloured-fill style */
  const logo = getLogoHTML(company, theme, 54, 'rounded', 'on-white');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${inv.invoice_no || 'Invoice'}</title>
  <style>
    ${BASE_CSS}

    .page { max-width: 210mm; margin: 0 auto; padding: 14mm 18mm; }

    /* ── HEADER ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
    }

    /* Company block (left) */
    .co-block {}
    .co-name {
      font-size: 26px;
      font-weight: 900;
      color: ${theme.primary};
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }
    .co-detail {
      font-size: 10px;
      color: #9CA3AF;
      line-height: 1.7;
    }
    .co-gstin {
      font-size: 9.5px;
      font-weight: 700;
      color: ${theme.primary};
      margin-top: 4px;
    }

    /* Invoice-number + logo (right) */
    .inv-block {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    ${logo ? '' /* logo inlined */: ''}
    .inv-type-lbl {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      color: #9CA3AF;
    }
    .inv-no {
      font-size: 28px;
      font-weight: 900;
      color: ${theme.primary};
      line-height: 1;
    }
    .inv-dates {
      font-size: 11px;
      color: #9CA3AF;
      margin-top: 4px;
    }

    /* Thin accent underline */
    .accent-line {
      height: 3px;
      background: linear-gradient(90deg, ${theme.primary}, ${theme.secondary});
      border-radius: 2px;
      margin: 20px 0 22px;
    }

    /* ── PARTY ── */
    .party-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #F1F5F9;
      margin-bottom: 22px;
    }
    .pb h4 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: ${theme.secondary};
      margin-bottom: 8px;
    }
    .pb .p-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .pb p       { font-size: 11px; color: #374151; line-height: 1.7; }
    .pb-chip {
      display: inline-block;
      background: ${theme.light};
      color: ${theme.primary};
      border: 1px solid ${theme.accent};
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: 4px;
    }

    /* ── ITEMS TABLE ── */
    table.items thead th {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #9CA3AF;
      padding: 0 8px 10px;
      text-align: left;
      border-bottom: 2px solid ${theme.primary};
    }
    table.items thead th.r       { text-align: right; }
    table.items tbody tr         { transition: background 0.1s; }
    table.items tbody tr:hover   { background: ${theme.light}; }
    table.items tbody td         { padding: 10px 8px; font-size: 11px; color: #374151; border-bottom: 1px solid #F8FAFC; vertical-align: top; }
    table.items tbody td.r       { text-align: right; }
    table.items tbody td.b       { font-weight: 700; color: #111827; }

    /* ── BOTTOM ── */
    .bottom {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 24px;
      margin-top: 22px;
    }
    .sum-words {
      font-size: 11px;
      font-style: italic;
      color: ${theme.primary};
      font-weight: 600;
      margin-bottom: 10px;
    }
    .bank-info { font-size: 10px; color: #6B7280; line-height: 1.8; }
    table.totals     { width: 100%; }
    table.totals td  { padding: 5px 8px; font-size: 11px; }
    .t-lbl           { color: #9CA3AF; text-align: right; }
    .t-val           { font-weight: 600; text-align: right; }
    .t-grand         {
      background: ${theme.primary};
      border-radius: 6px;
    }
    .t-grand td      { color: white; font-size: 14px; font-weight: 800; padding: 10px 10px; }

    /* ── SIGN FOOTER ── */
    .sign-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #F1F5F9;
    }
    .notes-text { font-size: 10px; color: #9CA3AF; max-width: 60%; line-height: 1.7; }
    .sign-box   { text-align: right; }
    .sign-line  {
      border-top: 1px solid #9CA3AF;
      margin-top: 42px;
      padding-top: 6px;
      font-size: 10px;
      color: #9CA3AF;
    }
    .bottom-accent {
      height: 2px;
      background: linear-gradient(90deg, ${theme.secondary}, ${theme.primary});
      border-radius: 2px;
      margin-top: 26px;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── HEADER ── -->
  <div class="header">

    <!-- Company block -->
    <div class="co-block">
      <div class="co-name">${company?.name || 'Your Company'}</div>
      <div class="co-detail">${company?.address || ''}</div>
      ${company?.gstin ? `<div class="co-gstin">GSTIN&nbsp;${company.gstin}</div>` : ''}
    </div>

    <!-- Logo + invoice number -->
    <div class="inv-block">
      ${logo}
      <div>
        <div class="inv-type-lbl">Invoice Number</div>
        <div class="inv-no">${inv.invoice_no || '—'}</div>
        <div class="inv-dates">
          ${inv.invoice_date || ''}&nbsp;→&nbsp;Due&nbsp;${inv.due_date || ''}
        </div>
      </div>
    </div>

  </div><!-- /header -->

  <!-- Accent underline -->
  <div class="accent-line"></div>

  <!-- ── PARTY ROW ── -->
  <div class="party-row">

    <div class="pb">
      <h4>Billed To</h4>
      <div class="p-name">${inv.client_name || '—'}</div>
      <p>${inv.client_address || ''}</p>
      ${inv.client_gstin ? `<span class="pb-chip">GSTIN&nbsp;${inv.client_gstin}</span>` : ''}
    </div>

    <div class="pb">
      <h4>Contact</h4>
      <p>${inv.client_email || '—'}</p>
      <p>${inv.client_phone || ''}</p>
    </div>

    <div class="pb">
      <h4>Details</h4>
      <p><strong>Terms:</strong>&nbsp;${inv.payment_terms || 'Due on receipt'}</p>
      <p><strong>Tax:</strong>&nbsp;${isInter ? 'IGST' : 'CGST + SGST'}</p>
      ${inv.reference_no ? `<p><strong>Ref:</strong>&nbsp;${inv.reference_no}</p>` : ''}
      <p><strong>Type:</strong>&nbsp;Tax Invoice</p>
    </div>

  </div><!-- /party-row -->

  <!-- ── ITEMS TABLE ── -->
  <table class="items">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="r">Qty</th>
        <th class="r">Rate&nbsp;(₹)</th>
        <th class="r">Disc&nbsp;%</th>
        <th class="r">Taxable&nbsp;(₹)</th>
        ${isInter
          ? '<th class="r">IGST&nbsp;(₹)</th>'
          : '<th class="r">CGST&nbsp;(₹)</th><th class="r">SGST&nbsp;(₹)</th>'}
        <th class="r">Total&nbsp;(₹)</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it, i) => `
      <tr>
        <td style="color:#9CA3AF">${i + 1}</td>
        <td class="b">${it.description || ''}</td>
        <td style="color:#9CA3AF">${it.hsn_sac || ''}</td>
        <td class="r">${it.quantity || 0}&nbsp;${it.unit || ''}</td>
        <td class="r">${fmtN(it.unit_price)}</td>
        <td class="r">${it.discount_pct || 0}%</td>
        <td class="r">${fmtN(it.taxable_value)}</td>
        ${isInter
          ? `<td class="r">${fmtN(it.igst_amount)}</td>`
          : `<td class="r">${fmtN(it.cgst_amount)}</td>
             <td class="r">${fmtN(it.sgst_amount)}</td>`}
        <td class="r b">${fmtN(it.total_amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- ── BOTTOM SECTION ── -->
  <div class="bottom">

    <div>
      <div class="sum-words">${amountToWords(inv.grand_total || 0)}</div>
      <div class="bank-info">
        ${company?.bank_name
          ? `<strong>Bank:</strong>&nbsp;${company.bank_name}
             ${company.bank_account ? `&nbsp;|&nbsp;<strong>A/c:</strong>&nbsp;${company.bank_account}` : ''}
             ${company.bank_ifsc    ? `&nbsp;|&nbsp;<strong>IFSC:</strong>&nbsp;${company.bank_ifsc}` : ''}
             ${company.upi_id       ? `<br><strong>UPI:</strong>&nbsp;${company.upi_id}` : ''}`
          : ''}
      </div>
      ${inv.notes ? `<p style="font-size:10px;color:#6B7280;margin-top:8px"><strong>Notes:</strong>&nbsp;${inv.notes}</p>` : ''}
      ${inv.terms_conditions ? `<p style="font-size:10px;color:#6B7280;margin-top:4px"><strong>T&amp;C:</strong>&nbsp;${inv.terms_conditions}</p>` : ''}
    </div>

    <div>
      <table class="totals">
        <tr><td class="t-lbl">Subtotal</td><td class="t-val">${fmtC(inv.subtotal)}</td></tr>
        ${(inv.total_discount || 0) > 0
          ? `<tr><td class="t-lbl">Discount</td><td class="t-val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`
          : ''}
        <tr><td class="t-lbl">Taxable Value</td><td class="t-val">${fmtC(inv.total_taxable)}</td></tr>
        ${isInter
          ? `<tr><td class="t-lbl">IGST</td><td class="t-val">${fmtC(inv.total_igst)}</td></tr>`
          : `<tr><td class="t-lbl">CGST</td><td class="t-val">${fmtC(inv.total_cgst)}</td></tr>
             <tr><td class="t-lbl">SGST / UTGST</td><td class="t-val">${fmtC(inv.total_sgst)}</td></tr>`}
        <tr class="t-grand">
          <td>Grand Total</td>
          <td style="text-align:right">${fmtC(inv.grand_total)}</td>
        </tr>
        ${(inv.amount_paid || 0) > 0
          ? `<tr><td class="t-lbl" style="color:#059669">Paid</td><td class="t-val" style="color:#059669">−${fmtC(inv.amount_paid)}</td></tr>`
          : ''}
        ${(inv.amount_due || 0) > 0
          ? `<tr><td class="t-lbl" style="color:#DC2626;font-weight:700">Balance Due</td>
             <td class="t-val" style="color:#DC2626;font-weight:800">${fmtC(inv.amount_due)}</td></tr>`
          : ''}
      </table>
    </div>

  </div><!-- /bottom -->

  <!-- Sign footer -->
  <div class="sign-footer">
    <div class="notes-text">
      ${!inv.notes && !inv.terms_conditions ? '<em>Thank you for your business!</em>' : ''}
    </div>
    <div class="sign-box">
      <div style="font-size:10px;color:#9CA3AF">For&nbsp;${company?.name || ''}</div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>

  <div class="bottom-accent"></div>

</div><!-- /page -->
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9.  TEMPLATE 4 — SPLIT PANEL
//     Inspired by Freepik's sidebar / split-column invoice designs.
//     Left panel (coloured): logo stacked at top, then client info + bank details.
//     Right panel (white): invoice number, items table, totals.
// ═══════════════════════════════════════════════════════════════════════════════

function tplSplitPanel(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items   = inv.items || [];

  /* Logo sits on the coloured sidebar */
  const logo = getLogoHTML(company, theme, 58, 'rounded', 'on-color');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${inv.invoice_no || 'Invoice'}</title>
  <style>
    ${BASE_CSS}

    .page {
      max-width: 210mm;
      margin: 0 auto;
      min-height: 297mm;
      display: flex;
    }

    /* ── LEFT SIDEBAR ── */
    .sidebar {
      width: 66mm;
      flex-shrink: 0;
      background: ${theme.primary};
      color: white;
      padding: 24px 18px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }
    /* decorative arc in sidebar footer */
    .sidebar::after {
      content: '';
      position: absolute;
      bottom: -50px;
      right: -50px;
      width: 160px;
      height: 160px;
      background: ${theme.secondary};
      border-radius: 50%;
      opacity: 0.2;
    }

    .sb-logo-wrap  { margin-bottom: 14px; }
    .sb-co-name    { font-size: 16px; font-weight: 900; line-height: 1.2; margin-bottom: 4px; }
    .sb-co-addr    { font-size: 9.5px; opacity: 0.6; line-height: 1.7; }
    .sb-gstin {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      font-size: 8.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 3px;
      margin-top: 5px;
    }
    .sb-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.2);
      margin: 16px 0;
    }
    .sb-section       { margin-bottom: 18px; position: relative; }
    .sb-section h4    {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2px;
      opacity: 0.5;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      padding-bottom: 5px;
    }
    .sb-section p     { font-size: 10px; opacity: 0.85; line-height: 1.75; }
    .sb-section .n    { font-size: 11.5px; font-weight: 700; opacity: 1; }

    /* ── RIGHT MAIN PANEL ── */
    .main {
      flex: 1;
      padding: 22px 20px;
      background: white;
    }

    /* Invoice number top strip */
    .main-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      padding-bottom: 16px;
      border-bottom: 2px solid ${theme.light};
    }
    .inv-type-lbl {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      color: ${theme.secondary};
      margin-bottom: 4px;
    }
    .inv-no {
      font-size: 26px;
      font-weight: 900;
      color: ${theme.primary};
      line-height: 1;
    }
    .meta-chips {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      margin-top: 2px;
    }
    .meta-chip {
      background: ${theme.light};
      border: 1px solid ${theme.accent};
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 10.5px;
      color: ${theme.primary};
    }
    .meta-chip .mc-l { font-size: 8px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 1px; }
    .meta-chip .mc-v { font-size: 11px; font-weight: 700; margin-top: 1px; }

    /* ── ITEMS TABLE ── */
    table.items thead tr         { background: ${theme.primary}; }
    table.items thead th         { color: white; padding: 8px 6px; font-size: 9.5px; font-weight: 700; text-align: left; }
    table.items thead th.r       { text-align: right; }
    table.items tbody tr:nth-child(even) { background: ${theme.light}; }
    table.items tbody td         { padding: 8px 6px; font-size: 10.5px; border-bottom: 1px solid #F1F5F9; color: #374151; vertical-align: top; }
    table.items tbody td.r       { text-align: right; }
    table.items tbody td.b       { font-weight: 700; color: #111827; }

    /* ── TOTALS BOX ── */
    .totals-box {
      background: ${theme.primary};
      color: white;
      border-radius: 8px;
      padding: 14px;
      margin-top: 14px;
    }
    .tb-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 3px 0;
      opacity: 0.8;
    }
    .tb-total {
      display: flex;
      justify-content: space-between;
      font-size: 17px;
      font-weight: 900;
      padding-top: 10px;
      margin-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.3);
    }
    .words-txt {
      font-size: 9.5px;
      opacity: 0.6;
      font-style: italic;
      margin-top: 5px;
    }

    /* ── SIGN FOOTER ── */
    .sign-footer {
      display: flex;
      justify-content: flex-end;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #F1F5F9;
    }
    .sign-box   { text-align: right; }
    .sign-line  {
      border-top: 1px solid #9CA3AF;
      margin-top: 40px;
      padding-top: 6px;
      font-size: 10px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── LEFT SIDEBAR ── -->
  <div class="sidebar">

    <!-- Logo -->
    <div class="sb-logo-wrap">${logo}</div>

    <!-- Company name -->
    <div class="sb-co-name">${company?.name || 'Your Company'}</div>
    <div class="sb-co-addr">${company?.address || ''}</div>
    ${company?.gstin ? `<span class="sb-gstin">GSTIN&nbsp;${company.gstin}</span>` : ''}

    <hr class="sb-divider" />

    <!-- Client -->
    <div class="sb-section">
      <h4>Invoice To</h4>
      <p class="n">${inv.client_name || '—'}</p>
      <p>${inv.client_address || ''}</p>
      ${inv.client_email ? `<p>${inv.client_email}</p>` : ''}
      ${inv.client_phone ? `<p>${inv.client_phone}</p>` : ''}
      ${inv.client_gstin ? `<p style="margin-top:5px;font-size:9px;font-weight:700;opacity:1">GSTIN&nbsp;${inv.client_gstin}</p>` : ''}
    </div>

    <!-- Payment -->
    <div class="sb-section">
      <h4>Payment</h4>
      <p>${inv.payment_terms || 'Due on receipt'}</p>
      <p>Tax:&nbsp;${isInter ? 'IGST' : 'CGST + SGST'}</p>
      ${inv.reference_no ? `<p>Ref:&nbsp;${inv.reference_no}</p>` : ''}
    </div>

    <!-- Bank -->
    ${company?.bank_name ? `
    <div class="sb-section">
      <h4>Bank Details</h4>
      <p>${company.bank_name}</p>
      ${company.bank_account ? `<p>A/c:&nbsp;${company.bank_account}</p>` : ''}
      ${company.bank_ifsc    ? `<p>IFSC:&nbsp;${company.bank_ifsc}</p>`    : ''}
      ${company.upi_id       ? `<p>UPI:&nbsp;${company.upi_id}</p>`        : ''}
    </div>` : ''}

    <!-- Notes -->
    ${inv.notes || inv.terms_conditions ? `
    <div class="sb-section">
      <h4>Notes</h4>
      <p>${inv.notes || ''}&nbsp;${inv.terms_conditions || ''}</p>
    </div>` : ''}

  </div><!-- /sidebar -->

  <!-- ── MAIN RIGHT PANEL ── -->
  <div class="main">

    <div class="main-top">
      <div>
        <div class="inv-type-lbl">Tax Invoice</div>
        <div class="inv-no">${inv.invoice_no || '—'}</div>
      </div>
      <div class="meta-chips">
        <div class="meta-chip">
          <div class="mc-l">Invoice Date</div>
          <div class="mc-v">${inv.invoice_date || ''}</div>
        </div>
        <div class="meta-chip">
          <div class="mc-l">Due Date</div>
          <div class="mc-v">${inv.due_date || ''}</div>
        </div>
      </div>
    </div>

    <!-- Items -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th>Description</th>
          <th>HSN/SAC</th>
          <th class="r">Qty</th>
          <th class="r">Rate&nbsp;(₹)</th>
          <th class="r">Disc&nbsp;%</th>
          <th class="r">Taxable&nbsp;(₹)</th>
          ${isInter
            ? '<th class="r">IGST&nbsp;(₹)</th>'
            : '<th class="r">CGST&nbsp;(₹)</th><th class="r">SGST&nbsp;(₹)</th>'}
          <th class="r">Total&nbsp;(₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, i) => `
        <tr>
          <td style="color:#9CA3AF">${i + 1}</td>
          <td class="b">${it.description || ''}</td>
          <td style="color:#9CA3AF">${it.hsn_sac || ''}</td>
          <td class="r">${it.quantity || 0}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${it.discount_pct || 0}%</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter
            ? `<td class="r">${fmtN(it.igst_amount)}</td>`
            : `<td class="r">${fmtN(it.cgst_amount)}</td>
               <td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end">
      <div style="width:210px">
        <div class="totals-box">
          <div class="tb-row"><span>Taxable Value</span><span>${fmtC(inv.total_taxable)}</span></div>
          ${isInter
            ? `<div class="tb-row"><span>IGST</span><span>${fmtC(inv.total_igst)}</span></div>`
            : `<div class="tb-row"><span>CGST</span><span>${fmtC(inv.total_cgst)}</span></div>
               <div class="tb-row"><span>SGST</span><span>${fmtC(inv.total_sgst)}</span></div>`}
          ${(inv.total_discount || 0) > 0
            ? `<div class="tb-row"><span>Discount</span><span>−${fmtC(inv.total_discount)}</span></div>`
            : ''}
          <div class="tb-total">
            <span>Grand Total</span>
            <span>${fmtC(inv.grand_total)}</span>
          </div>
          <div class="words-txt">${amountToWords(inv.grand_total || 0)}</div>
        </div>
        ${(inv.amount_paid || 0) > 0
          ? `<div style="display:flex;justify-content:space-between;padding:5px 8px;font-size:11px">
               <span style="color:#059669">Amount Paid</span>
               <span style="color:#059669;font-weight:600">−${fmtC(inv.amount_paid)}</span>
             </div>`
          : ''}
        ${(inv.amount_due || 0) > 0
          ? `<div style="display:flex;justify-content:space-between;padding:5px 8px;
                         background:#FEF2F2;border-radius:5px;font-size:11px;font-weight:700;color:#DC2626">
               <span>Balance Due</span><span>${fmtC(inv.amount_due)}</span>
             </div>`
          : ''}
      </div>
    </div>

    <!-- Sign -->
    <div class="sign-footer">
      <div class="sign-box">
        <div style="font-size:9.5px;color:#9CA3AF">For&nbsp;${company?.name || ''}</div>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>

  </div><!-- /main -->
</div><!-- /page -->
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. TEMPLATE 5 — GRADIENT BANNER
//     Inspired by Freepik's modern startup / SaaS invoice designs.
//     Full-width gradient hero with a white "floating" circular logo badge
//     (white ring + coloured fill).  Three shadowed info cards sit below.
//     Items table and totals use a clean, airy layout.
// ═══════════════════════════════════════════════════════════════════════════════

function tplGradient(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items   = inv.items || [];

  /* The logo gets a white outer ring on the coloured banner */
  const logo = getLogoHTML(company, theme, 62, 'circle', 'on-color');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${inv.invoice_no || 'Invoice'}</title>
  <style>
    ${BASE_CSS}

    .page { max-width: 210mm; margin: 0 auto; overflow: hidden; }

    /* ── BANNER ── */
    .banner {
      background: linear-gradient(130deg, ${theme.primary} 0%, ${theme.secondary} 100%);
      padding: 26px 28px 44px;
      position: relative;
      overflow: hidden;
    }
    /* Decorative orbs */
    .banner::before {
      content: '';
      position: absolute;
      top: -70px; left: -40px;
      width: 220px; height: 220px;
      background: rgba(255,255,255,0.05);
      border-radius: 50%;
    }
    .banner::after {
      content: '';
      position: absolute;
      bottom: -30px; right: 60px;
      width: 160px; height: 160px;
      background: rgba(255,255,255,0.07);
      border-radius: 50%;
    }

    .banner-inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: relative;
    }

    /* Left: logo ring + company */
    .banner-co {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    /* White ring around the circular logo */
    .logo-ring {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      border: 2.5px solid rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .banner-co-name {
      font-size: 22px;
      font-weight: 900;
      color: white;
      letter-spacing: -0.3px;
    }
    .banner-co-addr  { font-size: 10px; color: rgba(255,255,255,0.65); margin-top: 4px; line-height: 1.6; }
    .banner-co-gstin {
      display: inline-block;
      margin-top: 5px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 10px;
    }

    /* Right: invoice number */
    .banner-inv { text-align: right; position: relative; }
    .banner-inv-pill {
      display: inline-block;
      background: rgba(255,255,255,0.18);
      border: 1.5px solid rgba(255,255,255,0.35);
      color: white;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 4px 14px;
      border-radius: 20px;
      margin-bottom: 8px;
    }
    .banner-inv-no {
      font-size: 30px;
      font-weight: 900;
      color: white;
      line-height: 1;
    }
    .banner-inv-dates {
      font-size: 10.5px;
      color: rgba(255,255,255,0.65);
      margin-top: 6px;
    }

    /* ── BODY ── */
    .body { padding: 0 26px 22px; margin-top: 0; }

    /* Three floating info cards (overlap the banner bottom) */
    .cards {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: -28px;
      margin-bottom: 22px;
    }
    .card {
      background: white;
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    }
    .card h4 {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${theme.secondary};
      margin-bottom: 7px;
    }
    .card .c-name { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 3px; }
    .card p       { font-size: 11px; color: #374151; line-height: 1.7; }
    .c-chip {
      display: inline-block;
      background: ${theme.light};
      color: ${theme.primary};
      border: 1px solid ${theme.accent};
      font-size: 8.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      margin-top: 4px;
    }

    /* ── ITEMS TABLE ── */
    table.items thead tr         { background: ${theme.primary}; }
    table.items thead th         { color: white; padding: 10px 7px; font-size: 10px; font-weight: 700; text-align: left; }
    table.items thead th.r       { text-align: right; }
    table.items tbody tr:nth-child(even) { background: ${theme.light}; }
    table.items tbody td         { padding: 9px 7px; font-size: 11px; border-bottom: 1px solid #F1F5F9; color: #374151; vertical-align: top; }
    table.items tbody td.r       { text-align: right; }
    table.items tbody td.b       { font-weight: 700; color: #111827; }

    /* ── SUMMARY ── */
    .summary {
      display: grid;
      grid-template-columns: 1fr 250px;
      gap: 20px;
      margin-top: 20px;
    }
    .sum-left-block { font-size: 10.5px; color: #6B7280; }
    .sum-words {
      font-style: italic;
      font-weight: 600;
      color: ${theme.primary};
      font-size: 11px;
      margin-bottom: 10px;
    }

    table.totals     { width: 100%; }
    table.totals td  { padding: 5px 8px; font-size: 11px; }
    .t-lbl           { color: #9CA3AF; text-align: right; }
    .t-val           { font-weight: 600; text-align: right; }
    .grand-card {
      background: linear-gradient(135deg, ${theme.primary}, ${theme.secondary});
      border-radius: 10px;
      padding: 13px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .gc-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.75); }
    .gc-value { font-size: 22px; font-weight: 900; color: white; }

    /* ── SIGN FOOTER ── */
    .sign-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid #F1F5F9;
    }
    .notes-text { font-size: 10px; color: #9CA3AF; max-width: 60%; line-height: 1.7; }
    .sign-box   { text-align: right; }
    .sign-line  {
      border-top: 1px solid #9CA3AF;
      margin-top: 40px;
      padding-top: 6px;
      font-size: 10px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ── GRADIENT BANNER ── -->
  <div class="banner">
    <div class="banner-inner">

      <!-- Logo ring + company -->
      <div class="banner-co">
        <div class="logo-ring">${logo}</div>
        <div>
          <div class="banner-co-name">${company?.name || 'Your Company'}</div>
          <div class="banner-co-addr">${company?.address || ''}</div>
          ${company?.gstin ? `<span class="banner-co-gstin">GSTIN&nbsp;${company.gstin}</span>` : ''}
        </div>
      </div>

      <!-- Invoice number -->
      <div class="banner-inv">
        <div class="banner-inv-pill">Tax Invoice</div>
        <div class="banner-inv-no">${inv.invoice_no || '—'}</div>
        <div class="banner-inv-dates">
          Issued&nbsp;${inv.invoice_date || ''}<br>Due&nbsp;${inv.due_date || ''}
        </div>
      </div>

    </div>
  </div><!-- /banner -->

  <!-- ── BODY ── -->
  <div class="body">

    <!-- Floating cards -->
    <div class="cards">

      <div class="card">
        <h4>Billed To</h4>
        <div class="c-name">${inv.client_name || '—'}</div>
        <p>${inv.client_address || ''}</p>
        ${inv.client_gstin ? `<span class="c-chip">GSTIN&nbsp;${inv.client_gstin}</span>` : ''}
      </div>

      <div class="card">
        <h4>Contact</h4>
        <p>${inv.client_email || '—'}</p>
        <p>${inv.client_phone || ''}</p>
        ${inv.client_state ? `<p><strong>State:</strong>&nbsp;${inv.client_state}</p>` : ''}
      </div>

      <div class="card">
        <h4>Invoice Info</h4>
        <p><strong>Terms:</strong>&nbsp;${inv.payment_terms || 'Due on receipt'}</p>
        <p><strong>Tax:</strong>&nbsp;${isInter ? 'IGST (Interstate)' : 'CGST + SGST'}</p>
        ${inv.reference_no ? `<p><strong>Ref:</strong>&nbsp;${inv.reference_no}</p>` : ''}
      </div>

    </div><!-- /cards -->

    <!-- Items table -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Description</th>
          <th>HSN/SAC</th>
          <th class="r">Qty</th>
          <th class="r">Rate&nbsp;(₹)</th>
          <th class="r">Disc&nbsp;%</th>
          <th class="r">Taxable&nbsp;(₹)</th>
          ${isInter
            ? '<th class="r">IGST&nbsp;(₹)</th>'
            : '<th class="r">CGST&nbsp;(₹)</th><th class="r">SGST&nbsp;(₹)</th>'}
          <th class="r">Total&nbsp;(₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, i) => `
        <tr>
          <td style="color:#9CA3AF">${i + 1}</td>
          <td class="b">${it.description || ''}</td>
          <td style="color:#9CA3AF">${it.hsn_sac || ''}</td>
          <td class="r">${it.quantity || 0}&nbsp;${it.unit || ''}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${it.discount_pct || 0}%</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter
            ? `<td class="r">${fmtN(it.igst_amount)}</td>`
            : `<td class="r">${fmtN(it.cgst_amount)}</td>
               <td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <!-- Summary -->
    <div class="summary">

      <div class="sum-left-block">
        <div class="sum-words">${amountToWords(inv.grand_total || 0)}</div>
        ${company?.bank_name
          ? `<p><strong>Bank:</strong>&nbsp;${company.bank_name}
             ${company.bank_account ? `&nbsp;|&nbsp;<strong>A/c:</strong>&nbsp;${company.bank_account}` : ''}
             ${company.bank_ifsc    ? `&nbsp;|&nbsp;<strong>IFSC:</strong>&nbsp;${company.bank_ifsc}`   : ''}
             ${company.upi_id       ? `<br><strong>UPI:</strong>&nbsp;${company.upi_id}`                : ''}</p>`
          : ''}
        ${inv.notes ? `<p style="margin-top:8px"><strong>Notes:</strong>&nbsp;${inv.notes}</p>` : ''}
        ${inv.terms_conditions ? `<p style="margin-top:4px"><strong>T&amp;C:</strong>&nbsp;${inv.terms_conditions}</p>` : ''}
      </div>

      <div>
        <table class="totals">
          <tr><td class="t-lbl">Subtotal</td><td class="t-val">${fmtC(inv.subtotal)}</td></tr>
          ${(inv.total_discount || 0) > 0
            ? `<tr><td class="t-lbl">Discount</td><td class="t-val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`
            : ''}
          <tr><td class="t-lbl">Taxable Value</td><td class="t-val">${fmtC(inv.total_taxable)}</td></tr>
          ${isInter
            ? `<tr><td class="t-lbl">IGST</td><td class="t-val">${fmtC(inv.total_igst)}</td></tr>`
            : `<tr><td class="t-lbl">CGST</td><td class="t-val">${fmtC(inv.total_cgst)}</td></tr>
               <tr><td class="t-lbl">SGST / UTGST</td><td class="t-val">${fmtC(inv.total_sgst)}</td></tr>`}
          ${(inv.shipping_charges || 0) > 0
            ? `<tr><td class="t-lbl">Shipping</td><td class="t-val">${fmtC(inv.shipping_charges)}</td></tr>`
            : ''}
        </table>
        <div class="grand-card">
          <div class="gc-label">Grand Total</div>
          <div class="gc-value">${fmtC(inv.grand_total)}</div>
        </div>
        ${(inv.amount_paid || 0) > 0
          ? `<div style="display:flex;justify-content:space-between;padding:5px 8px;font-size:11px;margin-top:4px">
               <span style="color:#059669">Amount Paid</span>
               <span style="color:#059669;font-weight:600">−${fmtC(inv.amount_paid)}</span>
             </div>`
          : ''}
        ${(inv.amount_due || 0) > 0
          ? `<div style="display:flex;justify-content:space-between;padding:6px 10px;
                         background:#FEF2F2;border-radius:6px;font-size:11px;
                         font-weight:700;color:#DC2626;margin-top:4px">
               <span>Balance Due</span><span>${fmtC(inv.amount_due)}</span>
             </div>`
          : ''}
      </div>

    </div><!-- /summary -->

    <!-- Sign footer -->
    <div class="sign-footer">
      <div class="notes-text">
        ${!inv.notes && !inv.terms_conditions ? '<em>Thank you for your business!</em>' : ''}
      </div>
      <div class="sign-box">
        <div style="font-size:10px;color:#9CA3AF">For&nbsp;${company?.name || ''}</div>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>

  </div><!-- /body -->
</div><!-- /page -->
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. TEMPLATE DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATE_FNS = {
  prestige:   tplPrestige,
  arc:        tplArc,
  minimal:    tplMinimal,
  splitpanel: tplSplitPanel,
  gradient:   tplGradient,
};

/**
 * generateInvoiceHTML(inv, company, templateId, themeId, customColor)
 * Returns a complete HTML string for the given invoice.
 */
export function generateInvoiceHTML(inv, company, templateId, themeId, customColor) {
  const theme = getThemeColor(themeId, customColor);
  const fn    = TEMPLATE_FNS[templateId] || tplPrestige;
  return fn(inv, company, theme);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. PRINT POPUP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Opens a new browser window with the rendered invoice HTML and
 * immediately triggers the browser print dialog.
 */
export function openInvoicePrint(
  inv,
  company,
  templateId  = 'prestige',
  themeId     = 'ocean',
  customColor = '#0D3B66',
) {
  if (!inv) return;
  const html = generateInvoiceHTML(inv, company, templateId, themeId, customColor);
  const win  = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow pop-ups to print invoices'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 13. SVG THUMBNAIL COMPONENT  (used inside InvoiceDesignModal)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Renders a tiny 60×64 SVG preview of each template.
 * Colours are driven by the currently active theme so thumbnails
 * recolour in real-time when the user picks a different theme.
 */
const TemplateThumb = ({ tpl, selected, onClick, primary, secondary, light, accent }) => {
  const svgMap = {

    /* Prestige: left white + right coloured panel */
    prestige: (
      <g>
        {/* White card outline */}
        <rect x="1" y="1" width="58" height="62" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="1"/>
        {/* Left panel with logo badge */}
        <rect x="1" y="1"  width="35" height="22" rx="3"  fill="white"/>
        <rect x="4" y="5"  width="8"  height="8"  rx="1.5" fill={primary}/>
        <rect x="14" y="5" width="16" height="3"  rx="0.5" fill={primary} opacity="0.8"/>
        <rect x="14" y="9.5" width="12" height="2" rx="0.5" fill="#9CA3AF" opacity="0.5"/>
        {/* Right coloured panel */}
        <rect x="36" y="1"  width="23" height="22" rx="3"  fill={primary}/>
        <circle cx="53" cy="4" r="10" fill="rgba(255,255,255,0.06)"/>
        <rect x="39" y="6"  width="16" height="3"  rx="1"   fill="rgba(255,255,255,0.7)"/>
        <rect x="39" y="10.5" width="12" height="2.5" rx="0.5" fill="rgba(255,255,255,0.4)"/>
        {/* Party boxes */}
        <rect x="3"  y="26" width="26" height="11" rx="1.5" fill={light}  stroke={accent} strokeWidth="0.5"/>
        <rect x="31" y="26" width="27" height="11" rx="1.5" fill={light}  stroke={accent} strokeWidth="0.5"/>
        {/* Table rows */}
        {[0,1,2,3].map(i=>(
          <rect key={i} x="3" y={41+i*5} width="54" height="3" rx="0.5"
                fill={i % 2 === 0 ? light : 'white'} stroke="#E2E8F0" strokeWidth="0.3"/>
        ))}
        {/* Grand total bar */}
        <rect x="32" y="58" width="25" height="5" rx="1.5" fill={primary}/>
      </g>
    ),

    /* Bold Arc: curved coloured hero */
    arc: (
      <g>
        {/* Hero */}
        <rect x="0" y="0" width="60" height="26" rx="2" fill={primary}/>
        <circle cx="54" cy="-2" r="14" fill="rgba(255,255,255,0.06)"/>
        <circle cx="4"  cy="28" r="10" fill={secondary} opacity="0.25"/>
        {/* Logo circle */}
        <circle cx="9" cy="12" r="7" fill="rgba(255,255,255,0.2)"/>
        <circle cx="9" cy="12" r="5.5" fill={primary} stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
        <rect x="18" y="8"  width="16" height="3"   rx="0.5" fill="rgba(255,255,255,0.75)"/>
        <rect x="18" y="13" width="11" height="2"   rx="0.5" fill="rgba(255,255,255,0.4)"/>
        <rect x="40" y="6"  width="18" height="3.5" rx="1"   fill="rgba(255,255,255,0.15)"/>
        <rect x="42" y="11" width="14" height="5"   rx="0.5" fill="rgba(255,255,255,0.75)"/>
        {/* SVG arc shape */}
        <path d="M0,24 Q30,34 60,24 L60,26 L0,26 Z" fill={primary}/>
        {/* Info cards */}
        <rect x="2"  y="30" width="17" height="10" rx="1.5" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        <rect x="21" y="30" width="17" height="10" rx="1.5" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        <rect x="40" y="30" width="18" height="10" rx="1.5" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        {/* Table rows */}
        {[0,1,2].map(i=>(
          <rect key={i} x="2" y={43+i*5} width="56" height="3" rx="0.5"
                fill={i % 2 === 0 ? light : 'white'} stroke="#E2E8F0" strokeWidth="0.3"/>
        ))}
        <rect x="32" y="58" width="26" height="5" rx="2" fill={`url(#ag${tpl.id})`}/>
        <defs>
          <linearGradient id={`ag${tpl.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor={primary}/><stop offset="1" stopColor={secondary}/>
          </linearGradient>
        </defs>
      </g>
    ),

    /* Minimal Corner: clean white, logo top-right */
    minimal: (
      <g>
        <rect x="1" y="1" width="58" height="62" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.7"/>
        {/* Company name (left) */}
        <rect x="4" y="5"  width="24" height="5"   rx="0.5" fill={primary} opacity="0.85"/>
        <rect x="4" y="12" width="16" height="2.5" rx="0.5" fill="#9CA3AF" opacity="0.4"/>
        <rect x="4" y="15.5" width="12" height="2" rx="0.5" fill="#9CA3AF" opacity="0.3"/>
        {/* Logo badge top-right */}
        <rect x="44" y="4"  width="13" height="13" rx="2.5" fill={primary}/>
        <rect x="45.5" y="5.5" width="10" height="10" rx="1.5" fill="none" stroke={secondary} strokeWidth="0.8"/>
        {/* Accent underline */}
        <rect x="4" y="22" width="52" height="2.5" rx="1.5" fill={`url(#ml${tpl.id})`}/>
        <defs>
          <linearGradient id={`ml${tpl.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor={primary}/><stop offset="1" stopColor={secondary}/>
          </linearGradient>
        </defs>
        {/* Party 3-col */}
        <rect x="4"  y="26" width="16" height="9" rx="1" fill={light}/>
        <rect x="22" y="26" width="16" height="9" rx="1" fill={light}/>
        <rect x="40" y="26" width="16" height="9" rx="1" fill={light}/>
        {/* Table rows */}
        {[0,1,2,3].map(i=>(
          <rect key={i} x="4" y={38+i*5} width="52" height="3" rx="0.5" fill="#F8FAFC"/>
        ))}
        <rect x="30" y="57" width="26" height="5" rx="1.5" fill={primary}/>
      </g>
    ),

    /* Split Panel: coloured sidebar + white main */
    splitpanel: (
      <g>
        <rect x="0" y="0" width="60" height="64" rx="2" fill="white"/>
        {/* Sidebar */}
        <rect x="0" y="0" width="18" height="64" rx="2" fill={primary}/>
        <rect x="3" y="4"  width="12" height="12" rx="2"   fill="rgba(255,255,255,0.2)"/>
        {[0,1,2].map(i=>(
          <rect key={i} x="3" y={20+i*11} width="12" height="8" rx="1" fill="rgba(255,255,255,0.1)"/>
        ))}
        <circle cx="9" cy="58" r="8" fill={secondary} opacity="0.2"/>
        {/* Main area */}
        <rect x="20" y="4"  width="12" height="3"  rx="0.5" fill={secondary} opacity="0.6"/>
        <rect x="20" y="9"  width="22" height="5"  rx="0.5" fill={primary} opacity="0.8"/>
        <rect x="42" y="4"  width="16" height="12" rx="1.5" fill={light} stroke={accent} strokeWidth="0.5"/>
        {/* Table */}
        {[0,1,2,3].map(i=>(
          <rect key={i} x="20" y={18+i*6} width="38" height="4" rx="0.5"
                fill={i % 2 === 0 ? light : 'white'} stroke="#E2E8F0" strokeWidth="0.3"/>
        ))}
        <rect x="30" y="50" width="28" height="11" rx="2" fill={primary}/>
      </g>
    ),

    /* Gradient Banner: linear-gradient hero */
    gradient: (
      <g>
        <defs>
          <linearGradient id={`gb${tpl.id}`} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor={primary}/><stop offset="1" stopColor={secondary}/>
          </linearGradient>
        </defs>
        {/* Banner */}
        <rect x="0" y="0" width="60" height="24" rx="2" fill={`url(#gb${tpl.id})`}/>
        <circle cx="4"  cy="-4"  r="18" fill="rgba(255,255,255,0.05)"/>
        <circle cx="46" cy="28" r="12" fill="rgba(255,255,255,0.07)"/>
        {/* White ring + logo */}
        <circle cx="9" cy="12" r="8" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
        <circle cx="9" cy="12" r="5.5" fill={primary}/>
        <rect x="20" y="7"  width="15" height="3.5" rx="0.5" fill="rgba(255,255,255,0.8)"/>
        <rect x="20" y="12.5" width="10" height="2" rx="0.5" fill="rgba(255,255,255,0.45)"/>
        <rect x="40" y="5"  width="18" height="3.5" rx="1"   fill="rgba(255,255,255,0.15)"/>
        <rect x="40" y="10" width="14" height="5"   rx="0.5" fill="rgba(255,255,255,0.7)"/>
        {/* Floating cards (overlap banner) */}
        <rect x="2"  y="20" width="17" height="12" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        <rect x="21" y="20" width="17" height="12" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        <rect x="40" y="20" width="18" height="12" rx="2" fill="white" stroke="#E2E8F0" strokeWidth="0.5"/>
        {/* Table rows */}
        {[0,1,2].map(i=>(
          <rect key={i} x="2" y={35+i*6} width="56" height="4" rx="0.5"
                fill={i % 2 === 0 ? light : 'white'} stroke="#E2E8F0" strokeWidth="0.3"/>
        ))}
        {/* Grand card */}
        <rect x="24" y="55" width="34" height="8" rx="3" fill={`url(#gb${tpl.id})`}/>
      </g>
    ),
  };

  return (
    <div
      onClick={onClick}
      style={{
        cursor:       'pointer',
        borderRadius: 10,
        border:       selected ? `2px solid ${primary}` : '2px solid transparent',
        background:   selected ? light : 'transparent',
        padding:      6,
        transition:   'all 0.15s',
        position:     'relative',
      }}
    >
      <svg
        viewBox="0 0 60 64"
        width="100%"
        style={{
          display:     'block',
          borderRadius: 6,
          background:  'white',
          boxShadow:   '0 1px 6px rgba(0,0,0,0.10)',
        }}
      >
        {svgMap[tpl.id]}
      </svg>

      <div style={{ marginTop: 6, textAlign: 'center' }}>
        <p style={{
          fontSize:   11,
          fontWeight: selected ? 700 : 500,
          color:      selected ? primary : '#374151',
          lineHeight: 1.3,
        }}>
          {tpl.name}
        </p>
        {tpl.badge && (
          <span style={{
            fontSize:   9,
            background: selected ? primary : '#f1f5f9',
            color:      selected ? 'white' : '#64748b',
            padding:    '1px 6px',
            borderRadius: 10,
            fontWeight: 600,
          }}>
            {tpl.badge}
          </span>
        )}
      </div>

      {selected && (
        <div style={{
          position:       'absolute',
          top: 4, right: 4,
          width: 18, height: 18,
          borderRadius:   '50%',
          background:     primary,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <Check style={{ width: 10, height: 10, color: 'white' }} />
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 14. INVOICE DESIGN MODAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full picker UI:
 *   Left panel  → template grid + colour swatches + custom colour input
 *   Right panel → live A4-sized iframe preview
 *   Header bar  → styled with active theme gradient
 */
export const InvoiceDesignModal = ({
  open,
  onClose,
  selectedTemplate,
  onTemplateChange,
  selectedTheme,
  onThemeChange,
  customColor,
  onCustomColorChange,
  sampleInvoice,
  sampleCompany,
  isDark,
}) => {
  const [previewHtml, setPreviewHtml] = useState('');
  const iframeRef                     = useRef(null);
  const activeTheme                   = getThemeColor(selectedTheme, customColor);

  /* Regenerate preview HTML whenever any picker setting changes */
  useEffect(() => {
    if (!open) return;
    const inv = sampleInvoice || makeSampleInvoice();
    const co  = sampleCompany || makeSampleCompany();
    setPreviewHtml(
      generateInvoiceHTML(inv, co, selectedTemplate, selectedTheme, customColor),
    );
  }, [open, selectedTemplate, selectedTheme, customColor, sampleInvoice, sampleCompany]);

  const handlePrint = useCallback(() => {
    const inv = sampleInvoice || makeSampleInvoice();
    const co  = sampleCompany || makeSampleCompany();
    openInvoicePrint(inv, co, selectedTemplate, selectedTheme, customColor);
  }, [sampleInvoice, sampleCompany, selectedTemplate, selectedTheme, customColor]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className={[
          'max-w-[90vw] w-[1100px] max-h-[92vh] overflow-hidden flex flex-col',
          'rounded-2xl border shadow-2xl p-0',
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200',
        ].join(' ')}
      >
        <DialogTitle className="sr-only">Invoice Design Studio</DialogTitle>
        <DialogDescription className="sr-only">
          Choose an invoice template and colour theme, then preview or print.
        </DialogDescription>

        {/* ── Modal header ── */}
        <div
          className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between"
          style={{
            background: `linear-gradient(135deg, ${activeTheme.primary}, ${activeTheme.secondary})`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Layout className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Invoice Design Studio</h2>
              <p className="text-white/60 text-xs">
                Choose template · Pick colours · Preview &amp; print
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left picker panel ── */}
          <div
            className={[
              'w-[300px] flex-shrink-0 flex flex-col border-r overflow-y-auto',
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50/40',
            ].join(' ')}
          >

            {/* Template grid */}
            <div
              className="p-4 border-b"
              style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Layout className="h-3.5 w-3.5" style={{ color: activeTheme.primary }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: activeTheme.primary }}
                >
                  Templates
                </p>
              </div>
              {/* 5 templates → 2-column grid (last item centred) */}
              <div className="grid grid-cols-2 gap-3">
                {INVOICE_TEMPLATES.map((tpl) => (
                  <TemplateThumb
                    key={tpl.id}
                    tpl={tpl}
                    selected={selectedTemplate === tpl.id}
                    onClick={() => onTemplateChange(tpl.id)}
                    primary={activeTheme.primary}
                    secondary={activeTheme.secondary}
                    light={activeTheme.light}
                    accent={activeTheme.accent}
                  />
                ))}
              </div>
            </div>

            {/* Colour theme swatches */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="h-3.5 w-3.5" style={{ color: activeTheme.primary }} />
                <p
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: activeTheme.primary }}
                >
                  Colour Theme
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3">
                {COLOR_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
                    title={t.name}
                    style={{
                      width:        '100%',
                      aspectRatio:  '1',
                      borderRadius: 8,
                      background:   `linear-gradient(135deg, ${t.primary}, ${t.secondary})`,
                      border:       selectedTheme === t.id
                        ? `3px solid ${t.secondary}`
                        : '3px solid transparent',
                      boxShadow:    selectedTheme === t.id
                        ? `0 0 0 2px white, 0 0 0 4px ${t.primary}`
                        : 'none',
                      cursor:     'pointer',
                      transition: 'all 0.15s',
                      position:   'relative',
                      display:    'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selectedTheme === t.id && (
                      <Check style={{ width: 12, height: 12, color: 'white' }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Active theme name */}
              <p className="text-[10px] text-slate-400 mb-3">
                Selected:{' '}
                <span className="font-semibold" style={{ color: activeTheme.primary }}>
                  {COLOR_THEMES.find((t) => t.id === selectedTheme)?.name || 'Custom'}
                </span>
              </p>

              {/* Custom hex input */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Custom Colour
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    onCustomColorChange(e.target.value);
                    onThemeChange('custom');
                  }}
                  className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <Input
                  value={customColor}
                  onChange={(e) => {
                    onCustomColorChange(e.target.value);
                    onThemeChange('custom');
                  }}
                  className={[
                    'flex-1 h-9 rounded-xl text-xs font-mono',
                    isDark
                      ? 'bg-slate-700 border-slate-600 text-slate-100'
                      : 'bg-white border-slate-200',
                  ].join(' ')}
                />
              </div>
            </div>

            {/* Selected template description */}
            {(() => {
              const tpl = INVOICE_TEMPLATES.find((t) => t.id === selectedTemplate);
              return tpl ? (
                <div
                  className="mx-4 mb-4 rounded-xl p-3 border"
                  style={{
                    background:   activeTheme.light,
                    borderColor:  activeTheme.accent,
                  }}
                >
                  <p className="text-xs font-bold" style={{ color: activeTheme.primary }}>
                    {tpl.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">{tpl.desc}</p>
                </div>
              ) : null;
            })()}

          </div>{/* /left panel */}

          {/* ── Right live-preview panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Preview toolbar */}
            <div
              className={[
                'flex-shrink-0 flex items-center justify-between px-5 py-3 border-b',
                isDark
                  ? 'border-slate-700 bg-slate-800/60'
                  : 'border-slate-100 bg-slate-50',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500">Live Preview</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                  A4 · Sample data
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handlePrint}
                  size="sm"
                  className="h-8 px-4 rounded-xl text-white text-xs font-semibold gap-1.5"
                  style={{
                    background: `linear-gradient(135deg, ${activeTheme.primary}, ${activeTheme.secondary})`,
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Preview
                </Button>
                <Button
                  onClick={onClose}
                  size="sm"
                  variant="outline"
                  className="h-8 px-4 rounded-xl text-xs"
                >
                  Save &amp; Close
                </Button>
              </div>
            </div>

            {/* A4 iframe */}
            <div
              className="flex-1 overflow-auto p-4"
              style={{ background: isDark ? '#1e293b' : '#e2e8f0' }}
            >
              <div
                style={{
                  maxWidth:   794,
                  margin:     '0 auto',
                  boxShadow:  '0 8px 32px rgba(0,0,0,0.18)',
                  borderRadius: 4,
                  overflow:   'hidden',
                  background: 'white',
                }}
              >
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  title="Invoice Preview"
                  style={{ width: '100%', height: 1122, border: 'none', display: 'block' }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

          </div><!-- /right preview -->

        </div><!-- /flex row -->
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// 15. SAMPLE DATA  (used by the modal preview when no real invoice is supplied)
// ═══════════════════════════════════════════════════════════════════════════════

function makeSampleInvoice() {
  return {
    invoice_no:        'INV/2025-26/0042',
    invoice_type:      'tax_invoice',
    invoice_date:      '2025-07-15',
    due_date:          '2025-08-14',
    client_name:       'Sunrise Technologies Pvt. Ltd.',
    client_address:    '14 Patel Nagar, Ahmedabad, Gujarat – 380009',
    client_email:      'accounts@sunrise.in',
    client_phone:      '9876543210',
    client_gstin:      '24AABCS1429B1Z5',
    client_state:      'Gujarat',
    payment_terms:     'Net 30 Days',
    reference_no:      'PO/2025/1138',
    is_interstate:     false,
    notes:             'Payment via NEFT/RTGS to the bank details mentioned.',
    terms_conditions:  'Goods once sold will not be taken back. Subject to Ahmedabad jurisdiction.',
    items: [
      {
        description:   'GST Consultation & Filing Services',
        hsn_sac:       '9983',
        quantity:      1,
        unit:          'month',
        unit_price:    15000,
        discount_pct:  0,
        gst_rate:      18,
        taxable_value: 15000,
        cgst_amount:   1350,
        sgst_amount:   1350,
        igst_amount:   0,
        total_amount:  17700,
      },
      {
        description:   'Income Tax Return Filing (Individual)',
        hsn_sac:       '9983',
        quantity:      3,
        unit:          'nos',
        unit_price:    2500,
        discount_pct:  10,
        gst_rate:      18,
        taxable_value: 6750,
        cgst_amount:   607.5,
        sgst_amount:   607.5,
        igst_amount:   0,
        total_amount:  7965,
      },
      {
        description:   'ROC Annual Compliance Package',
        hsn_sac:       '9983',
        quantity:      1,
        unit:          'service',
        unit_price:    8500,
        discount_pct:  0,
        gst_rate:      18,
        taxable_value: 8500,
        cgst_amount:   765,
        sgst_amount:   765,
        igst_amount:   0,
        total_amount:  10030,
      },
    ],
    subtotal:          31000,
    total_discount:    750,
    total_taxable:     30250,
    total_cgst:        2722.5,
    total_sgst:        2722.5,
    total_igst:        0,
    total_gst:         5445,
    grand_total:       35695,
    amount_paid:       10000,
    amount_due:        25695,
    shipping_charges:  0,
    other_charges:     0,
  };
}

function makeSampleCompany() {
  return {
    name:          'Manthan Desai & Associates',
    address:       '302, Shivalay Complex, Ring Road, Surat – 395002, Gujarat',
    gstin:         '24AABCM1234F1ZA',
    phone:         '0261-2345678',
    /* logo_url:   'https://…'  ← set this to show a real image logo */
    bank_name:     'HDFC Bank',
    bank_account:  '50200012345678',
    bank_ifsc:     'HDFC0001234',
    upi_id:        'manthandesai@hdfcbank',
  };
}
