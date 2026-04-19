// QuotationTemplates.jsx  — v3.0
// Generates quotation HTML that exactly matches the backend PDF layout.
// Used for: live preview in wizard, print, WhatsApp attachment description.

// ─── helpers ─────────────────────────────────────────────────────────────────
const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
  'Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function amountInWords(n) {
  try {
    const rupees = Math.floor(n);
    const paise  = Math.round((n - rupees) * 100);
    function grp(num) {
      if (!num) return '';
      if (num < 20)  return ONES[num] + ' ';
      if (num < 100) return TENS[Math.floor(num/10)] + (num%10 ? ' '+ONES[num%10] : '') + ' ';
      return ONES[Math.floor(num/100)] + ' Hundred ' + grp(num%100);
    }
    function convert(num) {
      if (!num) return 'Zero ';
      let r = '';
      const cr = Math.floor(num/1e7); num %= 1e7;
      const lk = Math.floor(num/1e5); num %= 1e5;
      const th = Math.floor(num/1e3); num %= 1e3;
      if (cr) r += grp(cr) + 'Crore ';
      if (lk) r += grp(lk) + 'Lakh ';
      if (th) r += grp(th) + 'Thousand ';
      r += grp(num);
      return r;
    }
    const words = convert(rupees).trim();
    const paiseStr = paise ? ` and ${convert(paise).trim()} Paise` : '';
    return `${words}${paiseStr} Rupees Only`;
  } catch {
    return `${n.toFixed(2)} Rupees Only`;
  }
}

function fmtNum(n) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function hexToRgb(hex) {
  try {
    const h = hex.replace('#','');
    return `${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}`;
  } catch { return '13, 59, 102'; }
}

function lighten(hex, pct) {
  if (pct === undefined) pct = 0.92;
  try {
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    const lr = Math.round(r + (255-r)*pct);
    const lg = Math.round(g + (255-g)*pct);
    const lb = Math.round(b + (255-b)*pct);
    return '#'+lr.toString(16).padStart(2,'0')+lg.toString(16).padStart(2,'0')+lb.toString(16).padStart(2,'0');
  } catch { return '#e8f0fb'; }
}

