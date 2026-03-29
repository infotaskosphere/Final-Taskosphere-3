/**
 * InvoiceTemplates.jsx  —  Complete Vyapar-faithful edition
 *
 * ALL 14 Vyapar invoice themes for regular printers:
 *   Regular A4:
 *   1.  classic        → Vyapar Classic/Standard (solid blue bar header)
 *   2.  theme2         → Theme 2  (two-row compact header with box)
 *   3.  theme3         → Theme 3  (bordered box: company left, invoice right)
 *   4.  theme4         → Theme 4  (centered company + big invoice banner)
 *   5.  theme5         → Theme 5  (stripe + white info cards)
 *   6.  theme6         → Theme 6  (full-width gradient banner)
 *   7.  theme7         → Theme 7  (left sidebar + white main)
 *   8.  theme8         → Theme 8  (minimal white + accent corner)
 *   9.  frenchelite    → French Elite (premium — amber double-border)
 *   10. doubledivine   → Double Divine (premium — two-tone split panels)
 *   11. landscape      → Landscape (landscape-first wide layout)
 *   12. gsttheme1      → GST Theme 1 (GSTIN-emphasis, taxable summary)
 *   13. gsttheme3      → GST Theme 3 (itemised GST table focus)
 *   14. tallytheme     → Tally Theme (Tally-like monochrome accounting)
 *
 *  + 2 thermal printer themes (A3 57mm/80mm rolls)
 *   15. thermal1       → Thermal Theme 1
 *   16. thermal2       → Thermal Theme 2
 *
 * Features every theme includes:
 *   • Logo zone (image or auto SVG initials badge)
 *   • Full GST: CGST/SGST (intra) or IGST (inter)
 *   • Bill To + Ship To columns
 *   • Place of Supply, HSN/SAC, item discounts, round-off
 *   • Amount in words (Indian crore/lakh system)
 *   • Bank details + UPI QR code (via api.qrserver.com)
 *   • Authorised signatory space
 *   • Terms & Conditions
 *
 * Exports:
 *   COLOR_THEMES, INVOICE_TEMPLATES
 *   generateInvoiceHTML(), openInvoicePrint()
 *   InvoiceDesignModal
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { X, Printer, Eye, Check, Palette, Layout } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// 1. COLOR THEMES
// ═══════════════════════════════════════════════════════════════

export const COLOR_THEMES = [
  { id: 'blue',    name: 'Vyapar Blue',   primary: '#1565C0', secondary: '#1976D2', light: '#E3F2FD', accent: '#90CAF9' },
  { id: 'teal',    name: 'Teal',          primary: '#00695C', secondary: '#00897B', light: '#E0F2F1', accent: '#80CBC4' },
  { id: 'indigo',  name: 'Indigo',        primary: '#283593', secondary: '#3949AB', light: '#E8EAF6', accent: '#9FA8DA' },
  { id: 'amber',   name: 'Amber Gold',    primary: '#E65100', secondary: '#EF6C00', light: '#FFF3E0', accent: '#FFCC80' },
  { id: 'crimson', name: 'Crimson',       primary: '#B71C1C', secondary: '#C62828', light: '#FFEBEE', accent: '#EF9A9A' },
  { id: 'forest',  name: 'Forest Green',  primary: '#1B5E20', secondary: '#2E7D32', light: '#E8F5E9', accent: '#A5D6A7' },
  { id: 'slate',   name: 'Slate',         primary: '#263238', secondary: '#37474F', light: '#ECEFF1', accent: '#B0BEC5' },
  { id: 'purple',  name: 'Royal Purple',  primary: '#4A148C', secondary: '#6A1B9A', light: '#F3E5F5', accent: '#CE93D8' },
];

// ═══════════════════════════════════════════════════════════════
// 2. TEMPLATE METADATA
// ═══════════════════════════════════════════════════════════════

export const INVOICE_TEMPLATES = [
  { id:'classic',     name:'Classic',       desc:'Default Vyapar look. Solid colour header bar, logo left, invoice number right.',           badge:'Default',  thermal:false },
  { id:'theme2',      name:'Theme 2',        desc:'Two-row compact header. Company strip on top, invoice meta row below.',                     badge:'Clean',    thermal:false },
  { id:'theme3',      name:'Theme 3',        desc:'Fully bordered box header. Company box left, invoice details box right.',                   badge:'Boxed',    thermal:false },
  { id:'theme4',      name:'Theme 4',        desc:'Centered company details at top with large coloured invoice-number banner.',                badge:'Centred',  thermal:false },
  { id:'theme5',      name:'Theme 5',        desc:'Wide colour stripe with three floating info cards underneath.',                             badge:'Cards',    thermal:false },
  { id:'theme6',      name:'Theme 6',        desc:'Full-width gradient hero, circular logo ring, three shadow cards.',                        badge:'Gradient', thermal:false },
  { id:'theme7',      name:'Theme 7',        desc:'Coloured left sidebar contains logo + client + bank. White right panel for items.',        badge:'Sidebar',  thermal:false },
  { id:'theme8',      name:'Theme 8',        desc:'Ultra-minimal white. Colour accent top strip, logo top-right, typographic layout.',        badge:'Minimal',  thermal:false },
  { id:'frenchelite', name:'French Elite',   desc:'Premium theme. Warm amber double-rule border, elegant two-zone header.',                   badge:'Elite ★',  thermal:false },
  { id:'doubledivine',name:'Double Divine',  desc:'Premium theme. Two equal coloured panels side-by-side in header.',                        badge:'Divine ★', thermal:false },
  { id:'landscape',   name:'Landscape',      desc:'Same as Classic but optimised for A4 landscape (horizontal) printing.',                    badge:'Wide',     thermal:false },
  { id:'gsttheme1',   name:'GST Theme 1',    desc:'GSTIN-emphasis layout. Separate HSN summary table at bottom.',                            badge:'GST',      thermal:false },
  { id:'gsttheme3',   name:'GST Theme 3',    desc:'Full itemised GST column layout, tax-rate grouped summary.',                              badge:'GST+',     thermal:false },
  { id:'tallytheme',  name:'Tally Theme',    desc:'Tally-style monochrome accounting layout. Familiar to Tally users.',                      badge:'Tally',    thermal:false },
  { id:'thermal1',    name:'Thermal 1',      desc:'58mm/80mm thermal roll. Compact company header, items, totals in single column.',         badge:'Thermal',  thermal:true  },
  { id:'thermal2',    name:'Thermal 2',      desc:'80mm thermal roll. Bold company name, QR code, itemised totals.',                         badge:'Thermal',  thermal:true  },
];

// ═══════════════════════════════════════════════════════════════
// 3. UTILITIES
// ═══════════════════════════════════════════════════════════════

const fmtN = (n) => new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n??0);
const fmtC = (n) => `₹${fmtN(n)}`;

function amountToWords(amount){
  const num=Math.round(amount);
  if(num===0)return'Zero Rupees Only';
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function conv(n){
    if(n===0)return'';
    if(n<20)return ones[n]+' ';
    if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:'')+' ';
    return ones[Math.floor(n/100)]+' Hundred '+conv(n%100);
  }
  const cr=Math.floor(num/10000000),lk=Math.floor((num%10000000)/100000),th=Math.floor((num%100000)/1000),re=num%1000;
  let r='';
  if(cr)r+=conv(cr)+'Crore ';
  if(lk)r+=conv(lk)+'Lakh ';
  if(th)r+=conv(th)+'Thousand ';
  if(re)r+=conv(re);
  return r.trim()+' Rupees Only';
}

function getThemeColor(selectedTheme,customColor){
  if(selectedTheme==='custom')return{primary:customColor,secondary:customColor,light:'#F8FAFC',accent:'#CBD5E1'};
  return COLOR_THEMES.find(t=>t.id===selectedTheme)||COLOR_THEMES[0];
}

// ═══════════════════════════════════════════════════════════════
// 4. LOGO HELPER
// ═══════════════════════════════════════════════════════════════

function getLogoHTML(company,theme,size=52,shape='rounded',variant='on-white'){
  const rawName=(company?.name||'CO').trim();
  const words=rawName.split(/\s+/);
  const initials=words.length>=2?(words[0][0]+words[words.length-1][0]).toUpperCase():rawName.slice(0,2).toUpperCase();
  const r=shape==='circle'?size/2:shape==='sharp'?3:size*0.22;
  const bgFill=variant==='on-color'?'rgba(255,255,255,0.20)':theme.primary;
  const rimColor=variant==='on-color'?'rgba(255,255,255,0.40)':theme.secondary;
  const fs=size*0.37;
  if(company?.logo_url){
    const f=variant==='on-color'?'brightness(0) invert(1)':'none';
    return`<img src="${company.logo_url}" alt="${rawName}" style="height:${size}px;width:auto;max-width:${size*3}px;object-fit:contain;filter:${f};display:block;"/>`;
  }
  return`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;"><rect width="${size}" height="${size}" rx="${r}" fill="${bgFill}"/><rect x="2.5" y="2.5" width="${size-5}" height="${size-5}" rx="${Math.max(r-2,1)}" fill="none" stroke="${rimColor}" stroke-width="1.5"/><text x="${size/2}" y="${size/2+fs*0.38}" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="white" letter-spacing="1">${initials}</text></svg>`;
}

// ═══════════════════════════════════════════════════════════════
// 5. QR CODE HELPER
// ═══════════════════════════════════════════════════════════════

function buildUpiUrl(company,amount){
  if(!company?.upi_id)return'';
  const name=encodeURIComponent(company.name||'Merchant');
  const pa=encodeURIComponent(company.upi_id);
  const am=amount?`&am=${parseFloat(amount).toFixed(2)}`:'';
  return`upi://pay?pa=${pa}&pn=${name}${am}&cu=INR`;
}
function getQrHTML(upiUrl,size=88){
  if(!upiUrl)return'';
  const enc=encodeURIComponent(upiUrl);
  return`<img src="https://api.qrserver.com/v1/create-qr-code/?data=${enc}&size=${size}x${size}&qzone=1&margin=0" alt="UPI QR" style="width:${size}px;height:${size}px;display:block;border-radius:4px;border:1px solid #E0E0E0;"/>`;
}

// ═══════════════════════════════════════════════════════════════
// 6. SHARED BUILDERS
// ═══════════════════════════════════════════════════════════════

const BASE_CSS=`*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#212121;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;}table{width:100%;border-collapse:collapse;}@media print{body{margin:0;}@page{size:A4;margin:8mm;}}`;
const BASE_CSS_LAND=`*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#212121;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact;}table{width:100%;border-collapse:collapse;}@media print{body{margin:0;}@page{size:A4 landscape;margin:6mm;}}`;

function itemsTableHTML(inv,p,light,compact=false){
  const isInter=inv.is_interstate;
  const items=inv.items||[];
  const pad=compact?'5px 5px':'7px 6px';
  const fs=compact?'10px':'11px';
  return`<table class="itbl"><thead><tr>
    <th style="width:20px">#</th>
    <th style="text-align:left">Description</th>
    <th>HSN/SAC</th>
    <th>Qty</th>
    <th>Unit</th>
    <th>Rate (₹)</th>
    <th>Disc%</th>
    <th>Taxable (₹)</th>
    <th>GST%</th>
    ${isInter?'<th>IGST (₹)</th>':'<th>CGST (₹)</th><th>SGST (₹)</th>'}
    <th>Amount (₹)</th>
  </tr></thead><tbody>
  ${items.map((it,i)=>`<tr class="${i%2===1?'alt':''}">
    <td class="c">${i+1}</td>
    <td class="desc">${it.description||''}</td>
    <td class="c">${it.hsn_sac||''}</td>
    <td class="r">${fmtN(it.quantity)}</td>
    <td class="c">${it.unit||''}</td>
    <td class="r">${fmtN(it.unit_price)}</td>
    <td class="c">${it.discount_pct||0}%</td>
    <td class="r">${fmtN(it.taxable_value)}</td>
    <td class="c">${it.gst_rate||0}%</td>
    ${isInter?`<td class="r">${fmtN(it.igst_amount)}</td>`:`<td class="r">${fmtN(it.cgst_amount)}</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
    <td class="r bld">${fmtN(it.total_amount)}</td>
  </tr>`).join('')}
  </tbody></table>`;
}

function totalsHTML(inv){
  const isInter=inv.is_interstate;
  const ro=inv.round_off||0;
  return`<table class="ttbl">
    <tr><td class="lbl">Sub Total</td><td class="val">${fmtC(inv.subtotal)}</td></tr>
    ${(inv.total_discount||0)>0?`<tr><td class="lbl red">(-) Discount</td><td class="val red">- ${fmtC(inv.total_discount)}</td></tr>`:''}
    <tr><td class="lbl">Taxable Value</td><td class="val">${fmtC(inv.total_taxable)}</td></tr>
    ${isInter?`<tr><td class="lbl">IGST</td><td class="val">${fmtC(inv.total_igst)}</td></tr>`:`<tr><td class="lbl">CGST</td><td class="val">${fmtC(inv.total_cgst)}</td></tr><tr><td class="lbl">SGST / UTGST</td><td class="val">${fmtC(inv.total_sgst)}</td></tr>`}
    ${(inv.shipping_charges||0)>0?`<tr><td class="lbl">Shipping</td><td class="val">${fmtC(inv.shipping_charges)}</td></tr>`:''}
    ${ro!==0?`<tr><td class="lbl">Round Off</td><td class="val">${ro>0?'+':''}${fmtC(ro)}</td></tr>`:''}
    <tr class="grand"><td>Total</td><td>${fmtC(inv.grand_total)}</td></tr>
    ${(inv.amount_paid||0)>0?`<tr><td class="lbl grn">Received</td><td class="val grn">${fmtC(inv.amount_paid)}</td></tr>`:''}
    ${(inv.amount_due||0)>0?`<tr><td class="lbl due">Balance Due</td><td class="val due">${fmtC(inv.amount_due)}</td></tr>`:''}
  </table>`;
}

function bankQrHTML(company,inv,showQr=true){
  const qr=showQr?getQrHTML(buildUpiUrl(company,inv.grand_total),82):'';
  if(!company?.bank_name&&!company?.upi_id)return qr?`<div style="text-align:center">${qr}<div style="font-size:8px;color:#9E9E9E;margin-top:3px">Scan to Pay via UPI</div></div>`:'';
  return`<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
    <div style="flex:1">
      <div style="font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#9E9E9E;margin-bottom:5px">Bank Details</div>
      ${company.bank_name?`<div style="font-size:10.5px;margin-bottom:2px"><span style="color:#9E9E9E;min-width:62px;display:inline-block">Bank</span><strong>${company.bank_name}</strong></div>`:''}
      ${company.bank_account?`<div style="font-size:10.5px;margin-bottom:2px"><span style="color:#9E9E9E;min-width:62px;display:inline-block">A/c No.</span><strong>${company.bank_account}</strong></div>`:''}
      ${company.bank_ifsc?`<div style="font-size:10.5px;margin-bottom:2px"><span style="color:#9E9E9E;min-width:62px;display:inline-block">IFSC</span><strong>${company.bank_ifsc}</strong></div>`:''}
      ${company.upi_id?`<div style="font-size:10.5px"><span style="color:#9E9E9E;min-width:62px;display:inline-block">UPI ID</span><strong>${company.upi_id}</strong></div>`:''}
    </div>
    ${qr?`<div style="text-align:center;flex-shrink:0">${qr}<div style="font-size:8px;color:#9E9E9E;margin-top:2px">Scan to Pay</div></div>`:''}
  </div>`;
}

function signRow(company,inv){
  return`<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;padding-top:8px;border-top:1px solid #E0E0E0">
    <div style="font-size:9.5px;color:#757575;max-width:60%;line-height:1.7">
      ${inv.notes?`<strong>Notes:</strong> ${inv.notes}<br>`:''}
      ${inv.terms_conditions?`<strong>T&amp;C:</strong> ${inv.terms_conditions}`:''}
      ${!inv.notes&&!inv.terms_conditions?'<em>Thanks for doing business with us!</em>':''}
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;color:#9E9E9E">For&nbsp;${company?.name||'Your Company'}</div>
      <div style="border-top:1px solid #9E9E9E;margin-top:34px;padding-top:5px;font-size:9.5px;color:#9E9E9E">Authorised Signatory</div>
    </div>
  </div>`;
}

function partyBoxes(inv,p){
  return`<div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #E0E0E0;border-radius:4px;overflow:hidden;margin-bottom:8px">
    <div style="padding:9px 12px;border-right:1px solid #E0E0E0">
      <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #E0E0E0">Bill To</div>
      <div style="font-size:12.5px;font-weight:700;color:#212121;margin-bottom:3px">${inv.client_name||'—'}</div>
      <div style="font-size:10.5px;color:#424242;line-height:1.65">${inv.client_address||''}</div>
      ${inv.client_email?`<div style="font-size:10px;color:#424242">✉ ${inv.client_email}</div>`:''}
      ${inv.client_phone?`<div style="font-size:10px;color:#424242">📞 ${inv.client_phone}</div>`:''}
      ${inv.client_gstin?`<div style="display:inline-block;background:${p};color:white;font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;margin-top:3px">GSTIN&nbsp;${inv.client_gstin}</div>`:''}
    </div>
    <div style="padding:9px 12px">
      <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #E0E0E0">Ship To</div>
      <div style="font-size:12.5px;font-weight:700;color:#212121;margin-bottom:3px">${inv.ship_name||inv.client_name||'—'}</div>
      <div style="font-size:10.5px;color:#424242;line-height:1.65">${inv.ship_address||inv.client_address||''}</div>
      ${inv.payment_terms?`<div style="margin-top:6px;font-size:10px"><strong>Terms:</strong> ${inv.payment_terms}</div>`:''}
      ${inv.reference_no?`<div style="font-size:10px"><strong>PO/Ref:</strong> ${inv.reference_no}</div>`:''}
    </div>
  </div>`;
}

function metaRow(inv,p,light,accent){
  const isInter=inv.is_interstate;
  const cells=[
    {k:'Invoice No.',v:inv.invoice_no||'—'},
    {k:'Date',v:inv.invoice_date||'—'},
    inv.due_date?{k:'Due Date',v:inv.due_date}:null,
    {k:'Place of Supply',v:inv.client_state||inv.place_of_supply||'—'},
    {k:'Supply Type',v:isInter?'Interstate':'Intrastate'},
  ].filter(Boolean);
  return`<div style="display:flex;border:1px solid #E0E0E0;border-radius:4px;overflow:hidden;margin-bottom:8px">
    ${cells.map(c=>`<div style="flex:1;padding:6px 10px;border-right:1px solid #E0E0E0">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9E9E9E;margin-bottom:2px">${c.k}</div>
      <div style="font-size:10.5px;font-weight:700;color:#212121">${c.v}</div>
    </div>`).join('')}
    <div style="flex:1;padding:6px 10px">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9E9E9E;margin-bottom:2px">Invoice Type</div>
      <div style="font-size:10.5px;font-weight:700;color:#212121">Tax Invoice</div>
    </div>
  </div>`;
}

function wordsBox(inv,p,light,accent){
  return`<div style="background:${light};border:1px solid ${accent};border-radius:4px;padding:7px 10px;margin-bottom:8px">
    <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${p};margin-bottom:2px">Invoice Amount in Words</div>
    <div style="font-size:10.5px;font-weight:600;color:#212121">${amountToWords(inv.grand_total||0)}</div>
  </div>`;
}

// Shared table CSS used in most themes
function itemTableCSS(p,light){
  return`table.itbl{border:1px solid #CFD8DC;border-radius:4px;overflow:hidden;margin-bottom:0}
table.itbl thead tr{background:${p}}
table.itbl thead th{color:white;padding:7px 5px;font-size:9px;font-weight:700;text-align:center;white-space:nowrap}
table.itbl tbody tr{}
table.itbl tbody tr.alt{background:${light}}
table.itbl tbody td{padding:6px 5px;font-size:10.5px;border-bottom:1px solid #ECEFF1;color:#424242;vertical-align:top}
table.itbl tbody td.r{text-align:right}
table.itbl tbody td.c{text-align:center}
table.itbl tbody td.desc{font-weight:600;color:#212121}
table.itbl tbody td.bld{font-weight:700;color:#212121}
table.ttbl{width:100%}
table.ttbl td{padding:3.5px 6px;font-size:10.5px}
table.ttbl .lbl{color:#616161;text-align:right}
table.ttbl .val{text-align:right;font-weight:600;color:#212121}
table.ttbl .red{color:#E53935}
table.ttbl .grn{color:#2E7D32}
table.ttbl .due{color:#C62828;font-weight:700}
table.ttbl .grand{background:${p};border-radius:3px}
table.ttbl .grand td{color:white;font-size:13px;font-weight:800;padding:7px 8px}`;
}

// ═══════════════════════════════════════════════════════════════
// 7.  TEMPLATE FUNCTIONS  (one per theme)
// ═══════════════════════════════════════════════════════════════

// ── 7.1  CLASSIC  ──────────────────────────────────────────────
function tplClassic(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,54,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.hdr{background:${p};display:flex;align-items:center;padding:12px 16px;gap:14px}
.co-name{font-size:17px;font-weight:800;color:white}
.co-sub{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px;line-height:1.6}
.co-gstin{display:inline-block;margin-top:4px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:3px}
.inv-r{text-align:right;flex-shrink:0}
.inv-type{font-size:8.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:3px}
.inv-no{font-size:20px;font-weight:900;color:white}
.inv-meta{font-size:9.5px;color:rgba(255,255,255,0.65);margin-top:3px;line-height:1.7}
.body{padding:10px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  ${logo}
  <div style="flex:1">
    <div class="co-name">${company?.name||'Your Company'}</div>
    <div class="co-sub">${company?.address||''}</div>
    ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
    ${company?.phone?`<span class="co-gstin" style="margin-left:4px">📞&nbsp;${company.phone}</span>`:''}
  </div>
  <div class="inv-r">
    <div class="inv-type">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-meta">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">
      ${wordsBox(inv,p,l,a)}
      ${bankQrHTML(company,inv)}
    </div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.2  THEME 2  ──────────────────────────────────────────────
function tplTheme2(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,48,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.strip1{background:${p};padding:8px 16px;display:flex;align-items:center;justify-content:space-between}
.co-name{font-size:17px;font-weight:800;color:white}
.tax-lbl{font-size:9px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.65)}
.strip2{background:${l};border:1px solid ${a};padding:8px 16px;display:flex;align-items:center;gap:14px}
.s2-logo{flex-shrink:0}
.s2-addr{flex:1;font-size:10px;color:#424242;line-height:1.65}
.s2-addr .gstin{display:inline-block;background:${p};color:white;font-size:8px;font-weight:700;padding:1px 6px;border-radius:2px;margin-top:3px}
.s2-inv{text-align:right;flex-shrink:0}
.inv-no{font-size:22px;font-weight:900;color:${p}}
.inv-dt{font-size:9.5px;color:#616161;margin-top:2px;line-height:1.6}
.body{padding:10px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="strip1">
  <div class="co-name">${company?.name||'Your Company'}</div>
  <div class="tax-lbl">Tax Invoice</div>
</div>
<div class="strip2">
  <div class="s2-logo">${logo}</div>
  <div class="s2-addr">
    ${company?.address||''}<br>
    ${company?.phone?`📞 ${company.phone}&nbsp;&nbsp;`:''}
    ${company?.gstin?`<span class="gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
  </div>
  <div class="s2-inv">
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.3  THEME 3  ──────────────────────────────────────────────
function tplTheme3(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,52,'rounded','on-white');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto;border:2px solid ${p}}
.hdr{display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid ${p}}
.hl{padding:14px 16px;display:flex;align-items:center;gap:12px}
.co-name{font-size:17px;font-weight:800;color:${p}}
.co-sub{font-size:9.5px;color:#616161;margin-top:3px;line-height:1.65}
.co-gstin{display:inline-block;margin-top:4px;background:${l};border:1px solid ${a};color:${p};font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:3px}
.hr{background:${p};padding:14px 16px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end}
.inv-type{font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px}
.inv-no{font-size:22px;font-weight:900;color:white}
.inv-dt{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:4px;text-align:right;line-height:1.7}
.body{padding:10px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  <div class="hl">
    ${logo}
    <div>
      <div class="co-name">${company?.name||'Your Company'}</div>
      <div class="co-sub">${company?.address||''}</div>
      ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
    </div>
  </div>
  <div class="hr">
    <div class="inv-type">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.4  THEME 4  ──────────────────────────────────────────────
function tplTheme4(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,58,'circle','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.hdr{background:${p};padding:16px 20px;display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden}
.hdr::before{content:'';position:absolute;top:-50px;right:-50px;width:180px;height:180px;background:rgba(255,255,255,0.05);border-radius:50%}
.hdr-row{display:flex;align-items:center;gap:16px;position:relative}
.co-name{font-size:20px;font-weight:900;color:white;letter-spacing:-0.3px}
.co-sub{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px;line-height:1.6}
.co-gstin{display:inline-block;margin-top:4px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:3px}
.inv-banner{background:rgba(0,0,0,0.25);border-radius:8px;padding:8px 24px;margin-top:10px;text-align:center;position:relative}
.inv-banner-type{font-size:9px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:3px}
.inv-banner-no{font-size:24px;font-weight:900;color:white}
.inv-banner-dt{font-size:9.5px;color:rgba(255,255,255,0.65);margin-top:3px}
.body{padding:10px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  <div class="hdr-row">
    ${logo}
    <div>
      <div class="co-name">${company?.name||'Your Company'}</div>
      <div class="co-sub">${company?.address||''}</div>
      ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
      ${company?.phone?`<span class="co-gstin" style="margin-left:4px">📞&nbsp;${company.phone}</span>`:''}
    </div>
  </div>
  <div class="inv-banner">
    <div class="inv-banner-type">Tax Invoice</div>
    <div class="inv-banner-no">${inv.invoice_no||'—'}</div>
    <div class="inv-banner-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?` &nbsp;·&nbsp; Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.5  THEME 5  ──────────────────────────────────────────────
function tplTheme5(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,48,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.stripe{background:${p};display:flex;align-items:center;justify-content:space-between;padding:10px 16px}
.co-block{display:flex;align-items:center;gap:12px}
.co-name{font-size:16px;font-weight:800;color:white}
.co-sub{font-size:9px;color:rgba(255,255,255,0.65);margin-top:2px}
.inv-pill{display:inline-block;background:rgba(255,255,255,0.2);border:1.5px solid rgba(255,255,255,0.35);color:white;font-size:8.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:4px 14px;border-radius:20px}
.inv-no{font-size:22px;font-weight:900;color:white;text-align:right;margin-top:3px}
.inv-dt{font-size:9px;color:rgba(255,255,255,0.65);text-align:right}
.cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 14px}
.card{background:white;border:1px solid #E0E0E0;border-top:3px solid ${s};border-radius:0 0 6px 6px;padding:10px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.06)}
.card h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:5px}
.card .cn{font-size:12px;font-weight:700;color:#212121;margin-bottom:2px}
.card p{font-size:10px;color:#424242;line-height:1.65}
.body{padding:0 14px 10px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="stripe">
  <div class="co-block">
    ${logo}
    <div>
      <div class="co-name">${company?.name||'Your Company'}</div>
      <div class="co-sub">${company?.address||''}</div>
      ${company?.gstin?`<div style="font-size:8.5px;color:rgba(255,255,255,0.7);margin-top:2px">GSTIN&nbsp;${company.gstin}</div>`:''}
    </div>
  </div>
  <div>
    <div class="inv-pill">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?` · Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="cards">
  <div class="card"><h4>Bill To</h4><div class="cn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_gstin?`<p style="margin-top:3px;font-size:9px;font-weight:700;color:${p}">GSTIN: ${inv.client_gstin}</p>`:''}</div>
  <div class="card"><h4>Ship To</h4><div class="cn">${inv.ship_name||inv.client_name||'—'}</div><p>${inv.ship_address||inv.client_address||''}</p></div>
  <div class="card"><h4>Invoice Details</h4><p><strong>Terms:</strong> ${inv.payment_terms||'Due on receipt'}</p><p><strong>Supply:</strong> ${inv.is_interstate?'Interstate (IGST)':'Intrastate (CGST+SGST)'}</p>${inv.reference_no?`<p><strong>Ref:</strong> ${inv.reference_no}</p>`:''}</div>
</div>
<div class="body">
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.6  THEME 6 — GRADIENT BANNER  ────────────────────────────
function tplTheme6(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,58,'circle','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto;overflow:hidden}
.banner{background:linear-gradient(130deg,${p} 0%,${s} 100%);padding:20px 20px 42px;position:relative;overflow:hidden}
.banner::before{content:'';position:absolute;top:-60px;left:-40px;width:200px;height:200px;background:rgba(255,255,255,0.05);border-radius:50%}
.banner::after{content:'';position:absolute;bottom:-25px;right:60px;width:140px;height:140px;background:rgba(255,255,255,0.07);border-radius:50%}
.banner-inner{display:flex;justify-content:space-between;align-items:center;position:relative}
.ring{width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,0.2);border:2.5px solid rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.co-block{display:flex;align-items:center;gap:14px}
.co-name{font-size:19px;font-weight:900;color:white}
.co-sub{font-size:9.5px;color:rgba(255,255,255,0.65);margin-top:3px;line-height:1.6}
.co-gstin{display:inline-block;margin-top:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:white;font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:10px}
.inv-r{text-align:right;position:relative}
.inv-pill{display:inline-block;background:rgba(255,255,255,0.18);border:1.5px solid rgba(255,255,255,0.35);color:white;font-size:8.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:4px 14px;border-radius:20px;margin-bottom:6px}
.inv-no{font-size:26px;font-weight:900;color:white;line-height:1}
.inv-dt{font-size:9.5px;color:rgba(255,255,255,0.65);margin-top:4px;line-height:1.7}
.float-cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0 14px;margin-top:-22px;margin-bottom:10px}
.fc{background:white;border-radius:8px;padding:12px 13px;box-shadow:0 3px 14px rgba(0,0,0,0.10)}
.fc h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${s};margin-bottom:5px}
.fc .cn{font-size:12px;font-weight:700;color:#212121;margin-bottom:2px}
.fc p{font-size:10px;color:#424242;line-height:1.65}
.body{padding:0 14px 10px}
.brow{display:grid;grid-template-columns:1fr 250px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
table.ttbl .grand{background:linear-gradient(135deg,${p},${s})}
</style></head><body><div class="page">
<div class="banner">
  <div class="banner-inner">
    <div class="co-block">
      <div class="ring">${logo}</div>
      <div>
        <div class="co-name">${company?.name||'Your Company'}</div>
        <div class="co-sub">${company?.address||''}</div>
        ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
      </div>
    </div>
    <div class="inv-r">
      <div class="inv-pill">Tax Invoice</div>
      <div class="inv-no">${inv.invoice_no||'—'}</div>
      <div class="inv-dt">Issued: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
    </div>
  </div>
</div>
<div class="float-cards">
  <div class="fc"><h4>Bill To</h4><div class="cn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_gstin?`<p style="color:${p};font-size:9px;font-weight:700;margin-top:2px">GSTIN: ${inv.client_gstin}</p>`:''}</div>
  <div class="fc"><h4>Ship To</h4><div class="cn">${inv.ship_name||inv.client_name||'—'}</div><p>${inv.ship_address||inv.client_address||''}</p></div>
  <div class="fc"><h4>Invoice Info</h4><p><strong>Terms:</strong> ${inv.payment_terms||'Due on receipt'}</p><p><strong>Type:</strong> ${inv.is_interstate?'Interstate (IGST)':'CGST+SGST'}</p>${inv.reference_no?`<p><strong>Ref:</strong> ${inv.reference_no}</p>`:''}</div>
</div>
<div class="body">
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.7  THEME 7 — SIDEBAR  ────────────────────────────────────
function tplTheme7(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,54,'rounded','on-color');
  const qr=getQrHTML(buildUpiUrl(company,inv.grand_total),80);
  const isInter=inv.is_interstate;
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto;min-height:297mm;display:flex}
.sidebar{width:62mm;flex-shrink:0;background:${p};color:white;padding:18px 14px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.sidebar::after{content:'';position:absolute;bottom:-40px;right:-40px;width:130px;height:130px;background:${s};border-radius:50%;opacity:0.2}
.sb-logo{margin-bottom:12px}
.sb-name{font-size:15px;font-weight:900;line-height:1.2;margin-bottom:4px}
.sb-addr{font-size:9px;opacity:0.65;line-height:1.7}
.sb-tag{display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);font-size:8.5px;font-weight:700;padding:2px 8px;border-radius:3px;margin-top:5px}
.sb-div{border:none;border-top:1px solid rgba(255,255,255,0.18);margin:12px 0}
.sb-sec{margin-bottom:14px;position:relative}
.sb-sec h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:2px;opacity:0.5;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.15);padding-bottom:4px}
.sb-sec p{font-size:10px;opacity:0.85;line-height:1.75}
.sb-sec .sn{font-size:11px;font-weight:700;opacity:1}
.main{flex:1;padding:18px 16px;background:white}
.main-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid ${l}}
.inv-type{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:2.5px;color:${s};margin-bottom:3px}
.inv-no{font-size:24px;font-weight:900;color:${p};line-height:1}
.meta-stack{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.mc{background:${l};border:1px solid ${a};border-radius:4px;padding:4px 10px;font-size:10px}
.mc .mk{font-size:8px;color:#9E9E9E;text-transform:uppercase;letter-spacing:1px}
.mc .mv{font-size:11px;font-weight:700;color:${p};margin-top:1px}
.tot-wrap{display:flex;justify-content:flex-end;margin-top:10px}
.tot-box{width:200px;background:${p};border-radius:8px;padding:12px}
.tb-row{display:flex;justify-content:space-between;font-size:10.5px;padding:2.5px 0;color:rgba(255,255,255,0.8)}
.tb-total{display:flex;justify-content:space-between;font-size:16px;font-weight:900;padding-top:8px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.3);color:white}
.words-sm{font-size:9px;color:rgba(255,255,255,0.6);font-style:italic;margin-top:4px}
${itemTableCSS(p,l)}
table.itbl thead th{font-size:8.5px;padding:6px 5px}
table.itbl tbody td{font-size:10px;padding:5px 5px}
</style></head><body><div class="page">
<div class="sidebar">
  <div class="sb-logo">${logo}</div>
  <div class="sb-name">${company?.name||'Your Company'}</div>
  <div class="sb-addr">${company?.address||''}</div>
  ${company?.gstin?`<span class="sb-tag">GSTIN&nbsp;${company.gstin}</span>`:''}
  <hr class="sb-div"/>
  <div class="sb-sec"><h4>Invoice To</h4><div class="sn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_email?`<p>${inv.client_email}</p>`:''}<p>${inv.client_phone||''}</p>${inv.client_gstin?`<p style="font-size:9px;font-weight:700;opacity:1">GSTIN: ${inv.client_gstin}</p>`:''}</div>
  <div class="sb-sec"><h4>Payment</h4><p>${inv.payment_terms||'Due on receipt'}</p><p>${isInter?'IGST (Interstate)':'CGST + SGST'}</p>${inv.reference_no?`<p>Ref: ${inv.reference_no}</p>`:''}</div>
  ${company?.bank_name?`<div class="sb-sec"><h4>Bank</h4><p>${company.bank_name}</p>${company.bank_account?`<p>A/c: ${company.bank_account}</p>`:''} ${company.bank_ifsc?`<p>IFSC: ${company.bank_ifsc}</p>`:''} ${company.upi_id?`<p>UPI: ${company.upi_id}</p>`:''}</div>`:''}
  ${qr?`<div style="text-align:center;margin-top:auto;position:relative"><div style="font-size:8px;opacity:0.5;margin-bottom:3px">Scan to Pay</div>${qr}</div>`:''}
</div>
<div class="main">
  <div class="main-top">
    <div>
      <div class="inv-type">Tax Invoice</div>
      <div class="inv-no">${inv.invoice_no||'—'}</div>
    </div>
    <div class="meta-stack">
      <div class="mc"><div class="mk">Invoice Date</div><div class="mv">${inv.invoice_date||'—'}</div></div>
      ${inv.due_date?`<div class="mc"><div class="mk">Due Date</div><div class="mv">${inv.due_date}</div></div>`:''}
    </div>
  </div>
  ${itemsTableHTML(inv,p,l,true)}
  <div class="tot-wrap">
    <div class="tot-box">
      <div class="tb-row"><span>Taxable</span><span>${fmtC(inv.total_taxable)}</span></div>
      ${isInter?`<div class="tb-row"><span>IGST</span><span>${fmtC(inv.total_igst)}</span></div>`:`<div class="tb-row"><span>CGST</span><span>${fmtC(inv.total_cgst)}</span></div><div class="tb-row"><span>SGST</span><span>${fmtC(inv.total_sgst)}</span></div>`}
      ${(inv.total_discount||0)>0?`<div class="tb-row"><span>Discount</span><span>-${fmtC(inv.total_discount)}</span></div>`:''}
      <div class="tb-total"><span>Total</span><span>${fmtC(inv.grand_total)}</span></div>
      <div class="words-sm">${amountToWords(inv.grand_total||0)}</div>
    </div>
  </div>
  ${(inv.amount_due||0)>0?`<div style="display:flex;justify-content:flex-end;margin-top:6px"><div style="background:#FFEBEE;border-radius:4px;padding:5px 12px;font-size:11px;font-weight:700;color:#C62828;display:flex;gap:10px"><span>Balance Due</span><span>${fmtC(inv.amount_due)}</span></div></div>`:''}
  <div style="display:flex;justify-content:flex-end;margin-top:14px;padding-top:8px;border-top:1px solid #E0E0E0">
    <div style="text-align:right">
      <div style="font-size:9px;color:#9E9E9E">For&nbsp;${company?.name||''}</div>
      <div style="border-top:1px solid #9E9E9E;margin-top:34px;padding-top:5px;font-size:9.5px;color:#9E9E9E">Authorised Signatory</div>
    </div>
  </div>
  ${inv.notes||inv.terms_conditions?`<div style="font-size:9.5px;color:#757575;margin-top:8px;line-height:1.7">${inv.notes?`<strong>Notes:</strong> ${inv.notes}<br>`:''}${inv.terms_conditions?`<strong>T&amp;C:</strong> ${inv.terms_conditions}`:''}</div>`:''}
</div>
</div></body></html>`;
}

// ── 7.8  THEME 8 — MINIMAL  ────────────────────────────────────
function tplTheme8(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,50,'rounded','on-white');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto;padding:12mm 18mm}
.hdr{display:flex;justify-content:space-between;align-items:flex-start}
.co-block .co-name{font-size:24px;font-weight:900;color:${p};letter-spacing:-0.5px}
.co-block .co-sub{font-size:10px;color:#9E9E9E;margin-top:3px;line-height:1.7}
.co-block .co-gstin{font-size:9.5px;font-weight:700;color:${p};margin-top:4px}
.inv-block{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.inv-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:#9E9E9E}
.inv-no{font-size:26px;font-weight:900;color:${p};line-height:1}
.inv-dt{font-size:10.5px;color:#9E9E9E;margin-top:3px}
.accent{height:3px;background:linear-gradient(90deg,${p},${s});border-radius:2px;margin:18px 0 16px}
.party-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;padding-bottom:18px;border-bottom:1px solid #F5F5F5;margin-bottom:18px}
.pb h4{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:${s};margin-bottom:6px}
.pb .pn{font-size:12.5px;font-weight:700;color:#212121;margin-bottom:3px}
.pb p{font-size:10.5px;color:#424242;line-height:1.65}
.brow{display:grid;grid-template-columns:1fr 220px;gap:22px;margin-top:18px}
.bot-accent{height:2px;background:linear-gradient(90deg,${s},${p});border-radius:2px;margin-top:22px}
${itemTableCSS(p,l)}
table.itbl thead th{background:transparent;color:${p};border-bottom:2px solid ${p};padding:0 8px 8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;text-align:center}
table.itbl tbody td{border-bottom:1px solid #F9F9F9;padding:9px 8px}
table.itbl tbody tr.alt{background:${l}}
</style></head><body><div class="page">
<div class="hdr">
  <div class="co-block">
    <div class="co-name">${company?.name||'Your Company'}</div>
    <div class="co-sub">${company?.address||''}</div>
    ${company?.gstin?`<div class="co-gstin">GSTIN&nbsp;${company.gstin}</div>`:''}
  </div>
  <div class="inv-block">
    ${logo}
    <div>
      <div class="inv-lbl">Invoice Number</div>
      <div class="inv-no">${inv.invoice_no||'—'}</div>
      <div class="inv-dt">${inv.invoice_date||'—'}${inv.due_date?` → Due ${inv.due_date}`:''}</div>
    </div>
  </div>
</div>
<div class="accent"></div>
<div class="party-row">
  <div class="pb"><h4>Billed To</h4><div class="pn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_gstin?`<p style="font-size:9px;font-weight:700;color:${p};margin-top:3px">GSTIN: ${inv.client_gstin}</p>`:''}</div>
  <div class="pb"><h4>Contact</h4><p>${inv.client_email||'—'}</p><p>${inv.client_phone||''}</p></div>
  <div class="pb"><h4>Details</h4><p><strong>Terms:</strong> ${inv.payment_terms||'Due on receipt'}</p><p><strong>Tax:</strong> ${inv.is_interstate?'IGST':'CGST+SGST'}</p>${inv.reference_no?`<p><strong>Ref:</strong> ${inv.reference_no}</p>`:''}<p><strong>Type:</strong> Tax Invoice</p></div>
</div>
${itemsTableHTML(inv,p,l)}
<div class="brow">
  <div>
    ${wordsBox(inv,p,l,a)}
    ${bankQrHTML(company,inv)}
    ${inv.notes?`<p style="font-size:10px;color:#757575;margin-top:8px"><strong>Notes:</strong> ${inv.notes}</p>`:''}
    ${inv.terms_conditions?`<p style="font-size:10px;color:#757575;margin-top:4px"><strong>T&amp;C:</strong> ${inv.terms_conditions}</p>`:''}
  </div>
  <div>${totalsHTML(inv)}</div>
</div>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;padding-top:12px;border-top:1px solid #F5F5F5">
  <div style="font-size:9.5px;color:#9E9E9E">${!inv.notes&&!inv.terms_conditions?'<em>Thank you for your business!</em>':''}</div>
  <div style="text-align:right"><div style="font-size:9px;color:#9E9E9E">For&nbsp;${company?.name||''}</div><div style="border-top:1px solid #9E9E9E;margin-top:34px;padding-top:5px;font-size:9.5px;color:#9E9E9E">Authorised Signatory</div></div>
</div>
<div class="bot-accent"></div>
</div></body></html>`;
}

// ── 7.9  FRENCH ELITE  ─────────────────────────────────────────
function tplFrenchElite(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,54,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto;border:3px solid ${p};outline:1px solid ${a};outline-offset:-6px;min-height:297mm}
.hdr{display:grid;grid-template-columns:1fr 220px;border-bottom:3px solid ${p}}
.hl{background:${l};padding:16px 18px;display:flex;align-items:center;gap:14px;border-right:3px solid ${p}}
.co-name{font-size:17px;font-weight:900;color:${p};letter-spacing:-0.2px}
.co-sub{font-size:9.5px;color:#616161;margin-top:3px;line-height:1.65}
.co-gstin{display:inline-block;margin-top:4px;background:${p};color:white;font-size:8.5px;font-weight:700;padding:2px 9px;border-radius:3px}
.hr{background:${p};padding:16px 18px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end}
.inv-type{font-size:8.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px}
.inv-no{font-size:20px;font-weight:900;color:white}
.inv-dt{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:4px;text-align:right;line-height:1.7}
.ornament{text-align:center;margin:12px 0;font-size:14px;color:${p};letter-spacing:6px}
.body{padding:0 16px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid ${accent};border-top-color:${a}}
.bl{padding:10px 12px;border-right:1px solid ${a}}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  <div class="hl">
    ${logo}
    <div>
      <div class="co-name">${company?.name||'Your Company'}</div>
      <div class="co-sub">${company?.address||''}</div>
      ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
      ${company?.phone?`<div style="font-size:9.5px;color:#616161;margin-top:3px">📞&nbsp;${company.phone}</div>`:''}
    </div>
  </div>
  <div class="hr">
    <div class="inv-type">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="ornament">— ✦ —</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.10  DOUBLE DIVINE  ───────────────────────────────────────
function tplDoubleDivine(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,52,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.hdr{display:grid;grid-template-columns:1fr 1fr;min-height:88px}
.hl{background:${p};padding:16px 18px;display:flex;align-items:center;gap:14px}
.co-name{font-size:17px;font-weight:900;color:white;letter-spacing:-0.2px}
.co-sub{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:3px;line-height:1.65}
.co-gstin{display:inline-block;margin-top:4px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;font-size:8.5px;font-weight:700;padding:2px 9px;border-radius:3px}
.hr{background:${s};padding:16px 18px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;position:relative;overflow:hidden}
.hr::after{content:'';position:absolute;bottom:-28px;right:-28px;width:100px;height:100px;background:rgba(0,0,0,0.1);border-radius:50%}
.divine-lbl{font-size:9px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px;position:relative}
.inv-no{font-size:22px;font-weight:900;color:white;position:relative}
.inv-dt{font-size:9.5px;color:rgba(255,255,255,0.7);margin-top:4px;text-align:right;line-height:1.7;position:relative}
.divine-stripe{height:4px;background:linear-gradient(90deg,${p} 50%,${s} 50%)}
.body{padding:10px 14px}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  <div class="hl">${logo}<div><div class="co-name">${company?.name||'Your Company'}</div><div class="co-sub">${company?.address||''}</div>${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}</div></div>
  <div class="hr">
    <div class="divine-lbl">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="divine-stripe"></div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  ${partyBoxes(inv,p)}
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.11  LANDSCAPE  ───────────────────────────────────────────
function tplLandscape(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,48,'rounded','on-color');
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS_LAND}
.page{max-width:297mm;margin:0 auto}
.hdr{background:${p};display:flex;align-items:center;padding:10px 18px;gap:14px}
.co-name{font-size:16px;font-weight:800;color:white}
.co-sub{font-size:9px;color:rgba(255,255,255,0.7);margin-top:2px}
.co-gstin{display:inline-block;margin-top:3px;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);color:white;font-size:8px;font-weight:700;padding:1.5px 7px;border-radius:3px}
.inv-r{text-align:right;flex-shrink:0}
.inv-type{font-size:8px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.65)}
.inv-no{font-size:19px;font-weight:900;color:white}
.inv-dt{font-size:9px;color:rgba(255,255,255,0.65);margin-top:2px;line-height:1.6}
.body{padding:8px 14px}
.top-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}
.tg-box{background:${l};border:1px solid ${a};border-radius:4px;padding:8px 10px}
.tg-box h4{font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:4px}
.tg-box .tn{font-size:11.5px;font-weight:700;color:#212121;margin-bottom:2px}
.tg-box p{font-size:9.5px;color:#424242;line-height:1.6}
.brow{display:grid;grid-template-columns:1fr 220px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:8px 10px;border-right:1px solid #E0E0E0}
.br{padding:8px 10px}
${itemTableCSS(p,l)}
table.itbl thead th{padding:6px 4px;font-size:8.5px}
table.itbl tbody td{padding:5px 4px;font-size:10px}
table.ttbl td{padding:2.5px 5px;font-size:10px}
table.ttbl .grand td{font-size:12px;padding:6px 7px}
</style></head><body><div class="page">
<div class="hdr">
  ${logo}
  <div style="flex:1">
    <div class="co-name">${company?.name||'Your Company'}</div>
    <div class="co-sub">${company?.address||''}</div>
    ${company?.gstin?`<span class="co-gstin">GSTIN&nbsp;${company.gstin}</span>`:''}
  </div>
  <div class="inv-r">
    <div class="inv-type">Tax Invoice</div>
    <div class="inv-no">${inv.invoice_no||'—'}</div>
    <div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div>
  </div>
</div>
<div class="body">
  <div class="top-grid">
    <div class="tg-box"><h4>Bill To</h4><div class="tn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_gstin?`<p style="font-size:8.5px;font-weight:700;color:${p};margin-top:2px">GSTIN: ${inv.client_gstin}</p>`:''}</div>
    <div class="tg-box"><h4>Invoice Info</h4><p><strong>No.:</strong> ${inv.invoice_no||'—'}</p><p><strong>Date:</strong> ${inv.invoice_date||'—'}</p>${inv.due_date?`<p><strong>Due:</strong> ${inv.due_date}</p>`:''}<p><strong>Supply:</strong> ${inv.client_state||'—'}</p></div>
    <div class="tg-box"><h4>Payment</h4><p><strong>Terms:</strong> ${inv.payment_terms||'Due on receipt'}</p><p><strong>Tax:</strong> ${inv.is_interstate?'IGST':'CGST+SGST'}</p>${inv.reference_no?`<p><strong>Ref:</strong> ${inv.reference_no}</p>`:''}</div>
  </div>
  ${itemsTableHTML(inv,p,l,true)}
  <div class="brow">
    <div class="bl">
      <div style="font-size:9.5px;font-weight:600;color:${p};margin-bottom:6px">${amountToWords(inv.grand_total||0)}</div>
      ${bankQrHTML(company,inv,true)}
    </div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.12  GST THEME 1  ─────────────────────────────────────────
function tplGstTheme1(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,50,'rounded','on-color');
  const isInter=inv.is_interstate;
  const items=inv.items||[];
  // Build unique GST rate groups
  const gstGroups={};
  items.forEach(it=>{
    const rate=it.gst_rate||0;
    if(!gstGroups[rate])gstGroups[rate]={rate,taxable:0,cgst:0,sgst:0,igst:0};
    gstGroups[rate].taxable+=(it.taxable_value||0);
    gstGroups[rate].cgst+=(it.cgst_amount||0);
    gstGroups[rate].sgst+=(it.sgst_amount||0);
    gstGroups[rate].igst+=(it.igst_amount||0);
  });
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.hdr{background:${p};display:flex;align-items:center;padding:10px 14px;gap:12px;border-bottom:4px solid ${s}}
.co-name{font-size:16px;font-weight:800;color:white}
.co-sub{font-size:9px;color:rgba(255,255,255,0.7);margin-top:2px;line-height:1.6}
.tax-inv-badge{background:white;color:${p};font-size:9px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;padding:4px 14px;border-radius:3px}
.body{padding:8px 12px}
.meta2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.meta2-box{background:${l};border:1px solid ${a};border-radius:4px;padding:8px 10px}
.meta2-box h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:5px}
.meta2-box .row{display:flex;gap:8px;font-size:10px;margin-bottom:2px}
.meta2-box .mk{color:#9E9E9E;min-width:90px}
.meta2-box .mv{font-weight:600;color:#212121}
.gst-sum{border:1px solid ${a};border-radius:4px;overflow:hidden;margin-top:10px}
.gst-sum table thead tr{background:${p}}
.gst-sum table thead th{color:white;padding:6px 8px;font-size:9px;font-weight:700;text-align:center}
.gst-sum table tbody td{padding:5px 8px;font-size:10.5px;text-align:right;border-bottom:1px solid #ECEFF1;color:#424242}
.gst-sum table tbody td:first-child{text-align:left;font-weight:600}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  ${logo}
  <div style="flex:1">
    <div class="co-name">${company?.name||'Your Company'}</div>
    <div class="co-sub">${company?.address||''} ${company?.phone?` · 📞 ${company.phone}`:''}</div>
    ${company?.gstin?`<div style="font-size:9px;color:rgba(255,255,255,0.7);margin-top:2px">GSTIN: <strong style="color:white">${company.gstin}</strong></div>`:''}
  </div>
  <div><div class="tax-inv-badge">Tax Invoice</div></div>
</div>
<div class="body">
  <div class="meta2">
    <div class="meta2-box">
      <h4>Invoice Details</h4>
      <div class="row"><span class="mk">Invoice No.</span><span class="mv">${inv.invoice_no||'—'}</span></div>
      <div class="row"><span class="mk">Invoice Date</span><span class="mv">${inv.invoice_date||'—'}</span></div>
      ${inv.due_date?`<div class="row"><span class="mk">Due Date</span><span class="mv">${inv.due_date}</span></div>`:''}
      <div class="row"><span class="mk">Supply Type</span><span class="mv">${isInter?'Interstate (IGST)':'Intrastate (CGST+SGST)'}</span></div>
      <div class="row"><span class="mk">Place of Supply</span><span class="mv">${inv.client_state||'—'}</span></div>
      ${inv.reference_no?`<div class="row"><span class="mk">Ref/PO No.</span><span class="mv">${inv.reference_no}</span></div>`:''}
    </div>
    <div class="meta2-box">
      <h4>Bill To</h4>
      <div style="font-size:12.5px;font-weight:700;color:#212121;margin-bottom:3px">${inv.client_name||'—'}</div>
      <div style="font-size:10.5px;color:#424242;line-height:1.65">${inv.client_address||''}</div>
      ${inv.client_email?`<div style="font-size:10px;color:#424242;margin-top:2px">✉ ${inv.client_email}</div>`:''}
      ${inv.client_phone?`<div style="font-size:10px;color:#424242">📞 ${inv.client_phone}</div>`:''}
      ${inv.client_gstin?`<div style="display:inline-block;background:${p};color:white;font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;margin-top:3px">GSTIN&nbsp;${inv.client_gstin}</div>`:''}
    </div>
  </div>
  ${itemsTableHTML(inv,p,l)}
  <!-- GST Summary -->
  <div class="gst-sum">
    <table><thead><tr>
      <th style="text-align:left">GST Rate</th>
      <th>Taxable Value (₹)</th>
      ${isInter?'<th>IGST (₹)</th>':'<th>CGST (₹)</th><th>SGST/UTGST (₹)</th>'}
      <th>Total Tax (₹)</th>
    </tr></thead><tbody>
    ${Object.values(gstGroups).map(g=>`<tr>
      <td style="text-align:left">GST @ ${g.rate}%</td>
      <td>${fmtN(g.taxable)}</td>
      ${isInter?`<td>${fmtN(g.igst)}</td>`:`<td>${fmtN(g.cgst)}</td><td>${fmtN(g.sgst)}</td>`}
      <td>${fmtN(isInter?g.igst:g.cgst+g.sgst)}</td>
    </tr>`).join('')}
    <tr style="font-weight:700;background:${l}">
      <td style="text-align:left">Total</td>
      <td>${fmtN(inv.total_taxable)}</td>
      ${isInter?`<td>${fmtN(inv.total_igst)}</td>`:`<td>${fmtN(inv.total_cgst)}</td><td>${fmtN(inv.total_sgst)}</td>`}
      <td>${fmtN(isInter?inv.total_igst:(inv.total_cgst||0)+(inv.total_sgst||0))}</td>
    </tr>
    </tbody></table>
  </div>
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.13  GST THEME 3  ─────────────────────────────────────────
function tplGstTheme3(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const logo=getLogoHTML(company,theme,52,'rounded','on-white');
  const isInter=inv.is_interstate;
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
.page{max-width:210mm;margin:0 auto}
.hdr{border:1.5px solid ${p};border-radius:6px;margin:10px;overflow:hidden;display:grid;grid-template-columns:1fr auto}
.hl{padding:12px 14px;display:flex;align-items:center;gap:12px}
.co-name{font-size:16px;font-weight:800;color:${p}}
.co-sub{font-size:9.5px;color:#616161;margin-top:2px;line-height:1.6}
.co-gstin{font-size:9px;font-weight:700;color:${p};margin-top:3px}
.hr{background:${p};padding:12px 16px;display:flex;flex-direction:column;justify-content:center;align-items:center;min-width:140px}
.inv-type{font-size:8.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:4px}
.inv-no{font-size:18px;font-weight:900;color:white;text-align:center}
.inv-dt{font-size:9px;color:rgba(255,255,255,0.7);margin-top:4px;text-align:center;line-height:1.7}
.body{padding:0 10px 10px}
.gst3-party{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.gp-box{border:1px solid ${a};border-radius:4px;padding:9px 11px}
.gp-box h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:${p};margin-bottom:5px}
.gp-box .gn{font-size:12px;font-weight:700;color:#212121;margin-bottom:2px}
.gp-box p{font-size:10.5px;color:#424242;line-height:1.65}
.brow{display:grid;grid-template-columns:1fr 230px;gap:0;border-top:1px solid #E0E0E0}
.bl{padding:10px 12px;border-right:1px solid #E0E0E0}
.br{padding:10px 12px}
${itemTableCSS(p,l)}
</style></head><body><div class="page">
<div class="hdr">
  <div class="hl">${logo}<div><div class="co-name">${company?.name||'Your Company'}</div><div class="co-sub">${company?.address||''}</div>${company?.gstin?`<div class="co-gstin">GSTIN: ${company.gstin}</div>`:''} ${company?.phone?`<div style="font-size:9px;color:#616161">📞 ${company.phone}</div>`:''}</div></div>
  <div class="hr"><div class="inv-type">Tax Invoice</div><div class="inv-no">${inv.invoice_no||'—'}</div><div class="inv-dt">Date: ${inv.invoice_date||'—'}${inv.due_date?`<br>Due: ${inv.due_date}`:''}</div></div>
</div>
<div class="body">
  ${metaRow(inv,p,l,a)}
  <div class="gst3-party">
    <div class="gp-box"><h4>Bill To</h4><div class="gn">${inv.client_name||'—'}</div><p>${inv.client_address||''}</p>${inv.client_gstin?`<p style="font-size:9px;font-weight:700;color:${p};margin-top:2px">GSTIN: ${inv.client_gstin}</p>`:''}</div>
    <div class="gp-box"><h4>Ship To</h4><div class="gn">${inv.ship_name||inv.client_name||'—'}</div><p>${inv.ship_address||inv.client_address||''}</p>${inv.payment_terms?`<p style="margin-top:5px"><strong>Terms:</strong> ${inv.payment_terms}</p>`:''}</div>
  </div>
  ${itemsTableHTML(inv,p,l)}
  <div class="brow">
    <div class="bl">${wordsBox(inv,p,l,a)}${bankQrHTML(company,inv)}</div>
    <div class="br">${totalsHTML(inv)}</div>
  </div>
  ${signRow(company,inv)}
</div>
</div></body></html>`;
}

// ── 7.14  TALLY THEME  ─────────────────────────────────────────
function tplTallyTheme(inv,company,theme){
  const {primary:p,secondary:s,light:l,accent:a}=theme;
  const isInter=inv.is_interstate;
  const items=inv.items||[];
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>${BASE_CSS}
body{font-size:11px;font-family:'Courier New',Courier,monospace}
.page{max-width:210mm;margin:0 auto;padding:10mm 12mm}
.t-title{text-align:center;font-size:13px;font-weight:bold;text-decoration:underline;margin-bottom:2px}
.t-type{text-align:center;font-size:11px;font-weight:bold;margin-bottom:8px}
.t-co{text-align:center;font-size:12px;font-weight:bold;margin-bottom:2px}
.t-co-sub{text-align:center;font-size:10px;margin-bottom:1px}
.t-co-gstin{text-align:center;font-size:10px;margin-bottom:8px}
.hr-solid{border:none;border-top:2px solid #212121;margin:4px 0}
.hr-dash{border:none;border-top:1px dashed #212121;margin:4px 0}
.t-grid{display:grid;grid-template-columns:1fr 1fr;margin-bottom:2px}
.t-grid .l{font-size:10.5px}
.t-grid .r{text-align:right;font-size:10.5px}
table.itbl{border:none;margin:4px 0}
table.itbl thead th{background:none;color:#212121;font-weight:bold;padding:2px 4px;font-size:10.5px;border-bottom:1px solid #212121;text-align:center;border-top:1px solid #212121}
table.itbl tbody td{padding:2.5px 4px;font-size:10.5px;border-bottom:none;color:#212121;text-align:center}
table.itbl tbody td.desc{text-align:left}
table.itbl tbody td.r{text-align:right}
table.itbl tbody td.bld{font-weight:bold}
.tot-row{display:flex;justify-content:space-between;padding:1px 0;font-size:10.5px}
.tot-grand{display:flex;justify-content:space-between;padding:2px 0;font-size:11.5px;font-weight:bold}
</style></head><body><div class="page">
<div class="t-co">${company?.name||'Your Company'}</div>
<div class="t-co-sub">${company?.address||''}</div>
${company?.phone?`<div class="t-co-sub">Ph: ${company.phone}</div>`:''}
${company?.gstin?`<div class="t-co-gstin">GSTIN: ${company.gstin}</div>`:''}
<hr class="hr-solid"/>
<div class="t-type">Tax Invoice</div>
<hr class="hr-dash"/>
<div class="t-grid"><div class="l">Invoice No: <strong>${inv.invoice_no||'—'}</strong></div><div class="r">Date: <strong>${inv.invoice_date||'—'}</strong></div></div>
${inv.due_date?`<div class="t-grid"><div class="l"></div><div class="r">Due: <strong>${inv.due_date}</strong></div></div>`:''}
<hr class="hr-dash"/>
<div><strong>Party:</strong> ${inv.client_name||'—'}</div>
<div style="font-size:10.5px">${inv.client_address||''}</div>
${inv.client_gstin?`<div style="font-size:10.5px">GSTIN: ${inv.client_gstin}</div>`:''}
<hr class="hr-dash"/>
<div class="t-grid"><div class="l"><strong>Place of Supply:</strong> ${inv.client_state||'—'}</div><div class="r"><strong>Tax Type:</strong> ${isInter?'IGST':'CGST+SGST'}</div></div>
<hr class="hr-solid"/>
<table class="itbl">
  <thead><tr>
    <th style="text-align:left;width:24px">#</th>
    <th style="text-align:left">Particulars</th>
    <th>HSN</th>
    <th>Qty</th>
    <th>Rate</th>
    <th>Disc%</th>
    <th>Taxable</th>
    ${isInter?'<th>IGST%</th><th>IGST</th>':'<th>CGST%</th><th>CGST</th><th>SGST%</th><th>SGST</th>'}
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>
    ${items.map((it,i)=>`<tr>
      <td style="text-align:left">${i+1}</td>
      <td class="desc">${it.description||''}</td>
      <td>${it.hsn_sac||''}</td>
      <td class="r">${fmtN(it.quantity)}&nbsp;${it.unit||''}</td>
      <td class="r">${fmtN(it.unit_price)}</td>
      <td>${it.discount_pct||0}%</td>
      <td class="r">${fmtN(it.taxable_value)}</td>
      ${isInter?`<td>${it.gst_rate||0}%</td><td class="r">${fmtN(it.igst_amount)}</td>`:`<td>${(it.gst_rate||0)/2}%</td><td class="r">${fmtN(it.cgst_amount)}</td><td>${(it.gst_rate||0)/2}%</td><td class="r">${fmtN(it.sgst_amount)}</td>`}
      <td class="r bld">${fmtN(it.total_amount)}</td>
    </tr>`).join('')}
  </tbody>
</table>
<hr class="hr-solid"/>
<div style="display:grid;grid-template-columns:1fr 220px;gap:8px">
  <div>
    <div style="font-size:10px;font-style:italic"><strong>Amount in Words:</strong><br>${amountToWords(inv.grand_total||0)}</div>
    ${company?.bank_name?`<hr class="hr-dash"/><div style="font-size:10px"><strong>Bank:</strong> ${company.bank_name}</div>${company.bank_account?`<div style="font-size:10px"><strong>A/c No.:</strong> ${company.bank_account}</div>`:''}${company.bank_ifsc?`<div style="font-size:10px"><strong>IFSC:</strong> ${company.bank_ifsc}</div>`:''}${company.upi_id?`<div style="font-size:10px"><strong>UPI:</strong> ${company.upi_id}</div>`:''}`:''}
    ${inv.terms_conditions?`<hr class="hr-dash"/><div style="font-size:9.5px"><strong>Terms:</strong> ${inv.terms_conditions}</div>`:''}
  </div>
  <div>
    <div class="tot-row"><span>Sub Total</span><span>${fmtC(inv.subtotal)}</span></div>
    ${(inv.total_discount||0)>0?`<div class="tot-row"><span>(-) Discount</span><span>-${fmtC(inv.total_discount)}</span></div>`:''}
    <div class="tot-row"><span>Taxable Value</span><span>${fmtC(inv.total_taxable)}</span></div>
    ${isInter?`<div class="tot-row"><span>IGST</span><span>${fmtC(inv.total_igst)}</span></div>`:`<div class="tot-row"><span>CGST</span><span>${fmtC(inv.total_cgst)}</span></div><div class="tot-row"><span>SGST/UTGST</span><span>${fmtC(inv.total_sgst)}</span></div>`}
    <hr class="hr-solid"/>
    <div class="tot-grand"><span>Total</span><span>${fmtC(inv.grand_total)}</span></div>
    <hr class="hr-solid"/>
    ${(inv.amount_paid||0)>0?`<div class="tot-row"><span>Received</span><span>${fmtC(inv.amount_paid)}</span></div>`:''}
    ${(inv.amount_due||0)>0?`<div class="tot-row" style="font-weight:bold"><span>Balance</span><span>${fmtC(inv.amount_due)}</span></div>`:''}
  </div>
</div>
<hr class="hr-solid"/>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:6px">
  <div style="font-size:9.5px">${!inv.notes&&!inv.terms_conditions?'Thanks for doing business with us!':''}</div>
  <div style="text-align:right"><div style="font-size:9.5px">For&nbsp;${company?.name||''}</div><div style="margin-top:30px;padding-top:4px;border-top:1px solid #212121;font-size:9.5px">Authorised Signatory</div></div>
</div>
</div></body></html>`;
}

// ── 7.15  THERMAL 1  ───────────────────────────────────────────
function tplThermal1(inv,company,theme){
  const {primary:p}=theme;
  const isInter=inv.is_interstate;
  const items=inv.items||[];
  const qr=getQrHTML(buildUpiUrl(company,inv.grand_total),80);
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{body{margin:0}@page{size:80mm auto;margin:0}}
.center{text-align:center}.right{text-align:right}.bold{font-weight:bold}
.sep{border:none;border-top:1px dashed #000;margin:3px 0}.sep2{border:none;border-top:2px solid #000;margin:3px 0}
table{width:100%}td{padding:1px 2px;font-size:11px}
.grand{font-size:13px;font-weight:bold}
</style></head><body>
<div class="center bold" style="font-size:13px">${company?.name||'Your Company'}</div>
<div class="center" style="font-size:10px">${company?.address||''}</div>
${company?.phone?`<div class="center" style="font-size:10px">📞 ${company.phone}</div>`:''}
${company?.gstin?`<div class="center" style="font-size:10px">GSTIN: ${company.gstin}</div>`:''}
<hr class="sep2"/>
<div class="center bold">TAX INVOICE</div>
<hr class="sep"/>
<table><tr><td>Invoice No:</td><td class="right bold">${inv.invoice_no||'—'}</td></tr>
<tr><td>Date:</td><td class="right">${inv.invoice_date||'—'}</td></tr>
${inv.due_date?`<tr><td>Due Date:</td><td class="right">${inv.due_date}</td></tr>`:''}
</table>
<hr class="sep"/>
<div><strong>Party: ${inv.client_name||'—'}</strong></div>
${inv.client_address?`<div style="font-size:10px">${inv.client_address}</div>`:''}
${inv.client_gstin?`<div style="font-size:10px">GSTIN: ${inv.client_gstin}</div>`:''}
<hr class="sep"/>
<table><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th class="right">Amt</th></tr></thead>
<tbody>
${items.map(it=>`<tr>
  <td colspan="3" style="padding-bottom:0"><strong>${it.description||''}</strong></td>
</tr><tr>
  <td style="font-size:10px">${it.unit_price?`@${fmtN(it.unit_price)}`:''} GST${it.gst_rate||0}%</td>
  <td style="text-align:center">${fmtN(it.quantity)}${it.unit?` ${it.unit}`:''}</td>
  <td class="right">${fmtN(it.total_amount)}</td>
</tr>`).join('')}
</tbody></table>
<hr class="sep"/>
<table>
<tr><td>Taxable</td><td class="right">${fmtC(inv.total_taxable)}</td></tr>
${isInter?`<tr><td>IGST</td><td class="right">${fmtC(inv.total_igst)}</td></tr>`:`<tr><td>CGST</td><td class="right">${fmtC(inv.total_cgst)}</td></tr><tr><td>SGST</td><td class="right">${fmtC(inv.total_sgst)}</td></tr>`}
${(inv.total_discount||0)>0?`<tr><td>Discount</td><td class="right">-${fmtC(inv.total_discount)}</td></tr>`:''}
</table>
<hr class="sep2"/>
<table><tr class="grand"><td><strong>TOTAL</strong></td><td class="right"><strong>${fmtC(inv.grand_total)}</strong></td></tr></table>
<hr class="sep2"/>
${(inv.amount_paid||0)>0?`<table><tr><td>Received</td><td class="right">${fmtC(inv.amount_paid)}</td></tr></table>`:''}
${(inv.amount_due||0)>0?`<table><tr><td><strong>Balance Due</strong></td><td class="right"><strong>${fmtC(inv.amount_due)}</strong></td></tr></table>`:''}
<hr class="sep"/>
<div style="font-size:10px;text-align:center;font-style:italic">${amountToWords(inv.grand_total||0)}</div>
${qr?`<hr class="sep"/><div class="center">${qr}<div style="font-size:10px;margin-top:2px">Scan to Pay via UPI</div></div>`:''}
${company?.upi_id?`<div class="center" style="font-size:10px">UPI: ${company.upi_id}</div>`:''}
<hr class="sep"/>
${inv.terms_conditions?`<div style="font-size:9px;text-align:center">${inv.terms_conditions}</div><hr class="sep"/>`:''}
<div class="center" style="font-size:10px">Thanks for your business!</div>
<div style="text-align:right;margin-top:20px;font-size:10px;border-top:1px solid #000;padding-top:3px">Authorised Signatory</div>
</body></html>`;
}

// ── 7.16  THERMAL 2  ───────────────────────────────────────────
function tplThermal2(inv,company,theme){
  const {primary:p}=theme;
  const isInter=inv.is_interstate;
  const items=inv.items||[];
  const qr=getQrHTML(buildUpiUrl(company,inv.grand_total),90);
  return`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${inv.invoice_no||'Invoice'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;width:80mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{body{margin:0}@page{size:80mm auto;margin:0}}
.center{text-align:center}.right{text-align:right}
.hdr-band{background:#000;color:white;padding:5px;text-align:center;font-size:13px;font-weight:bold}
.sep{border:none;border-top:1px solid #000;margin:3px 0}
.sep-d{border:none;border-top:1px dashed #000;margin:3px 0}
table{width:100%}td{padding:1.5px 2px;font-size:11px}
.grand-band{background:#000;color:white;padding:4px 6px;display:flex;justify-content:space-between;font-size:12px;font-weight:bold}
</style></head><body>
<div class="hdr-band">${company?.name||'Your Company'}</div>
<div class="center" style="font-size:10px;padding:2px">${company?.address||''}</div>
${company?.gstin?`<div class="center" style="font-size:10px">GSTIN: ${company.gstin}</div>`:''}
${company?.phone?`<div class="center" style="font-size:10px">📞 ${company.phone}</div>`:''}
<hr class="sep"/>
<table>
<tr><td><strong>Invoice:</strong> ${inv.invoice_no||'—'}</td><td class="right">${inv.invoice_date||'—'}</td></tr>
${inv.due_date?`<tr><td colspan="2" class="right" style="font-size:10px">Due: ${inv.due_date}</td></tr>`:''}
<tr><td><strong>${inv.client_name||'—'}</strong></td><td class="right">${isInter?'IGST':'CGST+SGST'}</td></tr>
${inv.client_gstin?`<tr><td colspan="2" style="font-size:9px">GSTIN: ${inv.client_gstin}</td></tr>`:''}
</table>
<hr class="sep"/>
<table>
<thead><tr><th style="text-align:left">Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Total</th></tr></thead>
<tbody>
${items.map(it=>`<tr>
  <td>${it.description||''}<br><span style="font-size:9px;color:#555">HSN:${it.hsn_sac||''} Rate:${fmtN(it.unit_price)} Tax:${it.gst_rate||0}%</span></td>
  <td style="text-align:center">${fmtN(it.quantity)}${it.unit?` ${it.unit}`:''}</td>
  <td class="right">${fmtN(it.total_amount)}</td>
</tr>`).join('')}
</tbody>
</table>
<hr class="sep"/>
<table>
<tr><td>Taxable Value</td><td class="right">${fmtC(inv.total_taxable)}</td></tr>
${isInter?`<tr><td>IGST</td><td class="right">${fmtC(inv.total_igst)}</td></tr>`:`<tr><td>CGST</td><td class="right">${fmtC(inv.total_cgst)}</td></tr><tr><td>SGST/UTGST</td><td class="right">${fmtC(inv.total_sgst)}</td></tr>`}
${(inv.total_discount||0)>0?`<tr><td>Discount</td><td class="right">-${fmtC(inv.total_discount)}</td></tr>`:''}
</table>
<hr class="sep"/>
<div class="grand-band"><span>GRAND TOTAL</span><span>${fmtC(inv.grand_total)}</span></div>
${(inv.amount_paid||0)>0?`<hr class="sep-d"/><table><tr><td>Received</td><td class="right">${fmtC(inv.amount_paid)}</td></tr>${(inv.amount_due||0)>0?`<tr><td><strong>Balance Due</strong></td><td class="right"><strong>${fmtC(inv.amount_due)}</strong></td></tr>`:''}</table>`:''}
<hr class="sep"/>
<div class="center" style="font-size:9.5px;font-style:italic;padding:2px">${amountToWords(inv.grand_total||0)}</div>
${qr?`<hr class="sep-d"/><div class="center" style="padding:3px">${qr}<div style="font-size:10px;margin-top:2px">Scan to Pay · ${company?.upi_id||''}</div></div>`:''}
${company?.bank_name?`<hr class="sep-d"/><div style="font-size:10px;padding:1px 2px"><strong>Bank:</strong> ${company.bank_name} | A/c: ${company.bank_account||''} | IFSC: ${company.bank_ifsc||''}</div>`:''}
<hr class="sep"/>
${inv.terms_conditions?`<div style="font-size:9px;padding:1px 2px">${inv.terms_conditions}</div><hr class="sep-d"/>`:''}
<div class="center" style="font-size:11px;font-weight:bold;padding:3px">Thank You! Visit Again.</div>
<div style="text-align:right;margin-top:18px;padding-top:3px;border-top:1px dashed #000;font-size:10px">Authorised Signatory</div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// 8.  DISPATCHER
// ═══════════════════════════════════════════════════════════════

const TEMPLATE_FNS = {
  classic:      tplClassic,
  theme2:       tplTheme2,
  theme3:       tplTheme3,
  theme4:       tplTheme4,
  theme5:       tplTheme5,
  theme6:       tplTheme6,
  theme7:       tplTheme7,
  theme8:       tplTheme8,
  frenchelite:  tplFrenchElite,
  doubledivine: tplDoubleDivine,
  landscape:    tplLandscape,
  gsttheme1:    tplGstTheme1,
  gsttheme3:    tplGstTheme3,
  tallytheme:   tplTallyTheme,
  thermal1:     tplThermal1,
  thermal2:     tplThermal2,
};

export function generateInvoiceHTML(inv,company,templateId,themeId,customColor){
  const theme=getThemeColor(themeId,customColor);
  const fn=TEMPLATE_FNS[templateId]||tplClassic;
  return fn(inv,company,theme);
}

export function openInvoicePrint(inv,company,templateId='classic',themeId='blue',customColor='#1565C0'){
  if(!inv)return;
  const html=generateInvoiceHTML(inv,company,templateId,themeId,customColor);
  const win=window.open('','_blank','width=900,height=700');
  if(!win){alert('Please allow pop-ups to print invoices');return;}
  win.document.write(html);
  win.document.close();
  win.onload=()=>{win.focus();win.print();};
}

// ═══════════════════════════════════════════════════════════════
// 9.  SVG THUMBNAILS
// ═══════════════════════════════════════════════════════════════

const TemplateThumb = ({tpl,selected,onClick,primary,secondary,light,accent}) => {
  const thumbs = {
    classic: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill={primary}/><rect x="0" y="14" width="60" height="50" rx="0" fill="white"/><rect x="3" y="3" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.25)"/><rect x="13" y="3" width="20" height="3" rx="0.5" fill="rgba(255,255,255,0.8)"/><rect x="13" y="7.5" width="14" height="2" rx="0.5" fill="rgba(255,255,255,0.45)"/><rect x="40" y="4" width="17" height="7" rx="1.5" fill="rgba(255,255,255,0.15)"/><rect x="3" y="16" width="54" height="7" rx="1" fill={light} stroke={accent} strokeWidth="0.5"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={26+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="54" width="25" height="8" rx="2" fill={primary}/></g>),
    theme2:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="10" rx="2" fill={primary}/><rect x="3" y="3" width="22" height="4" rx="0.5" fill="rgba(255,255,255,0.9)"/><rect x="0" y="10" width="60" height="12" fill={light}/><rect x="3" y="12" width="8" height="8" rx="1.5" fill={primary}/><rect x="13" y="12.5" width="18" height="2.5" rx="0.5" fill="#424242"/><rect x="13" y="16" width="12" height="2" rx="0.5" fill="#9E9E9E"/><rect x="40" y="13" width="17" height="7" rx="1.5" fill={light} stroke={accent} strokeWidth="0.5"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={26+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="54" width="25" height="8" rx="2" fill={primary}/></g>),
    theme3:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke={primary} strokeWidth="1.5"/><rect x="0" y="0" width="30" height="20" rx="0" fill={light}/><rect x="3" y="4" width="8" height="8" rx="1.5" fill={primary}/><rect x="13" y="4" width="14" height="3" rx="0.5" fill={primary} opacity="0.8"/><rect x="30" y="0" width="30" height="20" fill={primary}/><rect x="33" y="6" width="22" height="4" rx="0.5" fill="rgba(255,255,255,0.75)"/><rect x="33" y="12" width="16" height="3" rx="0.5" fill="rgba(255,255,255,0.45)"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={26+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="54" width="25" height="8" rx="2" fill={primary}/></g>),
    theme4:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="20" rx="2" fill={primary}/><circle cx="56" cy="-2" r="14" fill="rgba(255,255,255,0.05)"/><circle cx="8" cy="12" r="6" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/><rect x="18" y="6" width="22" height="3.5" rx="0.5" fill="rgba(255,255,255,0.9)"/><rect x="18" y="11" width="15" height="2" rx="0.5" fill="rgba(255,255,255,0.5)"/><rect x="10" y="16" width="40" height="8" rx="2" fill="rgba(0,0,0,0.2)"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={28+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="55" width="25" height="7" rx="2" fill={primary}/></g>),
    theme5:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="14" rx="2" fill={primary}/><rect x="3" y="3" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.25)"/><rect x="13" y="4" width="18" height="3" rx="0.5" fill="rgba(255,255,255,0.85)"/><rect x="37" y="3" width="20" height="8" rx="3" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7"/>{[0,1,2].map(i=><rect key={i} x={3+i*19} y="16" width="17" height="10" rx="2" fill="white" stroke={accent} strokeWidth="0.6"/>)}{[0,1,2,3].map(i=><rect key={i} x="3" y={30+i*5} width="54" height="3.5" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="55" width="25" height="7" rx="2" fill={primary}/></g>),
    theme6:  (<g><defs><linearGradient id="g6t" x1="0" y1="0" x2="1" y2="0"><stop stopColor={primary}/><stop offset="1" stopColor={secondary}/></linearGradient></defs><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="20" rx="2" fill="url(#g6t)"/><circle cx="-2" cy="4" r="16" fill="rgba(255,255,255,0.05)"/><circle cx="8" cy="11" r="7" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/><circle cx="8" cy="11" r="5" fill={primary}/><rect x="18" y="6" width="18" height="3.5" rx="0.5" fill="rgba(255,255,255,0.9)"/><rect x="18" y="11" width="13" height="2" rx="0.5" fill="rgba(255,255,255,0.5)"/>{[0,1,2].map(i=><rect key={i} x={2+i*19} y="17" width="17" height="10" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5" style={{boxShadow:'0 2px 6px rgba(0,0,0,0.1)'}}/>)}{[0,1,2].map(i=><rect key={i} x="3" y={30+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="24" y="54" width="33" height="8" rx="3" fill="url(#g6t)"/></g>),
    theme7:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white"/><rect x="0" y="0" width="18" height="64" rx="2" fill={primary}/><circle cx="9" cy="58" r="8" fill={secondary} opacity="0.2"/><rect x="3" y="4" width="12" height="10" rx="2" fill="rgba(255,255,255,0.2)"/>{[0,1,2].map(i=><rect key={i} x="3" y={18+i*12} width="12" height="9" rx="1" fill="rgba(255,255,255,0.12)"/>)}<rect x="20" y="4" width="14" height="3" rx="0.5" fill={secondary} opacity="0.6"/><rect x="20" y="9" width="20" height="4.5" rx="0.5" fill={primary} opacity="0.8"/><rect x="40" y="4" width="17" height="12" rx="1.5" fill={light} stroke={accent} strokeWidth="0.5"/>{[0,1,2,3].map(i=><rect key={i} x="20" y={18+i*5.5} width="37" height="3.5" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="30" y="51" width="27" height="11" rx="2" fill={primary}/></g>),
    theme8:  (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="3" y="5" width="22" height="5" rx="0.5" fill={primary} opacity="0.8"/><rect x="3" y="11.5" width="15" height="2.5" rx="0.5" fill="#9E9E9E" opacity="0.5"/><rect x="44" y="4" width="13" height="13" rx="2.5" fill={primary}/><rect x="3" y="21" width="54" height="2.5" rx="1.5" fill={`url(#ml8)`}/><defs><linearGradient id="ml8" x1="0" y1="0" x2="1" y2="0"><stop stopColor={primary}/><stop offset="1" stopColor={secondary}/></linearGradient></defs>{[0,1,2].map(i=><rect key={i} x={3+i*18} y="26" width="16" height="9" rx="1" fill={light}/>)}{[0,1,2,3].map(i=><rect key={i} x="3" y={38+i*5} width="54" height="3.5" rx="0.5" fill={i%2===0?light:'white'}/>)}<rect x="30" y="58" width="27" height="5" rx="1.5" fill={primary}/></g>),
    frenchelite: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke={primary} strokeWidth="1.5"/><rect x="2.5" y="2.5" width="55" height="59" rx="1" fill="none" stroke={accent} strokeWidth="0.8"/><rect x="0" y="0" width="32" height="20" rx="0" fill={light}/><rect x="3" y="4" width="8" height="8" rx="1.5" fill={primary}/><rect x="13" y="4" width="16" height="3" rx="0.5" fill={primary} opacity="0.7"/><rect x="32" y="0" width="28" height="20" fill={primary}/><rect x="34" y="6" width="20" height="4" rx="0.5" fill="rgba(255,255,255,0.8)"/><rect x="34" y="12" width="15" height="3" rx="0.5" fill="rgba(255,255,255,0.45)"/><rect x="20" y="21" width="20" height="2" rx="1" fill={primary} opacity="0.3"/>{[0,1,2,3].map(i=><rect key={i} x="4" y={26+i*6} width="52" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="55" width="24" height="7" rx="2" fill={primary}/></g>),
    doubledivine: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="30" height="20" rx="2" fill={primary}/><rect x="30" y="0" width="30" height="20" rx="2" fill={secondary}/><rect x="3" y="4" width="8" height="8" rx="1.5" fill="rgba(255,255,255,0.25)"/><rect x="13" y="5" width="15" height="3" rx="0.5" fill="rgba(255,255,255,0.8)"/><rect x="32" y="6" width="24" height="4.5" rx="0.5" fill="rgba(255,255,255,0.75)"/><rect x="32" y="13" width="18" height="3" rx="0.5" fill="rgba(255,255,255,0.4)"/><rect x="0" y="20" width="30" height="2" fill={primary}/><rect x="30" y="20" width="30" height="2" fill={secondary}/>{[0,1,2,3].map(i=><rect key={i} x="3" y={26+i*6} width="54" height="4" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="55" width="25" height="8" rx="2" fill={primary}/></g>),
    landscape: (<g><rect x="0" y="0" width="60" height="46" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="12" rx="2" fill={primary}/><rect x="3" y="2.5" width="6" height="6" rx="1" fill="rgba(255,255,255,0.25)"/><rect x="11" y="3" width="20" height="3" rx="0.5" fill="rgba(255,255,255,0.85)"/><rect x="11" y="7.5" width="14" height="1.8" rx="0.5" fill="rgba(255,255,255,0.45)"/><rect x="42" y="3" width="15" height="6" rx="1.5" fill="rgba(255,255,255,0.18)"/>{[0,1,2].map(i=><rect key={i} x={2+i*19} y="14" width="17" height="8" rx="1.5" fill={light} stroke={accent} strokeWidth="0.4"/>)}{[0,1,2].map(i=><rect key={i} x="2" y={25+i*4.5} width="56" height="3" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="39" width="26" height="6" rx="2" fill={primary}/></g>),
    gsttheme1: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="0" y="0" width="60" height="13" rx="2" fill={primary}/><rect x="3" y="3" width="6" height="6" rx="1" fill="rgba(255,255,255,0.25)"/><rect x="11" y="3.5" width="24" height="3" rx="0.5" fill="rgba(255,255,255,0.85)"/><rect x="40" y="2" width="17" height="9" rx="2" fill="white"/><rect x="41.5" y="4" width="14" height="5" rx="1" fill={primary}/><rect x="3" y="15" width="27" height="20" rx="2" fill={light} stroke={accent} strokeWidth="0.5"/><rect x="32" y="15" width="25" height="20" rx="2" fill={light} stroke={accent} strokeWidth="0.5"/>{[0,1,2].map(i=><rect key={i} x="3" y={39+i*5} width="54" height="3.5" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="3" y="54" width="54" height="8" rx="1.5" fill={light} stroke={accent} strokeWidth="0.5"/></g>),
    gsttheme3: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke={primary} strokeWidth="1"/><rect x="2" y="2" width="36" height="18" rx="1" fill={light}/><rect x="4" y="5" width="8" height="8" rx="1.5" fill={primary}/><rect x="14" y="5" width="22" height="3" rx="0.5" fill={primary} opacity="0.7"/><rect x="40" y="2" width="18" height="18" rx="1" fill={primary}/><rect x="42" y="7" width="14" height="4" rx="0.5" fill="rgba(255,255,255,0.75)"/><rect x="42" y="13" width="10" height="3" rx="0.5" fill="rgba(255,255,255,0.45)"/><rect x="3" y="22" width="26" height="8" rx="1" fill={light} stroke={accent} strokeWidth="0.4"/><rect x="31" y="22" width="26" height="8" rx="1" fill={light} stroke={accent} strokeWidth="0.4"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={33+i*5} width="54" height="3.5" rx="0.5" fill={i%2===0?light:'white'} stroke="#E0E0E0" strokeWidth="0.3"/>)}<rect x="32" y="56" width="25" height="7" rx="2" fill={primary}/></g>),
    tallytheme: (<g><rect x="0" y="0" width="60" height="64" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="0.5"/><rect x="10" y="3" width="40" height="3" rx="0.5" fill="#212121"/><rect x="15" y="7" width="30" height="2.5" rx="0.5" fill="#212121" opacity="0.7"/><rect x="3" y="11" width="54" height="1" fill="#212121"/><rect x="3" y="13" width="54" height="1" fill="#212121" opacity="0.4"/>{[0,1,2,3].map(i=><rect key={i} x="3" y={17+i*5} width="54" height="3" rx="0" fill="white" stroke="#212121" strokeWidth="0.4"/>)}<rect x="3" y="38" width="54" height="1" fill="#212121"/><rect x="35" y="41" width="22" height="3" rx="0.5" fill="#E0E0E0"/><rect x="35" y="46" width="22" height="3" rx="0.5" fill="#E0E0E0"/><rect x="35" y="51" width="22" height="1" fill="#212121"/><rect x="35" y="54" width="22" height="4" rx="0.5" fill="#212121"/></g>),
    thermal1: (<g><rect x="10" y="0" width="40" height="64" rx="2" fill="white" stroke="#9E9E9E" strokeWidth="0.8"/><rect x="12" y="3" width="36" height="8" rx="1" fill="#212121"/><rect x="12" y="13" width="36" height="1" fill="#9E9E9E"/>{[0,1,2,3].map(i=><rect key={i} x="12" y={17+i*7} width="36" height="4.5" rx="0.5" fill="#F5F5F5"/>)}<rect x="12" y="48" width="36" height="1" fill="#212121"/><rect x="12" y="51" width="36" height="6" rx="1" fill="#212121"/><rect x="20" y="57" width="20" height="6" rx="1" fill="#9E9E9E" opacity="0.5"/></g>),
    thermal2: (<g><rect x="10" y="0" width="40" height="64" rx="2" fill="white" stroke="#9E9E9E" strokeWidth="0.8"/><rect x="10" y="0" width="40" height="10" rx="2" fill="#212121"/><rect x="13" y="2.5" width="34" height="5" rx="0.5" fill="rgba(255,255,255,0.9)"/><rect x="12" y="12" width="36" height="1" fill="#9E9E9E"/>{[0,1,2,3].map(i=><rect key={i} x="12" y={16+i*6} width="36" height="4" rx="0.5" fill="#F5F5F5"/>)}<rect x="12" y="42" width="36" height="1" fill="#212121"/><rect x="10" y="44" width="40" height="8" rx="1" fill="#212121"/><rect x="22" y="55" width="16" height="8" rx="1" fill="#9E9E9E" opacity="0.4"/></g>),
  };

  return (
    <div onClick={onClick} style={{cursor:'pointer',borderRadius:10,border:selected?`2px solid ${primary}`:'2px solid transparent',background:selected?light:'transparent',padding:6,transition:'all 0.15s',position:'relative'}}>
      <svg viewBox={tpl.thermal?"0 0 60 64":"0 0 60 64"} width="100%" style={{display:'block',borderRadius:6,background:'white',boxShadow:'0 1px 6px rgba(0,0,0,0.10)'}}>
        {thumbs[tpl.id]||<rect x="2" y="2" width="56" height="60" rx="4" fill={light} stroke={primary} strokeWidth="1"/>}
      </svg>
      <div style={{marginTop:6,textAlign:'center'}}>
        <p style={{fontSize:11,fontWeight:selected?700:500,color:selected?primary:'#374151',lineHeight:1.3}}>{tpl.name}</p>
        {tpl.badge&&<span style={{fontSize:9,background:selected?primary:'#f1f5f9',color:selected?'white':'#64748b',padding:'1px 6px',borderRadius:10,fontWeight:600}}>{tpl.badge}</span>}
      </div>
      {selected&&<div style={{position:'absolute',top:4,right:4,width:18,height:18,borderRadius:'50%',background:primary,display:'flex',alignItems:'center',justifyContent:'center'}}><Check style={{width:10,height:10,color:'white'}}/></div>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 10. INVOICE DESIGN MODAL
// ═══════════════════════════════════════════════════════════════

export const InvoiceDesignModal = ({open,onClose,selectedTemplate,onTemplateChange,selectedTheme,onThemeChange,customColor,onCustomColorChange,sampleInvoice,sampleCompany,isDark}) => {
  const [previewHtml,setPreviewHtml]=useState('');
  const iframeRef=useRef(null);
  const activeTheme=getThemeColor(selectedTheme,customColor);
  const regularTemplates=INVOICE_TEMPLATES.filter(t=>!t.thermal);
  const thermalTemplates=INVOICE_TEMPLATES.filter(t=>t.thermal);

  useEffect(()=>{
    if(!open)return;
    const inv=sampleInvoice||makeSampleInvoice();
    const co=sampleCompany||makeSampleCompany();
    setPreviewHtml(generateInvoiceHTML(inv,co,selectedTemplate,selectedTheme,customColor));
  },[open,selectedTemplate,selectedTheme,customColor,sampleInvoice,sampleCompany]);

  const handlePrint=useCallback(()=>{
    const inv=sampleInvoice||makeSampleInvoice();
    const co=sampleCompany||makeSampleCompany();
    openInvoicePrint(inv,co,selectedTemplate,selectedTheme,customColor);
  },[sampleInvoice,sampleCompany,selectedTemplate,selectedTheme,customColor]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={['max-w-[92vw] w-[1140px] max-h-[93vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0',isDark?'bg-slate-800 border-slate-700':'bg-white border-slate-200'].join(' ')}>
        <DialogTitle className="sr-only">Invoice Design Studio</DialogTitle>
        <DialogDescription className="sr-only">Choose a Vyapar invoice theme, colour, then preview or print.</DialogDescription>

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between" style={{background:`linear-gradient(135deg,${activeTheme.primary},${activeTheme.secondary})`}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Layout className="h-5 w-5 text-white"/></div>
            <div><h2 className="text-white font-bold text-lg">Invoice Design Studio</h2><p className="text-white/60 text-xs">All Vyapar Themes · Colour Picker · Live Preview · UPI QR</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"><X className="h-4 w-4 text-white"/></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className={['w-[320px] flex-shrink-0 flex flex-col border-r overflow-y-auto',isDark?'border-slate-700 bg-slate-800':'border-slate-200 bg-slate-50/40'].join(' ')}>

            {/* Regular Templates */}
            <div className="p-4 border-b" style={{borderColor:isDark?'rgba(255,255,255,0.07)':'#e2e8f0'}}>
              <div className="flex items-center gap-2 mb-3">
                <Layout className="h-3.5 w-3.5" style={{color:activeTheme.primary}}/>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:activeTheme.primary}}>Regular A4/A5 Themes (14)</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {regularTemplates.map(tpl=>(
                  <TemplateThumb key={tpl.id} tpl={tpl} selected={selectedTemplate===tpl.id} onClick={()=>onTemplateChange(tpl.id)}
                    primary={activeTheme.primary} secondary={activeTheme.secondary} light={activeTheme.light} accent={activeTheme.accent}/>
                ))}
              </div>
            </div>

            {/* Thermal Templates */}
            <div className="p-4 border-b" style={{borderColor:isDark?'rgba(255,255,255,0.07)':'#e2e8f0'}}>
              <div className="flex items-center gap-2 mb-3">
                <Layout className="h-3.5 w-3.5" style={{color:activeTheme.primary}}/>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:activeTheme.primary}}>Thermal Roll Themes (2)</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {thermalTemplates.map(tpl=>(
                  <TemplateThumb key={tpl.id} tpl={tpl} selected={selectedTemplate===tpl.id} onClick={()=>onTemplateChange(tpl.id)}
                    primary={activeTheme.primary} secondary={activeTheme.secondary} light={activeTheme.light} accent={activeTheme.accent}/>
                ))}
              </div>
            </div>

            {/* Colours */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Palette className="h-3.5 w-3.5" style={{color:activeTheme.primary}}/>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:activeTheme.primary}}>Colour Theme</p>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {COLOR_THEMES.map(t=>(
                  <button key={t.id} onClick={()=>onThemeChange(t.id)} title={t.name}
                    style={{width:'100%',aspectRatio:'1',borderRadius:8,background:`linear-gradient(135deg,${t.primary},${t.secondary})`,border:selectedTheme===t.id?`3px solid ${t.secondary}`:'3px solid transparent',boxShadow:selectedTheme===t.id?`0 0 0 2px white, 0 0 0 4px ${t.primary}`:'none',cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {selectedTheme===t.id&&<Check style={{width:12,height:12,color:'white'}}/>}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mb-3">Selected: <span className="font-semibold" style={{color:activeTheme.primary}}>{COLOR_THEMES.find(t=>t.id===selectedTheme)?.name||'Custom'}</span></p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Custom Colour</p>
              <div className="flex items-center gap-2">
                <input type="color" value={customColor} onChange={e=>{onCustomColorChange(e.target.value);onThemeChange('custom');}} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"/>
                <Input value={customColor} onChange={e=>{onCustomColorChange(e.target.value);onThemeChange('custom');}} className={['flex-1 h-9 rounded-xl text-xs font-mono',isDark?'bg-slate-700 border-slate-600 text-slate-100':'bg-white border-slate-200'].join(' ')}/>
              </div>
            </div>

            {/* Selected template description */}
            {(()=>{const tpl=INVOICE_TEMPLATES.find(t=>t.id===selectedTemplate);return tpl?(<div className="mx-4 mb-4 rounded-xl p-3 border" style={{background:activeTheme.light,borderColor:activeTheme.accent}}><p className="text-xs font-bold" style={{color:activeTheme.primary}}>{tpl.name} {tpl.thermal?'· Thermal':'· Regular Printer'}</p><p className="text-[10px] text-slate-500 mt-1">{tpl.desc}</p></div>):null;})()}
          </div>

          {/* Right preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className={['flex-shrink-0 flex items-center justify-between px-5 py-3 border-b',isDark?'border-slate-700 bg-slate-800/60':'border-slate-100 bg-slate-50'].join(' ')}>
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-400"/>
                <span className="text-xs font-semibold text-slate-500">Live Preview</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Sample Data · 16 Themes</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePrint} size="sm" className="h-8 px-4 rounded-xl text-white text-xs font-semibold gap-1.5" style={{background:`linear-gradient(135deg,${activeTheme.primary},${activeTheme.secondary})`}}>
                  <Printer className="h-3.5 w-3.5"/>Print Preview
                </Button>
                <Button onClick={onClose} size="sm" variant="outline" className="h-8 px-4 rounded-xl text-xs">Save &amp; Close</Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4" style={{background:isDark?'#1e293b':'#e2e8f0'}}>
              <div style={{maxWidth:794,margin:'0 auto',boxShadow:'0 8px 32px rgba(0,0,0,0.18)',borderRadius:4,overflow:'hidden',background:'white'}}>
                <iframe ref={iframeRef} srcDoc={previewHtml} title="Invoice Preview"
                  style={{width:'100%',height:INVOICE_TEMPLATES.find(t=>t.id===selectedTemplate)?.thermal?500:1122,border:'none',display:'block'}}
                  sandbox="allow-same-origin"/>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ═══════════════════════════════════════════════════════════════
// 11. SAMPLE DATA
// ═══════════════════════════════════════════════════════════════

function makeSampleInvoice(){
  return{
    invoice_no:'INV/2025-26/0042',invoice_type:'tax_invoice',invoice_date:'15 Jul 2025',due_date:'14 Aug 2025',
    client_name:'Sunrise Technologies Pvt. Ltd.',client_address:'14 Patel Nagar, Ahmedabad, Gujarat – 380009',
    client_email:'accounts@sunrise.in',client_phone:'9876543210',client_gstin:'24AABCS1429B1Z5',client_state:'Gujarat',
    ship_name:'Sunrise Technologies Pvt. Ltd.',ship_address:'Plot 7, GIDC Phase-2, Vatva, Ahmedabad – 382445',
    payment_terms:'Net 30 Days',reference_no:'PO/2025/1138',place_of_supply:'Gujarat',is_interstate:false,
    notes:'Payment via NEFT/RTGS to bank details below.',
    terms_conditions:'Goods once sold will not be returned. Subject to Ahmedabad jurisdiction.',
    items:[
      {description:'GST Consultation & Monthly Filing',hsn_sac:'9983',quantity:1,unit:'month',unit_price:15000,discount_pct:0,gst_rate:18,taxable_value:15000,cgst_amount:1350,sgst_amount:1350,igst_amount:0,total_amount:17700},
      {description:'Income Tax Return Filing (3 Individuals)',hsn_sac:'9983',quantity:3,unit:'nos',unit_price:2500,discount_pct:10,gst_rate:18,taxable_value:6750,cgst_amount:607.5,sgst_amount:607.5,igst_amount:0,total_amount:7965},
      {description:'ROC Annual Compliance Package',hsn_sac:'9983',quantity:1,unit:'service',unit_price:8500,discount_pct:0,gst_rate:18,taxable_value:8500,cgst_amount:765,sgst_amount:765,igst_amount:0,total_amount:10030},
    ],
    subtotal:31000,total_discount:750,total_taxable:30250,total_cgst:2722.5,total_sgst:2722.5,total_igst:0,
    grand_total:35695,amount_paid:10000,amount_due:25695,shipping_charges:0,round_off:0,
  };
}

function makeSampleCompany(){
  return{
    name:'Manthan Desai & Associates',
    address:'302, Shivalay Complex, Ring Road, Surat – 395002, Gujarat',
    gstin:'24AABCM1234F1ZA',phone:'0261-2345678',
    bank_name:'HDFC Bank',bank_account:'50200012345678',bank_ifsc:'HDFC0001234',
    upi_id:'manthandesai@hdfcbank',
  };
}
