/**
 * InvoiceTemplates.jsx
 *
 * Drop this file alongside your invoicing.jsx.
 *
 * Exports:
 *   - COLOR_THEMES       — 8 color presets + custom
 *   - INVOICE_TEMPLATES  — 6 template metadata objects
 *   - openInvoicePrint() — generates HTML & opens browser print dialog
 *   - InvoiceDesignModal — the full picker UI (template + color + live preview)
 *
 * Usage in invoicing.jsx:
 *   import { InvoiceDesignModal, openInvoicePrint } from './InvoiceTemplates';
 *
 *   // In state:
 *   const [designOpen, setDesignOpen] = useState(false);
 *   const [selectedTemplate, setSelectedTemplate] = useState('classic');
 *   const [selectedTheme, setSelectedTheme] = useState('ocean');
 *   const [customColor, setCustomColor] = useState('#0D3B66');
 *
 *   // Print button on any invoice:
 *   <button onClick={() => openInvoicePrint(invoice, company, selectedTemplate, activeTheme)}>
 *     Print
 *   </button>
 *
 *   // Design picker modal:
 *   <InvoiceDesignModal
 *     open={designOpen} onClose={() => setDesignOpen(false)}
 *     selectedTemplate={selectedTemplate} onTemplateChange={setSelectedTemplate}
 *     selectedTheme={selectedTheme} onThemeChange={setSelectedTheme}
 *     customColor={customColor} onCustomColorChange={setCustomColor}
 *     sampleInvoice={invoices[0]} sampleCompany={companies[0]}
 *     isDark={isDark}
 *   />
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Printer, Download, Eye, Check, Palette, Layout, ChevronLeft, ChevronRight } from 'lucide-react';

// ════════════════════════════════════════════════════════════════════════════════
// COLOR THEMES
// ════════════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════════
export const INVOICE_TEMPLATES = [
  { id: 'classic',    name: 'GST Classic',       desc: 'Traditional 2-column layout, full CGST/SGST/IGST breakup',   badge: 'Most Popular' },
  { id: 'modern',     name: 'Modern Minimal',    desc: 'Clean whitespace, accent strip, elegant typography',           badge: 'Clean' },
  { id: 'corporate',  name: 'Corporate Bold',    desc: 'Full-width colored header, sharp lines, formal styling',       badge: 'Professional' },
  { id: 'elegant',    name: 'Elegant Split',     desc: 'Colored left sidebar with company info, white right panel',    badge: 'Premium' },
  { id: 'compact',    name: 'Compact Business',  desc: 'Dense, space-efficient — great for many items',                badge: 'Retail' },
  { id: 'creative',   name: 'Creative Modern',   desc: 'Diagonal banner, bold numbers, modern brand-forward design',   badge: 'Standout' },
];

// ════════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════════
const fmtN = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmtN(n)}`;

function amountToWords(amount) {
  const num = Math.round(amount);
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven',
    'Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function conv(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '') + ' ';
    return ones[Math.floor(n/100)] + ' Hundred ' + conv(n%100);
  }
  let r = '';
  const cr = Math.floor(num/10000000); const lk = Math.floor((num%10000000)/100000);
  const th = Math.floor((num%100000)/1000); const re = num%1000;
  if (cr) r += conv(cr) + 'Crore ';
  if (lk) r += conv(lk) + 'Lakh ';
  if (th) r += conv(th) + 'Thousand ';
  if (re) r += conv(re);
  return r.trim() + ' Rupees Only';
}

function getThemeColor(selectedTheme, customColor) {
  if (selectedTheme === 'custom') return { primary: customColor, secondary: customColor, light: '#F8FAFC', accent: '#CBD5E1' };
  return COLOR_THEMES.find(t => t.id === selectedTheme) || COLOR_THEMES[0];
}

const BASE_CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#1a1a1a; background:white; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  table { width:100%; border-collapse:collapse; }
  @media print {
    body { margin:0; }
    @page { size:A4; margin:10mm; }
  }
`;

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — GST CLASSIC
// Traditional two-column header, full tax table
// ════════════════════════════════════════════════════════════════════════════════
function tplClassic(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    .page { max-width:210mm; margin:0 auto; padding:12mm; }
    .header-bar { background:${theme.primary}; color:white; padding:12px 20px; border-radius:6px 6px 0 0; display:flex; justify-content:space-between; align-items:center; }
    .company-name { font-size:20px; font-weight:800; letter-spacing:0.5px; }
    .company-sub { font-size:10px; opacity:0.75; margin-top:2px; }
    .inv-badge { background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); padding:4px 14px; border-radius:4px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    .body-wrap { border:1px solid #e2e8f0; border-top:none; border-radius:0 0 6px 6px; padding:16px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid #e2e8f0; }
    .info-block h4 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:${theme.primary}; margin-bottom:6px; }
    .info-block p { font-size:11px; line-height:1.6; color:#374151; }
    .info-block .name { font-size:13px; font-weight:700; color:#111827; }
    .inv-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .meta-row { display:flex; justify-content:space-between; font-size:11px; padding:3px 0; border-bottom:1px dashed #e2e8f0; }
    .meta-label { color:#6B7280; }
    .meta-value { font-weight:600; color:#111827; }
    table.items { margin:14px 0; }
    table.items thead tr { background:${theme.primary}; color:white; }
    table.items thead th { padding:8px 6px; text-align:left; font-size:10px; font-weight:700; letter-spacing:0.5px; }
    table.items thead th:last-child, table.items thead th:nth-last-child(2),
    table.items thead th:nth-last-child(3), table.items thead th:nth-last-child(4) { text-align:right; }
    table.items tbody tr:nth-child(even) { background:${theme.light}; }
    table.items tbody td { padding:7px 6px; font-size:11px; border-bottom:1px solid #f1f5f9; color:#374151; vertical-align:top; }
    table.items tbody td:last-child, table.items tbody td:nth-last-child(2),
    table.items tbody td:nth-last-child(3), table.items tbody td:nth-last-child(4) { text-align:right; }
    table.items tfoot tr { background:${theme.light}; font-weight:700; }
    table.items tfoot td { padding:7px 6px; font-size:11px; border-top:2px solid ${theme.secondary}; }
    .totals-grid { display:grid; grid-template-columns:1fr 280px; gap:16px; margin-top:4px; }
    .bank-box { background:${theme.light}; border:1px solid ${theme.accent}; border-radius:6px; padding:12px; }
    .bank-box h4 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:${theme.primary}; margin-bottom:8px; }
    .bank-row { display:flex; gap:6px; font-size:11px; margin-bottom:3px; }
    .bank-key { color:#6B7280; min-width:80px; }
    .bank-val { font-weight:600; }
    table.totals { }
    table.totals td { padding:5px 10px; font-size:11px; }
    table.totals .total-label { color:#6B7280; text-align:right; }
    table.totals .total-value { font-weight:600; text-align:right; min-width:90px; }
    table.totals .grand-row { background:${theme.primary}; color:white; border-radius:4px; }
    table.totals .grand-row td { font-size:14px; font-weight:800; padding:8px 10px; }
    .words-box { background:${theme.light}; border-left:3px solid ${theme.secondary}; padding:8px 12px; margin-top:10px; font-size:11px; }
    .words-label { color:#6B7280; font-size:9px; text-transform:uppercase; letter-spacing:1px; }
    .words-text { font-weight:700; color:${theme.primary}; margin-top:2px; }
    .footer { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:20px; padding-top:14px; border-top:1px solid #e2e8f0; }
    .sign-box { text-align:right; }
    .sign-line { border-top:1px solid #9CA3AF; margin-top:36px; padding-top:6px; font-size:10px; color:#6B7280; }
    .notes-box { font-size:10px; color:#6B7280; line-height:1.6; }
    .notes-box strong { color:#374151; }
    .gstin-chip { display:inline-block; background:${theme.primary}; color:white; font-size:9px; font-weight:700; padding:2px 8px; border-radius:10px; letter-spacing:0.5px; margin-top:4px; }
  </style></head><body><div class="page">

  <!-- Header -->
  <div class="header-bar">
    <div>
      <div class="company-name">${company?.name || 'Your Company'}</div>
      <div class="company-sub">${company?.address || ''}</div>
    </div>
    <div style="text-align:right">
      <div class="inv-badge">Tax Invoice</div>
      ${company?.gstin ? `<div style="font-size:10px;opacity:0.8;margin-top:4px">GSTIN: ${company.gstin}</div>` : ''}
    </div>
  </div>

  <div class="body-wrap">
    <!-- Info grid -->
    <div class="info-grid">
      <div class="info-block">
        <h4>Bill To</h4>
        <p class="name">${inv.client_name || '—'}</p>
        <p>${inv.client_address || ''}</p>
        ${inv.client_email ? `<p>✉ ${inv.client_email}</p>` : ''}
        ${inv.client_phone ? `<p>📞 ${inv.client_phone}</p>` : ''}
        ${inv.client_gstin ? `<span class="gstin-chip">GSTIN: ${inv.client_gstin}</span>` : ''}
      </div>
      <div class="info-block">
        <h4>Invoice Details</h4>
        <div class="inv-meta">
          <div class="meta-row"><span class="meta-label">Invoice No.</span><span class="meta-value">${inv.invoice_no || '—'}</span></div>
          <div class="meta-row"><span class="meta-label">Date</span><span class="meta-value">${inv.invoice_date || ''}</span></div>
          <div class="meta-row"><span class="meta-label">Due Date</span><span class="meta-value">${inv.due_date || ''}</span></div>
          <div class="meta-row"><span class="meta-label">Payment Terms</span><span class="meta-value">${inv.payment_terms || 'Due on receipt'}</span></div>
          ${inv.reference_no ? `<div class="meta-row"><span class="meta-label">Ref / PO</span><span class="meta-value">${inv.reference_no}</span></div>` : ''}
          <div class="meta-row"><span class="meta-label">Supply Type</span><span class="meta-value">${isInter ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}</span></div>
        </div>
      </div>
    </div>

    <!-- Items table -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Description</th>
          <th>HSN/SAC</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Rate (₹)</th>
          <th>Disc%</th>
          <th>Taxable (₹)</th>
          <th>GST%</th>
          ${isInter ? '<th>IGST (₹)</th>' : '<th>CGST (₹)</th><th>SGST (₹)</th>'}
          <th>Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((it, i) => `
          <tr>
            <td>${i+1}</td>
            <td>${it.description || ''}</td>
            <td>${it.hsn_sac || ''}</td>
            <td>${it.quantity || 0}</td>
            <td>${it.unit || ''}</td>
            <td style="text-align:right">${fmtN(it.unit_price)}</td>
            <td style="text-align:right">${it.discount_pct || 0}%</td>
            <td style="text-align:right">${fmtN(it.taxable_value)}</td>
            <td style="text-align:right">${it.gst_rate || 0}%</td>
            ${isInter
              ? `<td style="text-align:right">${fmtN(it.igst_amount)}</td>`
              : `<td style="text-align:right">${fmtN(it.cgst_amount)}</td><td style="text-align:right">${fmtN(it.sgst_amount)}</td>`}
            <td style="text-align:right;font-weight:700">${fmtN(it.total_amount)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="${isInter ? 7 : 8}" style="text-align:right;font-weight:700">Totals</td>
          <td style="text-align:right"></td>
          ${isInter
            ? `<td style="text-align:right">${fmtN(inv.total_igst)}</td>`
            : `<td style="text-align:right">${fmtN(inv.total_cgst)}</td><td style="text-align:right">${fmtN(inv.total_sgst)}</td>`}
          <td style="text-align:right">${fmtN(inv.grand_total)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Totals + Bank -->
    <div class="totals-grid">
      <div>
        ${company?.bank_name ? `
        <div class="bank-box">
          <h4>Bank Details</h4>
          ${company.bank_name ? `<div class="bank-row"><span class="bank-key">Bank</span><span class="bank-val">${company.bank_name}</span></div>` : ''}
          ${company.bank_account ? `<div class="bank-row"><span class="bank-key">Account No.</span><span class="bank-val">${company.bank_account}</span></div>` : ''}
          ${company.bank_ifsc ? `<div class="bank-row"><span class="bank-key">IFSC</span><span class="bank-val">${company.bank_ifsc}</span></div>` : ''}
          ${company.upi_id ? `<div class="bank-row"><span class="bank-key">UPI</span><span class="bank-val">${company.upi_id}</span></div>` : ''}
        </div>` : ''}
        <div class="words-box" style="margin-top:${company?.bank_name?'10px':'0'}">
          <div class="words-label">Amount in Words</div>
          <div class="words-text">${amountToWords(inv.grand_total || 0)}</div>
        </div>
      </div>
      <div>
        <table class="totals">
          <tr><td class="total-label">Subtotal</td><td class="total-value">${fmtC(inv.subtotal)}</td></tr>
          ${(inv.total_discount||0) > 0 ? `<tr><td class="total-label">Discount</td><td class="total-value" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>` : ''}
          <tr><td class="total-label">Taxable Value</td><td class="total-value">${fmtC(inv.total_taxable)}</td></tr>
          ${isInter
            ? `<tr><td class="total-label">IGST</td><td class="total-value">${fmtC(inv.total_igst)}</td></tr>`
            : `<tr><td class="total-label">CGST</td><td class="total-value">${fmtC(inv.total_cgst)}</td></tr>
               <tr><td class="total-label">SGST / UTGST</td><td class="total-value">${fmtC(inv.total_sgst)}</td></tr>`}
          ${(inv.shipping_charges||0)>0 ? `<tr><td class="total-label">Shipping</td><td class="total-value">${fmtC(inv.shipping_charges)}</td></tr>` : ''}
          <tr class="grand-row"><td>Grand Total</td><td>${fmtC(inv.grand_total)}</td></tr>
          ${(inv.amount_paid||0)>0 ? `<tr><td class="total-label" style="color:#059669">Amount Paid</td><td class="total-value" style="color:#059669">−${fmtC(inv.amount_paid)}</td></tr>` : ''}
          ${(inv.amount_due||0)>0 ? `<tr><td class="total-label" style="color:#DC2626;font-weight:700">Balance Due</td><td class="total-value" style="color:#DC2626;font-weight:800">${fmtC(inv.amount_due)}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="notes-box">
        ${inv.notes ? `<strong>Notes:</strong> ${inv.notes}<br>` : ''}
        ${inv.terms_conditions ? `<strong>Terms & Conditions:</strong><br>${inv.terms_conditions}` : ''}
        ${!inv.notes && !inv.terms_conditions ? '<em>Thank you for your business!</em>' : ''}
      </div>
      <div class="sign-box">
        <p style="font-size:10px;color:#6B7280">For ${company?.name || 'Your Company'}</p>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — MODERN MINIMAL
// ════════════════════════════════════════════════════════════════════════════════
function tplModern(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    .page { max-width:210mm; margin:0 auto; padding:14mm 16mm; }
    .top-strip { height:5px; background:linear-gradient(90deg,${theme.primary},${theme.secondary}); border-radius:3px; margin-bottom:28px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; }
    .company-name { font-size:26px; font-weight:900; color:${theme.primary}; letter-spacing:-0.5px; }
    .company-detail { font-size:10px; color:#9CA3AF; margin-top:4px; line-height:1.6; }
    .inv-number { font-size:32px; font-weight:900; color:${theme.primary}; line-height:1; }
    .inv-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#9CA3AF; margin-bottom:4px; }
    .party-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; padding:18px 0; border-top:1px solid #F1F5F9; border-bottom:1px solid #F1F5F9; margin-bottom:22px; }
    .party-block h4 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:${theme.secondary}; margin-bottom:8px; }
    .party-block p { font-size:11px; color:#374151; line-height:1.6; }
    .party-block .name { font-size:13px; font-weight:700; color:#111827; }
    .party-block .chip { display:inline-block; background:${theme.light}; color:${theme.primary}; font-size:9px; font-weight:700; padding:2px 7px; border-radius:10px; margin-top:3px; }
    table.items { }
    table.items thead tr { }
    table.items thead th { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#9CA3AF; padding:0 8px 10px 8px; text-align:left; border-bottom:2px solid ${theme.secondary}; }
    table.items thead th.r { text-align:right; }
    table.items tbody tr:hover { background:${theme.light}; }
    table.items tbody td { padding:10px 8px; font-size:11px; color:#374151; border-bottom:1px solid #F1F5F9; vertical-align:top; }
    table.items tbody td.r { text-align:right; }
    table.items tbody td.bold { font-weight:700; color:#111827; }
    .bottom-grid { display:grid; grid-template-columns:1fr 220px; gap:24px; margin-top:20px; }
    .totals-table td { padding:5px 8px; font-size:11px; }
    .totals-table .lbl { color:#9CA3AF; text-align:right; }
    .totals-table .val { font-weight:600; text-align:right; }
    .grand-box { background:${theme.primary}; color:white; border-radius:8px; padding:14px; margin-top:8px; }
    .grand-label { font-size:9px; text-transform:uppercase; letter-spacing:1.5px; opacity:0.7; }
    .grand-amount { font-size:22px; font-weight:900; margin-top:2px; }
    .words-txt { font-size:10px; color:#9CA3AF; margin-top:4px; font-style:italic; }
    .notes-area { font-size:10px; color:#6B7280; line-height:1.7; }
    .footer-row { display:flex; justify-content:space-between; align-items:flex-end; margin-top:24px; padding-top:16px; border-top:1px solid #F1F5F9; }
    .sign-area { text-align:right; }
    .sign-line { border-top:1px solid #9CA3AF; margin-top:40px; padding-top:5px; font-size:10px; color:#9CA3AF; }
    .bottom-strip { height:3px; background:linear-gradient(90deg,${theme.secondary},${theme.primary}); border-radius:3px; margin-top:24px; }
  </style></head><body><div class="page">
  <div class="top-strip"></div>

  <div class="header">
    <div>
      <div class="company-name">${company?.name || 'Your Company'}</div>
      <div class="company-detail">
        ${company?.address || ''}<br>
        ${company?.gstin ? `GSTIN: <strong>${company.gstin}</strong>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="inv-label">Invoice Number</div>
      <div class="inv-number">${inv.invoice_no || '—'}</div>
      <div style="font-size:11px;color:#9CA3AF;margin-top:6px">
        ${inv.invoice_date || ''} → Due: ${inv.due_date || '—'}
      </div>
    </div>
  </div>

  <div class="party-grid">
    <div class="party-block">
      <h4>Billed To</h4>
      <p class="name">${inv.client_name || '—'}</p>
      <p>${inv.client_address || ''}</p>
      ${inv.client_gstin ? `<span class="chip">GSTIN: ${inv.client_gstin}</span>` : ''}
    </div>
    <div class="party-block">
      <h4>Contact</h4>
      <p>${inv.client_email || '—'}</p>
      <p>${inv.client_phone || ''}</p>
    </div>
    <div class="party-block">
      <h4>Invoice Info</h4>
      <p><strong>Terms:</strong> ${inv.payment_terms || 'Due on receipt'}</p>
      ${inv.reference_no ? `<p><strong>Ref:</strong> ${inv.reference_no}</p>` : ''}
      <p><strong>Tax:</strong> ${isInter ? 'IGST (Interstate)' : 'CGST + SGST'}</p>
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th>#</th><th>Description</th><th>HSN</th>
      <th class="r">Qty</th><th class="r">Rate</th>
      <th class="r">Disc%</th><th class="r">Taxable</th>
      ${isInter ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}
      <th class="r">Total</th>
    </tr></thead>
    <tbody>
      ${items.map((it,i) => `<tr>
        <td style="color:#9CA3AF">${i+1}</td>
        <td><strong>${it.description||''}</strong>${it.hsn_sac?'':''}</td>
        <td style="color:#9CA3AF">${it.hsn_sac||''}</td>
        <td class="r">${it.quantity||0} ${it.unit||''}</td>
        <td class="r">${fmtN(it.unit_price)}</td>
        <td class="r">${it.discount_pct||0}%</td>
        <td class="r">${fmtN(it.taxable_value)}</td>
        ${isInter ? `<td class="r">${fmtN(it.igst_amount)}</td>` : `<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
        <td class="r bold">${fmtN(it.total_amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="bottom-grid">
    <div>
      <p class="words-txt">${amountToWords(inv.grand_total||0)}</p>
      ${company?.bank_name ? `<div style="margin-top:12px;font-size:10px;color:#6B7280">
        <strong style="color:#374151">Bank:</strong> ${company.bank_name} &nbsp;|&nbsp;
        ${company.bank_account ? `<strong style="color:#374151">A/c:</strong> ${company.bank_account} &nbsp;|&nbsp;` : ''}
        ${company.bank_ifsc ? `<strong style="color:#374151">IFSC:</strong> ${company.bank_ifsc}` : ''}
      </div>` : ''}
      ${inv.notes ? `<div class="notes-area" style="margin-top:12px"><strong>Notes:</strong> ${inv.notes}</div>` : ''}
    </div>
    <div>
      <table class="totals-table">
        <tr><td class="lbl">Taxable Value</td><td class="val">${fmtC(inv.total_taxable)}</td></tr>
        ${isInter ? `<tr><td class="lbl">IGST</td><td class="val">${fmtC(inv.total_igst)}</td></tr>` : `<tr><td class="lbl">CGST</td><td class="val">${fmtC(inv.total_cgst)}</td></tr><tr><td class="lbl">SGST</td><td class="val">${fmtC(inv.total_sgst)}</td></tr>`}
      </table>
      <div class="grand-box">
        <div class="grand-label">Grand Total</div>
        <div class="grand-amount">${fmtC(inv.grand_total)}</div>
      </div>
      ${(inv.amount_due||0)>0 ? `<div style="background:#FEF2F2;border-radius:6px;padding:8px;margin-top:6px;font-size:11px"><span style="color:#9CA3AF">Balance Due</span><span style="float:right;font-weight:800;color:#DC2626">${fmtC(inv.amount_due)}</span></div>` : ''}
    </div>
  </div>

  <div class="footer-row">
    <div class="notes-area">${inv.terms_conditions || ''}</div>
    <div class="sign-area">
      <div style="font-size:10px;color:#9CA3AF">For ${company?.name||''}</div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </div>
  <div class="bottom-strip"></div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 — CORPORATE BOLD
// ════════════════════════════════════════════════════════════════════════════════
function tplCorporate(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    .page { max-width:210mm; margin:0 auto; }
    .header { background:${theme.primary}; color:white; padding:20px 24px; position:relative; overflow:hidden; }
    .header::after { content:''; position:absolute; right:-40px; top:-40px; width:160px; height:160px; background:rgba(255,255,255,0.07); border-radius:50%; }
    .header::before { content:''; position:absolute; right:60px; bottom:-30px; width:100px; height:100px; background:rgba(255,255,255,0.05); border-radius:50%; }
    .h-company { font-size:22px; font-weight:900; position:relative; }
    .h-gstin { font-size:10px; opacity:0.65; margin-top:3px; position:relative; }
    .h-address { font-size:10px; opacity:0.65; position:relative; }
    .h-right { text-align:right; position:relative; }
    .h-invno { font-size:28px; font-weight:900; }
    .h-tag { display:inline-block; background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.3); font-size:10px; font-weight:700; padding:3px 12px; border-radius:3px; letter-spacing:2px; text-transform:uppercase; margin-bottom:8px; }
    .h-date { font-size:10px; opacity:0.7; margin-top:4px; }
    .body { padding:18px 24px; }
    .accent-bar { height:3px; background:${theme.secondary}; margin-bottom:18px; }
    .party-row { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:18px; }
    .party-box { border:1px solid #E2E8F0; border-top:3px solid ${theme.secondary}; padding:12px; border-radius:0 0 6px 6px; }
    .party-box h4 { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:${theme.secondary}; margin-bottom:8px; }
    .party-box .name { font-size:13px; font-weight:700; color:#111827; margin-bottom:4px; }
    .party-box p { font-size:11px; color:#374151; line-height:1.6; }
    .gstin-tag { display:inline-block; background:${theme.primary}; color:white; font-size:9px; font-weight:700; padding:2px 8px; border-radius:2px; margin-top:4px; }
    table.items { }
    table.items thead tr { background:${theme.secondary}; }
    table.items thead th { color:white; padding:9px 8px; font-size:10px; font-weight:700; text-align:left; letter-spacing:0.5px; }
    table.items thead th.r { text-align:right; }
    table.items tbody tr:nth-child(odd) { background:#F8FAFC; }
    table.items tbody td { padding:8px 8px; font-size:11px; border-bottom:1px solid #F1F5F9; color:#374151; vertical-align:top; }
    table.items tbody td.r { text-align:right; }
    table.items tbody td.b { font-weight:700; color:#111827; }
    .summary-row { display:grid; grid-template-columns:1fr 250px; gap:20px; margin-top:16px; }
    table.sum td { padding:5px 8px; font-size:11px; }
    .sum .lbl { color:#6B7280; text-align:right; }
    .sum .val { font-weight:600; text-align:right; min-width:90px; }
    .sum .sep td { border-top:1px solid #E2E8F0; padding-top:8px; }
    .grand-strip { background:${theme.primary}; color:white; padding:10px 14px; margin-top:6px; display:flex; justify-content:space-between; align-items:center; border-radius:4px; }
    .grand-strip span:first-child { font-size:11px; text-transform:uppercase; letter-spacing:1px; opacity:0.8; }
    .grand-strip span:last-child { font-size:20px; font-weight:900; }
    .footer-bar { background:${theme.primary}; color:rgba(255,255,255,0.7); padding:12px 24px; display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; font-size:10px; }
    .sign-col { text-align:right; }
    .sign-line { border-top:1px solid rgba(255,255,255,0.4); margin-top:32px; padding-top:5px; font-size:10px; }
  </style></head><body><div class="page">

  <div class="header">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="h-company">${company?.name || 'Your Company'}</div>
        <div class="h-address">${company?.address || ''}</div>
        ${company?.gstin ? `<div class="h-gstin">GSTIN: ${company.gstin}</div>` : ''}
      </div>
      <div class="h-right">
        <div class="h-tag">Tax Invoice</div>
        <div class="h-invno">${inv.invoice_no || '—'}</div>
        <div class="h-date">Date: ${inv.invoice_date || ''} &nbsp;·&nbsp; Due: ${inv.due_date || ''}</div>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="party-row">
      <div class="party-box">
        <h4>Bill To</h4>
        <div class="name">${inv.client_name||'—'}</div>
        <p>${inv.client_address||''}</p>
        <p>${inv.client_email||''} ${inv.client_phone?'· '+inv.client_phone:''}</p>
        ${inv.client_gstin?`<span class="gstin-tag">GSTIN: ${inv.client_gstin}</span>`:''}
      </div>
      <div class="party-box">
        <h4>Invoice Details</h4>
        <p><strong>Payment Terms:</strong> ${inv.payment_terms||'Due on receipt'}</p>
        ${inv.reference_no?`<p><strong>Reference:</strong> ${inv.reference_no}</p>`:''}
        <p><strong>Supply Type:</strong> ${isInter?'Interstate (IGST)':'Intrastate (CGST+SGST)'}</p>
        <p><strong>State of Supply:</strong> ${inv.client_state||'—'}</p>
      </div>
    </div>

    <table class="items">
      <thead><tr>
        <th style="width:28px">#</th>
        <th>Item Description</th><th>HSN/SAC</th>
        <th class="r">Qty</th><th class="r">Rate (₹)</th>
        <th class="r">Disc%</th><th class="r">Taxable (₹)</th>
        ${isInter?'<th class="r">IGST (₹)</th>':'<th class="r">CGST (₹)</th><th class="r">SGST (₹)</th>'}
        <th class="r">Total (₹)</th>
      </tr></thead>
      <tbody>
        ${items.map((it,i)=>`<tr>
          <td style="color:#9CA3AF;font-size:10px">${i+1}</td>
          <td class="b">${it.description||''}</td>
          <td>${it.hsn_sac||''}</td>
          <td class="r">${it.quantity||0} ${it.unit||''}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${it.discount_pct||0}%</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter?`<td class="r">${fmtN(it.igst_amount)}</td>`:`<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="summary-row">
      <div>
        ${company?.bank_name?`<p style="font-size:10px;color:#6B7280;margin-bottom:8px"><strong>Bank:</strong> ${company.bank_name} &nbsp;|&nbsp; <strong>A/c:</strong> ${company.bank_account||''} &nbsp;|&nbsp; <strong>IFSC:</strong> ${company.bank_ifsc||''}</p>`:''}
        <p style="font-size:11px;font-style:italic;color:#6B7280">${amountToWords(inv.grand_total||0)}</p>
        ${inv.notes?`<p style="font-size:10px;color:#6B7280;margin-top:8px"><strong>Notes:</strong> ${inv.notes}</p>`:''}
        ${inv.terms_conditions?`<p style="font-size:10px;color:#6B7280;margin-top:6px"><strong>T&C:</strong> ${inv.terms_conditions}</p>`:''}
      </div>
      <div>
        <table class="sum">
          <tr><td class="lbl">Subtotal</td><td class="val">${fmtC(inv.subtotal)}</td></tr>
          ${(inv.total_discount||0)>0?`<tr><td class="lbl">Discount</td><td class="val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`:''}
          <tr><td class="lbl">Taxable Value</td><td class="val">${fmtC(inv.total_taxable)}</td></tr>
          ${isInter?`<tr><td class="lbl">IGST</td><td class="val">${fmtC(inv.total_igst)}</td></tr>`:`<tr><td class="lbl">CGST</td><td class="val">${fmtC(inv.total_cgst)}</td></tr><tr><td class="lbl">SGST/UTGST</td><td class="val">${fmtC(inv.total_sgst)}</td></tr>`}
        </table>
        <div class="grand-strip">
          <span>Grand Total</span>
          <span>${fmtC(inv.grand_total)}</span>
        </div>
        ${(inv.amount_due||0)>0?`<div style="display:flex;justify-content:space-between;font-size:11px;padding:6px 8px;background:#FEF2F2;border-radius:4px;margin-top:4px"><span style="color:#9CA3AF">Balance Due</span><span style="font-weight:800;color:#DC2626">${fmtC(inv.amount_due)}</span></div>`:''}
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>Thank you for your business!</div>
    <div class="sign-col">
      For ${company?.name||''}<div class="sign-line">Authorised Signatory</div>
    </div>
  </div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 4 — ELEGANT SPLIT (sidebar layout)
// ════════════════════════════════════════════════════════════════════════════════
function tplElegant(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    .page { max-width:210mm; margin:0 auto; min-height:297mm; display:flex; }
    .sidebar { width:62mm; background:${theme.primary}; color:white; padding:20px 16px; flex-shrink:0; min-height:100%; }
    .main { flex:1; padding:20px 18px; }
    .s-logo { font-size:16px; font-weight:900; letter-spacing:-0.5px; margin-bottom:4px; }
    .s-sub { font-size:9px; opacity:0.6; line-height:1.6; margin-bottom:20px; }
    .s-section { margin-bottom:20px; }
    .s-section h4 { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:2px; opacity:0.5; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:5px; }
    .s-section p { font-size:10px; opacity:0.85; line-height:1.7; }
    .s-section .val { font-size:11px; font-weight:700; opacity:1; }
    .s-gstin { background:rgba(255,255,255,0.15); border-radius:4px; padding:4px 8px; font-size:9px; font-weight:700; margin-top:6px; display:inline-block; }
    .inv-number { font-size:28px; font-weight:900; color:${theme.primary}; margin-bottom:2px; }
    .inv-type { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:${theme.secondary}; margin-bottom:16px; }
    .meta-strip { display:flex; gap:16px; background:${theme.light}; padding:10px 14px; border-radius:6px; margin-bottom:18px; }
    .meta-item .lbl { font-size:8px; text-transform:uppercase; letter-spacing:1px; color:#9CA3AF; }
    .meta-item .val { font-size:11px; font-weight:700; color:#111827; margin-top:1px; }
    table.items { }
    table.items thead th { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${theme.primary}; border-bottom:2px solid ${theme.primary}; padding:0 6px 8px 6px; text-align:left; }
    table.items thead th.r { text-align:right; }
    table.items tbody tr:nth-child(even) { background:${theme.light}; }
    table.items tbody td { padding:8px 6px; font-size:10.5px; border-bottom:1px solid #F1F5F9; color:#374151; }
    table.items tbody td.r { text-align:right; }
    table.items tbody td.b { font-weight:700; }
    .totals-box { background:${theme.primary}; color:white; border-radius:8px; padding:14px; margin-top:14px; }
    .t-row { display:flex; justify-content:space-between; font-size:11px; padding:3px 0; opacity:0.8; }
    .t-total { display:flex; justify-content:space-between; font-size:16px; font-weight:900; padding-top:10px; margin-top:8px; border-top:1px solid rgba(255,255,255,0.3); }
    .words-txt { font-size:9px; opacity:0.65; margin-top:6px; font-style:italic; }
    .sign-row { display:flex; justify-content:flex-end; margin-top:18px; }
    .sign-box { text-align:right; }
    .sign-line { border-top:1px solid #CBD5E1; margin-top:36px; padding-top:5px; font-size:9px; color:#9CA3AF; }
  </style></head><body><div class="page">

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="s-logo">${company?.name||'Company'}</div>
    <div class="s-sub">${company?.address||''}</div>
    ${company?.gstin?`<div class="s-gstin">GSTIN: ${company.gstin}</div>`:''}

    <div class="s-section" style="margin-top:24px">
      <h4>Invoice To</h4>
      <p class="val">${inv.client_name||'—'}</p>
      <p>${inv.client_address||''}</p>
      <p>${inv.client_email||''}</p>
      <p>${inv.client_phone||''}</p>
      ${inv.client_gstin?`<div class="s-gstin" style="margin-top:6px">GSTIN: ${inv.client_gstin}</div>`:''}
    </div>

    <div class="s-section">
      <h4>Payment</h4>
      <p>${inv.payment_terms||'Due on receipt'}</p>
    </div>

    ${company?.bank_name?`<div class="s-section">
      <h4>Bank Details</h4>
      <p>${company.bank_name}</p>
      ${company.bank_account?`<p>A/c: ${company.bank_account}</p>`:''}
      ${company.bank_ifsc?`<p>IFSC: ${company.bank_ifsc}</p>`:''}
      ${company.upi_id?`<p>UPI: ${company.upi_id}</p>`:''}
    </div>`:''}

    ${inv.notes||inv.terms_conditions?`<div class="s-section">
      <h4>Notes</h4>
      <p>${inv.notes||''} ${inv.terms_conditions||''}</p>
    </div>`:''}
  </div>

  <!-- Main content -->
  <div class="main">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div class="inv-type">Tax Invoice</div>
        <div class="inv-number">${inv.invoice_no||'—'}</div>
      </div>
    </div>

    <div class="meta-strip">
      <div class="meta-item"><div class="lbl">Invoice Date</div><div class="val">${inv.invoice_date||''}</div></div>
      <div class="meta-item"><div class="lbl">Due Date</div><div class="val">${inv.due_date||''}</div></div>
      ${inv.reference_no?`<div class="meta-item"><div class="lbl">Reference</div><div class="val">${inv.reference_no}</div></div>`:''}
      <div class="meta-item"><div class="lbl">Tax Type</div><div class="val">${isInter?'IGST':'CGST+SGST'}</div></div>
    </div>

    <table class="items">
      <thead><tr>
        <th>#</th><th>Description</th><th>HSN</th>
        <th class="r">Qty</th><th class="r">Rate</th>
        <th class="r">Taxable</th>
        ${isInter?'<th class="r">IGST</th>':'<th class="r">CGST</th><th class="r">SGST</th>'}
        <th class="r">Total</th>
      </tr></thead>
      <tbody>
        ${items.map((it,i)=>`<tr>
          <td style="color:#9CA3AF">${i+1}</td>
          <td class="b">${it.description||''}</td>
          <td style="color:#9CA3AF">${it.hsn_sac||''}</td>
          <td class="r">${it.quantity||0}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter?`<td class="r">${fmtN(it.igst_amount)}</td>`:`<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div style="display:flex;justify-content:flex-end">
      <div style="width:200px">
        <div class="totals-box">
          <div class="t-row"><span>Taxable Value</span><span>${fmtC(inv.total_taxable)}</span></div>
          ${isInter?`<div class="t-row"><span>IGST</span><span>${fmtC(inv.total_igst)}</span></div>`:`<div class="t-row"><span>CGST</span><span>${fmtC(inv.total_cgst)}</span></div><div class="t-row"><span>SGST</span><span>${fmtC(inv.total_sgst)}</span></div>`}
          ${(inv.total_discount||0)>0?`<div class="t-row"><span>Discount</span><span>−${fmtC(inv.total_discount)}</span></div>`:''}
          <div class="t-total"><span>Grand Total</span><span>${fmtC(inv.grand_total)}</span></div>
          <div class="words-txt">${amountToWords(inv.grand_total||0)}</div>
        </div>
        ${(inv.amount_due||0)>0?`<div style="text-align:right;font-size:11px;margin-top:6px;color:#DC2626;font-weight:700">Balance Due: ${fmtC(inv.amount_due)}</div>`:''}
      </div>
    </div>

    <div class="sign-row">
      <div class="sign-box">
        <div style="font-size:9px;color:#9CA3AF">For ${company?.name||''}</div>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 5 — COMPACT BUSINESS (dense, retail-friendly)
// ════════════════════════════════════════════════════════════════════════════════
function tplCompact(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    body { font-size:11px; }
    .page { max-width:210mm; margin:0 auto; padding:10mm 12mm; }
    .header { border-bottom:2px solid ${theme.primary}; padding-bottom:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:flex-start; }
    .co-name { font-size:18px; font-weight:900; color:${theme.primary}; }
    .co-info { font-size:9.5px; color:#6B7280; line-height:1.6; }
    .inv-head { text-align:right; }
    .inv-title { font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:2px; color:${theme.primary}; }
    .inv-no { font-size:20px; font-weight:900; color:#111827; }
    .inv-dates { font-size:10px; color:#6B7280; }
    .party-strip { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; padding:10px 0; border-bottom:1px dashed #CBD5E1; margin-bottom:10px; }
    .ps h4 { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:${theme.secondary}; margin-bottom:4px; }
    .ps p { font-size:10.5px; color:#374151; line-height:1.5; }
    .ps .n { font-weight:700; color:#111827; }
    .chip { display:inline-block; background:${theme.primary}; color:white; font-size:8px; padding:1px 6px; border-radius:2px; font-weight:700; }
    table.items { font-size:10.5px; }
    table.items thead th { background:${theme.primary}; color:white; padding:6px 5px; font-size:9px; font-weight:700; text-align:left; }
    table.items thead th.r { text-align:right; }
    table.items tbody tr:nth-child(even) { background:#F8FAFC; }
    table.items tbody td { padding:5px 5px; border-bottom:1px solid #F1F5F9; color:#374151; vertical-align:top; }
    table.items tbody td.r { text-align:right; }
    table.items tbody td.b { font-weight:700; }
    table.items tfoot td { padding:6px 5px; font-weight:700; border-top:2px solid ${theme.primary}; }
    .bottom { display:grid; grid-template-columns:1fr 180px; gap:12px; margin-top:10px; }
    .bottom-left { font-size:10px; color:#6B7280; }
    .bottom-left strong { color:#374151; }
    table.totals td { padding:3px 6px; font-size:10.5px; }
    table.totals .lbl { color:#6B7280; text-align:right; }
    table.totals .val { font-weight:600; text-align:right; }
    .gbox { background:${theme.primary}; color:white; padding:7px 10px; display:flex; justify-content:space-between; margin-top:5px; border-radius:3px; font-weight:800; font-size:13px; }
    .footer { margin-top:12px; padding-top:8px; border-top:1px dashed #CBD5E1; display:flex; justify-content:space-between; font-size:9.5px; color:#9CA3AF; }
    .sign-line { border-top:1px solid #CBD5E1; margin-top:28px; padding-top:4px; }
  </style></head><body><div class="page">

  <div class="header">
    <div>
      <div class="co-name">${company?.name||'Your Company'}</div>
      <div class="co-info">
        ${company?.address||''}<br>
        ${company?.gstin?`GSTIN: <strong>${company.gstin}</strong>`:''}
        ${company?.phone?` | Ph: ${company.phone}`:''}
      </div>
    </div>
    <div class="inv-head">
      <div class="inv-title">Tax Invoice</div>
      <div class="inv-no">${inv.invoice_no||'—'}</div>
      <div class="inv-dates">Date: ${inv.invoice_date||''} | Due: ${inv.due_date||''}</div>
    </div>
  </div>

  <div class="party-strip">
    <div class="ps">
      <h4>Bill To</h4>
      <p class="n">${inv.client_name||'—'}</p>
      <p>${inv.client_address||''}</p>
      ${inv.client_gstin?`<span class="chip">GSTIN: ${inv.client_gstin}</span>`:''}
    </div>
    <div class="ps">
      <h4>Contact</h4>
      <p>${inv.client_email||'—'}</p>
      <p>${inv.client_phone||''}</p>
    </div>
    <div class="ps">
      <h4>Info</h4>
      <p>Terms: ${inv.payment_terms||'On receipt'}</p>
      <p>Tax: ${isInter?'IGST':'CGST+SGST'}</p>
      ${inv.reference_no?`<p>Ref: ${inv.reference_no}</p>`:''}
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:22px">#</th>
      <th>Description</th><th>HSN/SAC</th>
      <th class="r">Qty</th><th class="r">Unit</th>
      <th class="r">Rate</th><th class="r">Disc%</th>
      <th class="r">Taxable</th><th class="r">GST%</th>
      ${isInter?'<th class="r">IGST</th>':'<th class="r">CGST</th><th class="r">SGST</th>'}
      <th class="r">Total</th>
    </tr></thead>
    <tbody>
      ${items.map((it,i)=>`<tr>
        <td>${i+1}</td>
        <td class="b">${it.description||''}</td>
        <td>${it.hsn_sac||''}</td>
        <td class="r">${it.quantity||0}</td>
        <td class="r">${it.unit||''}</td>
        <td class="r">${fmtN(it.unit_price)}</td>
        <td class="r">${it.discount_pct||0}%</td>
        <td class="r">${fmtN(it.taxable_value)}</td>
        <td class="r">${it.gst_rate||0}%</td>
        ${isInter?`<td class="r">${fmtN(it.igst_amount)}</td>`:`<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
        <td class="r b">${fmtN(it.total_amount)}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="${isInter?8:9}" style="text-align:right">Totals →</td>
        <td class="r">${fmtN(inv.total_taxable)}</td>
        ${isInter?`<td class="r">${fmtN(inv.total_igst)}</td>`:`<td class="r">${fmtN(inv.total_cgst)}</td><td class="r">${fmtN(inv.total_sgst)}</td>`}
        <td class="r">${fmtN(inv.grand_total)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="bottom">
    <div class="bottom-left">
      <p><em>${amountToWords(inv.grand_total||0)}</em></p>
      ${company?.bank_name?`<p style="margin-top:8px"><strong>Bank:</strong> ${company.bank_name} &nbsp;|&nbsp; <strong>A/c:</strong> ${company.bank_account||''} &nbsp;|&nbsp; <strong>IFSC:</strong> ${company.bank_ifsc||''}</p>`:''}
      ${inv.notes?`<p style="margin-top:6px"><strong>Notes:</strong> ${inv.notes}</p>`:''}
      ${inv.terms_conditions?`<p style="margin-top:4px"><strong>T&C:</strong> ${inv.terms_conditions}</p>`:''}
    </div>
    <div>
      <table class="totals">
        <tr><td class="lbl">Subtotal</td><td class="val">${fmtC(inv.subtotal)}</td></tr>
        ${(inv.total_discount||0)>0?`<tr><td class="lbl" style="color:#DC2626">Discount</td><td class="val" style="color:#DC2626">−${fmtC(inv.total_discount)}</td></tr>`:''}
        <tr><td class="lbl">Taxable</td><td class="val">${fmtC(inv.total_taxable)}</td></tr>
        ${isInter?`<tr><td class="lbl">IGST</td><td class="val">${fmtC(inv.total_igst)}</td></tr>`:`<tr><td class="lbl">CGST</td><td class="val">${fmtC(inv.total_cgst)}</td></tr><tr><td class="lbl">SGST</td><td class="val">${fmtC(inv.total_sgst)}</td></tr>`}
      </table>
      <div class="gbox"><span>Grand Total</span><span>${fmtC(inv.grand_total)}</span></div>
      ${(inv.amount_due||0)>0?`<div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 6px;color:#DC2626;font-weight:700"><span>Balance Due</span><span>${fmtC(inv.amount_due)}</span></div>`:''}
    </div>
  </div>

  <div class="footer">
    <div>Thank you for your business!</div>
    <div>For ${company?.name||''}&nbsp;&nbsp;&nbsp;&nbsp;<span class="sign-line">Authorised Signatory</span></div>
  </div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE 6 — CREATIVE MODERN (brand-forward, diagonal accent)
// ════════════════════════════════════════════════════════════════════════════════
function tplCreative(inv, company, theme) {
  const isInter = inv.is_interstate;
  const items = inv.items || [];
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_no}</title>
  <style>
    ${BASE_CSS}
    .page { max-width:210mm; margin:0 auto; padding:0; overflow:hidden; }
    .hero { background:${theme.primary}; min-height:70mm; position:relative; padding:22px 26px 60px; overflow:hidden; }
    .hero::before { content:''; position:absolute; bottom:-30px; right:-20px; width:220px; height:220px; background:${theme.secondary}; border-radius:50%; opacity:0.35; }
    .hero::after { content:''; position:absolute; top:-60px; right:60px; width:150px; height:150px; background:rgba(255,255,255,0.06); border-radius:50%; }
    .hero-top { display:flex; justify-content:space-between; align-items:flex-start; position:relative; }
    .co-name { font-size:24px; font-weight:900; color:white; letter-spacing:-0.5px; }
    .co-detail { font-size:9.5px; color:rgba(255,255,255,0.6); margin-top:3px; }
    .inv-badge { background:rgba(255,255,255,0.15); border:1.5px solid rgba(255,255,255,0.3); color:white; font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase; padding:4px 14px; border-radius:20px; }
    .inv-big { font-size:44px; font-weight:900; color:white; line-height:1; position:relative; margin-top:16px; }
    .inv-sub { font-size:11px; color:rgba(255,255,255,0.6); position:relative; margin-top:4px; }
    .wave { width:100%; display:block; margin-top:-2px; }
    .body { padding:0 26px 20px; margin-top:-20px; }
    .cards { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:20px; }
    .card { background:white; border:1px solid #E2E8F0; border-radius:8px; padding:12px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
    .card h4 { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:${theme.secondary}; margin-bottom:6px; }
    .card .n { font-size:13px; font-weight:700; color:#111827; }
    .card p { font-size:10.5px; color:#6B7280; line-height:1.6; }
    .chip { background:${theme.primary}; color:white; font-size:8px; font-weight:700; padding:2px 7px; border-radius:10px; display:inline-block; margin-top:3px; }
    table.items thead th { background:${theme.primary}; color:white; padding:9px 7px; font-size:9.5px; font-weight:700; text-align:left; }
    table.items thead th:first-child { border-radius:6px 0 0 0; }
    table.items thead th:last-child { border-radius:0 6px 0 0; text-align:right; }
    table.items thead th.r { text-align:right; }
    table.items tbody tr:nth-child(even) { background:${theme.light}; }
    table.items tbody td { padding:9px 7px; font-size:11px; border-bottom:1px solid #F1F5F9; color:#374151; }
    table.items tbody td.r { text-align:right; }
    table.items tbody td.b { font-weight:700; color:#111827; }
    .sum-area { display:flex; justify-content:space-between; margin-top:18px; gap:20px; }
    .sum-left { flex:1; font-size:10.5px; color:#6B7280; }
    .sum-left .words { font-style:italic; color:${theme.primary}; font-weight:600; margin-bottom:8px; }
    .sum-right { width:220px; }
    .sum-row { display:flex; justify-content:space-between; font-size:11px; padding:4px 0; border-bottom:1px solid #F1F5F9; }
    .sum-lbl { color:#9CA3AF; }
    .sum-val { font-weight:600; }
    .grand-pill { background:linear-gradient(135deg,${theme.primary},${theme.secondary}); color:white; border-radius:8px; padding:12px 14px; margin-top:8px; display:flex; justify-content:space-between; align-items:center; }
    .grand-pill span:first-child { font-size:10px; text-transform:uppercase; letter-spacing:1px; opacity:0.8; }
    .grand-pill span:last-child { font-size:20px; font-weight:900; }
    .footer-row { display:flex; justify-content:space-between; align-items:flex-end; margin-top:20px; padding-top:14px; border-top:1px solid #F1F5F9; }
    .sign-line { border-top:1px solid #CBD5E1; margin-top:32px; padding-top:5px; font-size:9.5px; color:#9CA3AF; text-align:center; }
    .bank-detail { font-size:10px; color:#6B7280; margin-top:8px; line-height:1.7; }
  </style></head><body><div class="page">

  <div class="hero">
    <div class="hero-top">
      <div>
        <div class="co-name">${company?.name||'Your Company'}</div>
        <div class="co-detail">${company?.address||''} ${company?.gstin?'| GSTIN: '+company.gstin:''}</div>
      </div>
      <div style="text-align:right;position:relative">
        <div class="inv-badge">Tax Invoice</div>
      </div>
    </div>
    <div class="inv-big">${inv.invoice_no||'—'}</div>
    <div class="inv-sub">${inv.invoice_date||''} &nbsp;→&nbsp; Due ${inv.due_date||''}</div>
  </div>
  <svg class="wave" viewBox="0 0 800 50" preserveAspectRatio="none" height="40" xmlns="http://www.w3.org/2000/svg">
    <path d="M0,30 C200,60 600,0 800,30 L800,0 L0,0 Z" fill="${theme.primary}"/>
  </svg>

  <div class="body">
    <div class="cards">
      <div class="card">
        <h4>Billed To</h4>
        <div class="n">${inv.client_name||'—'}</div>
        <p>${inv.client_address||''}</p>
        ${inv.client_gstin?`<span class="chip">GSTIN: ${inv.client_gstin}</span>`:''}
      </div>
      <div class="card">
        <h4>Contact</h4>
        <p>${inv.client_email||'—'}</p>
        <p>${inv.client_phone||''}</p>
        <p>State: ${inv.client_state||'—'}</p>
      </div>
      <div class="card">
        <h4>Invoice Info</h4>
        <p>Terms: ${inv.payment_terms||'Due on receipt'}</p>
        <p>Tax: ${isInter?'IGST (Interstate)':'CGST + SGST'}</p>
        ${inv.reference_no?`<p>Ref: ${inv.reference_no}</p>`:''}
      </div>
    </div>

    <table class="items">
      <thead><tr>
        <th>#</th><th>Description</th><th>HSN/SAC</th>
        <th class="r">Qty</th><th class="r">Rate (₹)</th>
        <th class="r">Disc%</th><th class="r">Taxable (₹)</th>
        ${isInter?'<th class="r">IGST (₹)</th>':'<th class="r">CGST (₹)</th><th class="r">SGST (₹)</th>'}
        <th class="r">Total (₹)</th>
      </tr></thead>
      <tbody>
        ${items.map((it,i)=>`<tr>
          <td style="color:#9CA3AF">${i+1}</td>
          <td class="b">${it.description||''}</td>
          <td style="color:#9CA3AF">${it.hsn_sac||''}</td>
          <td class="r">${it.quantity||0} ${it.unit||''}</td>
          <td class="r">${fmtN(it.unit_price)}</td>
          <td class="r">${it.discount_pct||0}%</td>
          <td class="r">${fmtN(it.taxable_value)}</td>
          ${isInter?`<td class="r">${fmtN(it.igst_amount)}</td>`:`<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
          <td class="r b">${fmtN(it.total_amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <div class="sum-area">
      <div class="sum-left">
        <div class="words">${amountToWords(inv.grand_total||0)}</div>
        ${company?.bank_name?`<div class="bank-detail"><strong>Bank:</strong> ${company.bank_name}<br>A/c: ${company.bank_account||''} &nbsp;|&nbsp; IFSC: ${company.bank_ifsc||''}</div>`:''}
        ${inv.notes?`<div style="margin-top:8px"><strong>Notes:</strong> ${inv.notes}</div>`:''}
        ${inv.terms_conditions?`<div style="margin-top:4px"><strong>T&C:</strong> ${inv.terms_conditions}</div>`:''}
      </div>
      <div class="sum-right">
        <div class="sum-row"><span class="sum-lbl">Taxable Value</span><span class="sum-val">${fmtC(inv.total_taxable)}</span></div>
        ${isInter?`<div class="sum-row"><span class="sum-lbl">IGST</span><span class="sum-val">${fmtC(inv.total_igst)}</span></div>`:`<div class="sum-row"><span class="sum-lbl">CGST</span><span class="sum-val">${fmtC(inv.total_cgst)}</span></div><div class="sum-row"><span class="sum-lbl">SGST/UTGST</span><span class="sum-val">${fmtC(inv.total_sgst)}</span></div>`}
        ${(inv.total_discount||0)>0?`<div class="sum-row"><span class="sum-lbl" style="color:#DC2626">Discount</span><span class="sum-val" style="color:#DC2626">−${fmtC(inv.total_discount)}</span></div>`:''}
        <div class="grand-pill">
          <span>Grand Total</span>
          <span>${fmtC(inv.grand_total)}</span>
        </div>
        ${(inv.amount_due||0)>0?`<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:5px;color:#DC2626;font-weight:700;padding:4px 4px"><span>Balance Due</span><span>${fmtC(inv.amount_due)}</span></div>`:''}
      </div>
    </div>

    <div class="footer-row">
      <div style="font-size:9.5px;color:#9CA3AF">Generated with Taskosphere · ${inv.invoice_date||''}</div>
      <div>
        <div style="font-size:9.5px;color:#9CA3AF">For ${company?.name||''}</div>
        <div class="sign-line">Authorised Signatory</div>
      </div>
    </div>
  </div>
</div></body></html>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// TEMPLATE DISPATCHER
// ════════════════════════════════════════════════════════════════════════════════
const TEMPLATE_FNS = {
  classic:   tplClassic,
  modern:    tplModern,
  corporate: tplCorporate,
  elegant:   tplElegant,
  compact:   tplCompact,
  creative:  tplCreative,
};

export function generateInvoiceHTML(inv, company, templateId, themeId, customColor) {
  const theme = getThemeColor(themeId, customColor);
  const fn = TEMPLATE_FNS[templateId] || tplClassic;
  return fn(inv, company, theme);
}

// ════════════════════════════════════════════════════════════════════════════════
// OPEN PRINT WINDOW
// ════════════════════════════════════════════════════════════════════════════════
export function openInvoicePrint(inv, company, templateId = 'classic', themeId = 'ocean', customColor = '#0D3B66') {
  if (!inv) { return; }
  const html = generateInvoiceHTML(inv, company, templateId, themeId, customColor);
  const win  = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow pop-ups to print invoices'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ════════════════════════════════════════════════════════════════════════════════
// MINI TEMPLATE THUMB COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
const TemplateThumb = ({ tpl, selected, onClick, primary, secondary, light }) => {
  const thumbs = {
    classic:   <g>
      <rect x="2" y="2" width="56" height="8" rx="1" fill={primary}/>
      <rect x="2" y="12" width="27" height="18" rx="1" fill={light}/>
      <rect x="31" y="12" width="27" height="18" rx="1" fill={light}/>
      <rect x="2" y="32" width="56" height="1" fill={primary} opacity="0.3"/>
      {[0,1,2,3].map(i=><rect key={i} x="2" y={35+i*5} width="56" height="3" rx="0.5" fill={primary} opacity={0.12+i*0.04}/>)}
      <rect x="2" y="56" width="56" height="6" rx="1" fill={light}/>
    </g>,
    modern:    <g>
      <rect x="2" y="2" width="56" height="3" rx="1.5" fill={primary}/>
      <text x="4" y="14" fontSize="7" fontWeight="900" fill={primary}>Company</text>
      <text x="40" y="14" fontSize="9" fontWeight="900" fill={primary}>INV</text>
      {[0,1,2,3].map(i=><rect key={i} x="2" y={20+i*6} width="56" height="3" rx="0.5" fill="#e2e8f0"/>)}
      <rect x="30" y="48" width="28" height="8" rx="2" fill={primary}/>
      <rect x="2" y="57" width="56" height="2" rx="1" fill={secondary}/>
    </g>,
    corporate: <g>
      <rect x="0" y="0" width="60" height="18" rx="1" fill={primary}/>
      <text x="4" y="11" fontSize="7" fontWeight="900" fill="white">COMPANY</text>
      <text x="40" y="12" fontSize="8" fontWeight="900" fill="white">INV</text>
      <rect x="2" y="20" width="27" height="10" rx="1" fill={light} stroke={secondary} strokeWidth="0.5"/>
      <rect x="31" y="20" width="27" height="10" rx="1" fill={light} stroke={secondary} strokeWidth="0.5"/>
      {[0,1,2,3].map(i=><rect key={i} x="2" y={33+i*5} width="56" height="3" rx="0.5" fill="#e2e8f0"/>)}
      <rect x="0" y="56" width="60" height="8" rx="0" fill={primary} opacity="0.9"/>
    </g>,
    elegant:   <g>
      <rect x="0" y="0" width="18" height="64" fill={primary}/>
      <text x="3" y="12" fontSize="5" fontWeight="900" fill="white" transform="rotate(-90 10,16)" style={{writingMode:'vertical-lr'}}>CO</text>
      {[0,1,2].map(i=><rect key={i} x="2" y={20+i*12} width="14" height="8" rx="1" fill="rgba(255,255,255,0.15)"/>)}
      <rect x="22" y="4" width="36" height="12" rx="2" fill={light}/>
      <text x="24" y="13" fontSize="8" fontWeight="900" fill={primary}>Invoice</text>
      {[0,1,2,3].map(i=><rect key={i} x="22" y={20+i*6} width="36" height="3" rx="0.5" fill="#e2e8f0"/>)}
      <rect x="35" y="48" width="23" height="10" rx="2" fill={primary}/>
    </g>,
    compact:   <g>
      <rect x="2" y="2" width="56" height="2" rx="1" fill={primary}/>
      <rect x="2" y="6" width="56" height="4" rx="0" fill={light}/>
      {[0,1,2,3,4].map(i=><rect key={i} x="2" y={12+i*4} width="56" height="2.5" rx="0.5" fill={i%2===0?'#f8fafc':'white'} stroke="#e2e8f0" strokeWidth="0.3"/>)}
      <rect x="2" y="35" width="2" height="2" fill={primary} opacity="0.5" rx="1"/>
      {[0,1,2,3].map(i=><rect key={i} x="6" y={35+i*3} width="50" height="2" rx="0.5" fill="#e2e8f0"/>)}
      <rect x="30" y="52" width="28" height="7" rx="1.5" fill={primary}/>
    </g>,
    creative:  <g>
      <rect x="0" y="0" width="60" height="26" rx="1" fill={primary}/>
      <circle cx="52" cy="20" r="16" fill={secondary} opacity="0.4"/>
      <circle cx="16" cy="-4" r="10" fill="rgba(255,255,255,0.08)"/>
      <text x="4" y="10" fontSize="7" fontWeight="900" fill="white">Company</text>
      <text x="4" y="21" fontSize="10" fontWeight="900" fill="white">INV-001</text>
      <path d="M0,24 Q30,32 60,24 L60,26 L0,26 Z" fill="white"/>
      <rect x="4" y="30" width="16" height="9" rx="1.5" fill={light} stroke={secondary} strokeWidth="0.5"/>
      <rect x="22" y="30" width="16" height="9" rx="1.5" fill={light} stroke={secondary} strokeWidth="0.5"/>
      <rect x="40" y="30" width="16" height="9" rx="1.5" fill={light} stroke={secondary} strokeWidth="0.5"/>
      {[0,1,2].map(i=><rect key={i} x="4" y={42+i*4} width="52" height="2.5" rx="0.5" fill="#e2e8f0"/>)}
      <rect x="30" y="54" width="26" height="7" rx="3.5" fill={`url(#g${tpl.id})`}/>
      <defs><linearGradient id={`g${tpl.id}`} x1="0" y1="0" x2="1" y2="0"><stop stopColor={primary}/><stop offset="1" stopColor={secondary}/></linearGradient></defs>
    </g>,
  };

  return (
    <div onClick={onClick} style={{
      cursor: 'pointer',
      borderRadius: 10,
      border: selected ? `2px solid ${primary}` : '2px solid transparent',
      background: selected ? `${light}` : 'transparent',
      padding: 6,
      transition: 'all 0.15s',
      position: 'relative',
    }}>
      <svg viewBox="0 0 60 64" width="100%" style={{ display: 'block', borderRadius: 6, background: 'white', boxShadow: '0 1px 6px rgba(0,0,0,0.10)' }}>
        {thumbs[tpl.id]}
      </svg>
      <div style={{ marginTop: 6, textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: selected ? 700 : 500, color: selected ? primary : '#374151', lineHeight: 1.3 }}>{tpl.name}</p>
        {tpl.badge && <span style={{ fontSize: 9, background: selected ? primary : '#f1f5f9', color: selected ? 'white' : '#64748b', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{tpl.badge}</span>}
      </div>
      {selected && (
        <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check style={{ width: 10, height: 10, color: 'white' }} />
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE DESIGN MODAL
// ════════════════════════════════════════════════════════════════════════════════
export const InvoiceDesignModal = ({
  open, onClose,
  selectedTemplate, onTemplateChange,
  selectedTheme, onThemeChange,
  customColor, onCustomColorChange,
  sampleInvoice, sampleCompany,
  isDark,
}) => {
  const [previewHtml, setPreviewHtml] = useState('');
  const iframeRef = useRef(null);

  const activeTheme = getThemeColor(selectedTheme, customColor);

  useEffect(() => {
    if (!open) return;
    const inv = sampleInvoice || makeSampleInvoice();
    const co  = sampleCompany  || makeSampleCompany();
    setPreviewHtml(generateInvoiceHTML(inv, co, selectedTemplate, selectedTheme, customColor));
  }, [open, selectedTemplate, selectedTheme, customColor, sampleInvoice, sampleCompany]);

  const handlePrint = useCallback(() => {
    const inv = sampleInvoice || makeSampleInvoice();
    const co  = sampleCompany  || makeSampleCompany();
    openInvoicePrint(inv, co, selectedTemplate, selectedTheme, customColor);
  }, [sampleInvoice, sampleCompany, selectedTemplate, selectedTheme, customColor]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-[90vw] w-[1100px] max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Invoice Design</DialogTitle>
        <DialogDescription className="sr-only">Choose invoice template and color theme</DialogDescription>

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${activeTheme.primary}, ${activeTheme.secondary})` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Layout className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Invoice Design Studio</h2>
              <p className="text-white/60 text-xs">Choose template · Pick colors · Preview & print</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left panel ── */}
          <div className={`w-[300px] flex-shrink-0 flex flex-col border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50/40'}`}>

            {/* Templates */}
            <div className="p-4 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}>
              <div className="flex items-center gap-2 mb-3">
                <Layout className="h-3.5 w-3.5" style={{ color: activeTheme.primary }} />
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeTheme.primary }}>Templates</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {INVOICE_TEMPLATES.map(tpl => (
                  <TemplateThumb
                    key={tpl.id}
                    tpl={tpl}
                    selected={selectedTemplate === tpl.id}
                    onClick={() => onTemplateChange(tpl.id)}
                    primary={activeTheme.primary}
                    secondary={activeTheme.secondary}
                    light={activeTheme.light}
                  />
                ))}
              </div>
            </div>

            {/* Color themes */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="h-3.5 w-3.5" style={{ color: activeTheme.primary }} />
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeTheme.primary }}>Color Theme</p>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {COLOR_THEMES.map(t => (
                  <button key={t.id} onClick={() => onThemeChange(t.id)}
                    title={t.name}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 8,
                      background: `linear-gradient(135deg, ${t.primary}, ${t.secondary})`,
                      border: selectedTheme === t.id ? `3px solid ${t.secondary}` : '3px solid transparent',
                      boxShadow: selectedTheme === t.id ? `0 0 0 2px white, 0 0 0 4px ${t.primary}` : 'none',
                      cursor: 'pointer', transition: 'all 0.15s',
                      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {selectedTheme === t.id && <Check style={{ width: 12, height: 12, color: 'white' }} />}
                  </button>
                ))}
              </div>
              {/* Color theme names */}
              <p className="text-[10px] text-slate-400 mb-3">
                Selected: <span className="font-semibold" style={{ color: activeTheme.primary }}>
                  {COLOR_THEMES.find(t => t.id === selectedTheme)?.name || 'Custom'}
                </span>
              </p>
              {/* Custom color */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Custom Color</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={customColor} onChange={e => { onCustomColorChange(e.target.value); onThemeChange('custom'); }}
                    className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
                  <Input value={customColor} onChange={e => { onCustomColorChange(e.target.value); onThemeChange('custom'); }}
                    className={`flex-1 h-9 rounded-xl text-xs font-mono ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} />
                </div>
              </div>
            </div>

            {/* Selected template info */}
            {(() => {
              const tpl = INVOICE_TEMPLATES.find(t => t.id === selectedTemplate);
              return tpl ? (
                <div className="mx-4 mb-4 rounded-xl p-3 border" style={{ background: activeTheme.light, borderColor: activeTheme.accent }}>
                  <p className="text-xs font-bold" style={{ color: activeTheme.primary }}>{tpl.name}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{tpl.desc}</p>
                </div>
              ) : null;
            })()}
          </div>

          {/* ── Right: Live Preview ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className={`flex-shrink-0 flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500">Live Preview</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">A4 · Sample data</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePrint} size="sm"
                  className="h-8 px-4 rounded-xl text-white text-xs font-semibold gap-1.5"
                  style={{ background: `linear-gradient(135deg, ${activeTheme.primary}, ${activeTheme.secondary})` }}>
                  <Printer className="h-3.5 w-3.5" /> Print Preview
                </Button>
                <Button onClick={onClose} size="sm" variant="outline"
                  className="h-8 px-4 rounded-xl text-xs">
                  Save & Close
                </Button>
              </div>
            </div>

            {/* iframe preview */}
            <div className="flex-1 overflow-auto p-4" style={{ background: isDark ? '#1e293b' : '#e2e8f0' }}>
              <div style={{ maxWidth: 794, margin: '0 auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', borderRadius: 4, overflow: 'hidden', background: 'white' }}>
                <iframe
                  ref={iframeRef}
                  srcDoc={previewHtml}
                  title="Invoice Preview"
                  style={{ width: '100%', height: 1120, border: 'none', display: 'block' }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// SAMPLE DATA for preview when no real invoice is provided
// ════════════════════════════════════════════════════════════════════════════════
function makeSampleInvoice() {
  return {
    invoice_no: 'INV/2025-26/0042',
    invoice_type: 'tax_invoice',
    invoice_date: '2025-07-15',
    due_date: '2025-08-14',
    client_name: 'Sunrise Technologies Pvt. Ltd.',
    client_address: '14 Patel Nagar, Ahmedabad, Gujarat - 380009',
    client_email: 'accounts@sunrise.in',
    client_phone: '9876543210',
    client_gstin: '24AABCS1429B1Z5',
    client_state: 'Gujarat',
    payment_terms: 'Net 30 Days',
    reference_no: 'PO/2025/1138',
    is_interstate: false,
    notes: 'Payment via NEFT/RTGS to the bank details mentioned.',
    terms_conditions: 'Goods once sold will not be taken back. Subject to Ahmedabad jurisdiction.',
    items: [
      { description: 'GST Consultation & Filing Services', hsn_sac: '9983', quantity: 1, unit: 'month', unit_price: 15000, discount_pct: 0, gst_rate: 18, taxable_value: 15000, cgst_rate: 9, sgst_rate: 9, igst_rate: 0, cgst_amount: 1350, sgst_amount: 1350, igst_amount: 0, total_amount: 17700 },
      { description: 'Income Tax Return Filing (Individual)', hsn_sac: '9983', quantity: 3, unit: 'nos', unit_price: 2500, discount_pct: 10, gst_rate: 18, taxable_value: 6750, cgst_rate: 9, sgst_rate: 9, igst_rate: 0, cgst_amount: 607.5, sgst_amount: 607.5, igst_amount: 0, total_amount: 7965 },
      { description: 'ROC Annual Compliance Package', hsn_sac: '9983', quantity: 1, unit: 'service', unit_price: 8500, discount_pct: 0, gst_rate: 18, taxable_value: 8500, cgst_rate: 9, sgst_rate: 9, igst_rate: 0, cgst_amount: 765, sgst_amount: 765, igst_amount: 0, total_amount: 10030 },
    ],
    subtotal: 31000,
    total_discount: 750,
    total_taxable: 30250,
    total_cgst: 2722.5,
    total_sgst: 2722.5,
    total_igst: 0,
    total_gst: 5445,
    grand_total: 35695,
    amount_paid: 10000,
    amount_due: 25695,
    shipping_charges: 0,
    other_charges: 0,
  };
}

function makeSampleCompany() {
  return {
    name: 'Manthan Desai & Associates',
    address: '302, Shivalay Complex, Ring Road, Surat - 395002, Gujarat',
    gstin: '24AABCM1234F1ZA',
    phone: '0261-2345678',
    bank_name: 'HDFC Bank',
    bank_account: '50200012345678',
    bank_ifsc: 'HDFC0001234',
    upi_id: 'manthandesai@hdfcbank',
  };
}