// ─── main export ─────────────────────────────────────────────────────────────
export function generateQuotationHTML(qtn, options) {
  if (!options) options = {};
  const company = options.company || {};
  const customColor = options.customColor;

  const brandColor = customColor || qtn.invoice_custom_color || company.brand_color || '#0D3B66';
  const brandLight = lighten(brandColor, 0.92);
  const brandRgb   = hexToRgb(brandColor);

  // ── Compute totals ─────────────────────────────────────────────────────────
  const items = (qtn.items || []).filter(function(it){ return it.description || it.unit_price; });
  const subtotal = items.reduce(function(s, it){ return s + (parseFloat(it.unit_price)||0) * (parseFloat(it.quantity)||1); }, 0);
  const gstRate    = parseFloat(qtn.gst_rate || 0);
  const gstAmount  = Math.round(subtotal * gstRate) / 100;
  const total      = subtotal + gstAmount;

  // ── scope items ────────────────────────────────────────────────────────────
  const scopeItems = Array.isArray(qtn.scope_of_work)
    ? qtn.scope_of_work.filter(Boolean)
    : (qtn.scope_of_work ? [qtn.scope_of_work] : []);

  const extraTerms = (qtn.extra_terms || []).filter(Boolean);

  // ── Item rows ──────────────────────────────────────────────────────────────
  const itemRows = items.map(function(it, i) {
    const qty    = parseFloat(it.quantity) || 1;
    const price  = parseFloat(it.unit_price) || 0;
    const amount = qty * price;
    const bg     = i % 2 === 0 ? '#ffffff' : brandLight;
    return '<tr style="background:'+bg+'">'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#1e293b;">'+(i+1)+'</td>'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;font-size:12px;color:#1e293b;">'+(it.description||'')+(it.unit ? '<br><span style="font-size:10px;color:#94a3b8;">'+it.unit+'</span>' : '')+'</td>'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#1e293b;">'+(qty%1===0?qty.toFixed(0):qty.toFixed(2))+'</td>'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">'+(it.unit||'service')+'</td>'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;color:#1e293b;">Rs. '+fmtNum(price)+'</td>'
      + '<td style="padding:7px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:600;color:#1e293b;">Rs. '+fmtNum(amount)+'</td>'
      + '</tr>';
  }).join('');

  // ── Totals ─────────────────────────────────────────────────────────────────
  var totalsHTML = '<tr>'
    + '<td colspan="5" style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:600;color:#475569;background:'+brandLight+';">Sub Total</td>'
    + '<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:700;color:#1e293b;background:'+brandLight+';">Rs. '+fmtNum(subtotal)+'</td>'
    + '</tr>';

  if (gstRate > 0) {
    totalsHTML += '<tr>'
      + '<td colspan="5" style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;color:#475569;background:'+brandLight+';">GST ('+gstRate+'%)</td>'
      + '<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:600;color:#1e293b;background:'+brandLight+';">Rs. '+fmtNum(gstAmount)+'</td>'
      + '</tr>';
  }

  totalsHTML += '<tr>'
    + '<td colspan="5" style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-size:13px;font-weight:700;color:#ffffff;background:rgb('+brandRgb+');">TOTAL PAYABLE</td>'
    + '<td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-size:13px;font-weight:700;color:#ffffff;background:rgb('+brandRgb+');">Rs. '+fmtNum(total)+'</td>'
    + '</tr>';

  // ── Terms ──────────────────────────────────────────────────────────────────
  var allTerms = [];
  if (qtn.validity_days) allTerms.push('Validity of Quotation: '+qtn.validity_days+' days');
  if (qtn.payment_terms) allTerms.push('Payment Terms: '+qtn.payment_terms);
  if (qtn.timeline)      allTerms.push('Timeline: '+qtn.timeline);
  if (qtn.advance_terms) allTerms.push('Advance: '+qtn.advance_terms);
  extraTerms.forEach(function(t){ allTerms.push(t); });

  var termsHTML = allTerms.length
    ? allTerms.map(function(t, i){ return '<p style="margin:0 0 4px;font-size:12px;color:#475569;">'+(i+1)+'. '+t+'</p>'; }).join('')
    : '';

  // ── Scope of work ──────────────────────────────────────────────────────────
  var scopeHTML = scopeItems.length
    ? '<div style="margin:16px 0;padding:14px 16px;background:'+brandLight+';border-radius:6px;">'
      + '<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.08em;">Scope of Work / Services</p>'
      + scopeItems.map(function(s){ return '<p style="margin:0 0 4px;font-size:12px;color:#1e293b;"><span style="color:rgb('+brandRgb+');font-weight:700;">- </span>'+s+'</p>'; }).join('')
      + '</div>'
    : '';

  // ── Bank details ───────────────────────────────────────────────────────────
  var hasBankDetails = company.bank_account_no || company.bank_name;
  var bankHTML = hasBankDetails
    ? '<div style="margin:16px 0;padding-top:12px;border-top:2px solid '+brandLight+';">'
      + '<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.08em;">Bank Details</p>'
      + '<table style="border-collapse:collapse;font-size:12px;">'
      + (company.bank_account_name ? '<tr><td style="padding:2px 12px 2px 0;font-weight:600;color:#475569;">Account Name:</td><td style="color:#1e293b;">'+company.bank_account_name+'</td></tr>' : '')
      + (company.bank_name ? '<tr><td style="padding:2px 12px 2px 0;font-weight:600;color:#475569;">Bank Name:</td><td style="color:#1e293b;">'+company.bank_name+'</td></tr>' : '')
      + (company.bank_account_no ? '<tr><td style="padding:2px 12px 2px 0;font-weight:600;color:#475569;">Account No:</td><td style="color:#1e293b;">'+company.bank_account_no+'</td></tr>' : '')
      + (company.bank_ifsc ? '<tr><td style="padding:2px 12px 2px 0;font-weight:600;color:#475569;">IFSC Code:</td><td style="color:#1e293b;">'+company.bank_ifsc+'</td></tr>' : '')
      + '</table>'
      + '</div>'
    : '';

  // ── Notes ─────────────────────────────────────────────────────────────────
  var notesHTML = qtn.notes
    ? '<p style="margin:10px 0 0;font-size:11px;color:#64748b;font-style:italic;">'+qtn.notes+'</p>'
    : '';

  // ── Signature ─────────────────────────────────────────────────────────────
  var sigHTML = '<div style="margin-top:32px;text-align:right;">'
    + (company.signature_base64 ? '<img src="'+company.signature_base64+'" style="height:48px;margin-bottom:4px;display:block;margin-left:auto;" alt="Signature" />' : '<div style="height:48px;"></div>')
    + '<div style="display:inline-block;min-width:160px;text-align:center;">'
    + '<div style="border-top:1.5px solid rgb('+brandRgb+');padding-top:6px;">'
    + '<p style="margin:0;font-size:12px;font-weight:600;color:#1e293b;">For '+(company.name||'')+'</p>'
    + '<p style="margin:2px 0 0;font-size:10px;color:#64748b;">Authorized Signatory</p>'
    + '</div></div></div>';

  var amtWords = amountInWords(total);
  var today = qtn.date || new Date().toISOString().slice(0,10);

  return '<!DOCTYPE html>'
    + '<html lang="en"><head><meta charset="UTF-8"/>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    + '<title>Quotation '+(qtn.quotation_no||'')+'</title>'
    + '<style>* { box-sizing: border-box; } body { margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#1e293b; } .page { max-width:820px;margin:0 auto;background:#fff;border-radius:8px;box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden; } @media print { body { padding:0;background:#fff; } .page { box-shadow:none;border-radius:0; } }</style>'
    + '</head><body><div class="page">'

    // HEADER
    + '<div style="background:rgb('+brandRgb+');padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start;">'
    + '<div style="flex:1;min-width:0;">'
    + (company.logo_base64 ? '<img src="'+company.logo_base64+'" style="height:40px;margin-bottom:8px;display:block;" alt="Logo" />' : '')
    + '<p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">'+(company.name||'')+'</p>'
    + (company.address ? '<p style="margin:3px 0 0;font-size:10.5px;color:rgba(255,255,255,.80);white-space:pre-line;">'+company.address+'</p>' : '')
    + '<p style="margin:3px 0 0;font-size:10px;color:rgba(255,255,255,.75);">'
    + [company.phone ? 'Ph: '+company.phone : '', company.email||''].filter(Boolean).join('  ·  ')
    + '</p>'
    + (company.gstin ? '<p style="margin:3px 0 0;font-size:10px;font-weight:600;color:#ffffff;">GSTIN: '+company.gstin+'</p>' : '')
    + '</div>'
    + '<div style="text-align:right;flex-shrink:0;padding-left:20px;">'
    + '<p style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:.03em;">QUOTATION</p>'
    + (qtn.quotation_no ? '<p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,.80);"># '+qtn.quotation_no+'</p>' : '')
    + '<p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,.75);">Date: '+today+'</p>'
    + '<p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,.75);">Valid for '+(qtn.validity_days||30)+' days from date of issue</p>'
    + '</div></div>'

    // BODY
    + '<div style="padding:20px 28px;">'

    // Client + Details grid
    + '<div style="display:flex;gap:16px;margin-bottom:4px;">'
    + '<div style="flex:1;padding:14px 16px;background:'+brandLight+';border-radius:6px;border-left:3px solid rgb('+brandRgb+');">'
    + '<p style="margin:0 0 6px;font-size:10px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.1em;">Prepared For</p>'
    + '<p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">'+(qtn.client_name||'')+'</p>'
    + (qtn.client_address ? '<p style="margin:3px 0 0;font-size:11px;color:#64748b;">'+qtn.client_address+'</p>' : '')
    + (qtn.client_phone ? '<p style="margin:2px 0 0;font-size:11px;color:#64748b;">'+qtn.client_phone+'</p>' : '')
    + (qtn.client_email ? '<p style="margin:2px 0 0;font-size:11px;color:#64748b;">'+qtn.client_email+'</p>' : '')
    + (qtn.client_gstin ? '<p style="margin:4px 0 0;font-size:11px;font-weight:600;color:#1e293b;">GSTIN: '+qtn.client_gstin+'</p>' : '')
    + '</div>'
    + '<div style="min-width:200px;padding:14px 16px;background:'+brandLight+';border-radius:6px;">'
    + '<p style="margin:0 0 6px;font-size:10px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.1em;">Quotation Details</p>'
    + '<table style="border-collapse:collapse;font-size:11.5px;width:100%;">'
    + (qtn.quotation_no ? '<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-weight:600;">Quotation No:</td><td style="color:#1e293b;">'+qtn.quotation_no+'</td></tr>' : '')
    + '<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-weight:600;">Date:</td><td style="color:#1e293b;">'+today+'</td></tr>'
    + '<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-weight:600;">Valid For:</td><td style="color:#1e293b;">'+(qtn.validity_days||30)+' days</td></tr>'
    + (qtn.subject ? '<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-weight:600;">Subject:</td><td style="color:#1e293b;">'+qtn.subject+'</td></tr>' : '')
    + (qtn.payment_terms ? '<tr><td style="padding:2px 8px 2px 0;color:#64748b;font-weight:600;">Payment:</td><td style="color:#1e293b;">'+qtn.payment_terms+'</td></tr>' : '')
    + '</table></div></div>'

    // Greeting
    + '<div style="margin:14px 0 0;padding:10px 16px;background:'+brandLight+';border-radius:6px;">'
    + (qtn.subject ? '<p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:rgb('+brandRgb+');">Subject: Quotation for '+qtn.subject+'</p>' : '')
    + '<p style="margin:0;font-size:12px;color:#475569;">Dear '+(qtn.client_name||'Sir / Madam')+',<br>Thank you for your inquiry. We are pleased to submit our quotation as under:</p>'
    + '</div>'

    // Scope
    + scopeHTML

    // Items table
    + '<div style="margin:16px 0;">'
    + '<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.08em;">Quotation Details</p>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    + '<thead><tr style="background:rgb('+brandRgb+');">'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#fff;font-size:11px;font-weight:700;width:36px;">#</th>'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:left;color:#fff;font-size:11px;font-weight:700;">Description</th>'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#fff;font-size:11px;font-weight:700;width:54px;">Qty</th>'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:center;color:#fff;font-size:11px;font-weight:700;width:64px;">Unit</th>'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:right;color:#fff;font-size:11px;font-weight:700;width:100px;">Unit Price</th>'
    + '<th style="padding:8px;border:1px solid #e2e8f0;text-align:right;color:#fff;font-size:11px;font-weight:700;width:100px;">Amount (Rs)</th>'
    + '</tr></thead>'
    + '<tbody>'+(itemRows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8;font-style:italic;border:1px solid #e2e8f0;">No items added</td></tr>')+'</tbody>'
    + '<tfoot>'+totalsHTML+'</tfoot>'
    + '</table></div>'

    // Amount in words
    + '<div style="padding:8px 12px;background:'+brandLight+';border-radius:4px;margin-bottom:16px;">'
    + '<p style="margin:0;font-size:11px;font-weight:700;color:#475569;">INVOICE AMOUNT IN WORDS: <span style="font-weight:400;font-style:italic;">'+amtWords+'</span></p>'
    + '</div>'

    // Terms
    + (termsHTML ? '<div style="margin:16px 0;padding-top:12px;border-top:2px solid '+brandLight+';">'
      + '<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgb('+brandRgb+');text-transform:uppercase;letter-spacing:.08em;">Terms &amp; Conditions</p>'
      + termsHTML + '</div>' : '')

    // Bank
    + bankHTML

    // Notes
    + notesHTML

    // Signature
    + sigHTML

    // Footer
    + '<div style="margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:center;">'
    + '<p style="margin:0;font-size:10px;color:#94a3b8;">This is a computer-generated document.  ·  '+(qtn.quotation_no||'Quotation')+'</p>'
    + '<p style="margin:2px 0 0;font-size:10px;color:rgb('+brandRgb+');font-style:italic;">We look forward to working with you.</p>'
    + '</div>'

    + '</div></div></body></html>';
}
