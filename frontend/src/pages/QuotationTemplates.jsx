// QuotationTemplates.jsx
// Based on InvoiceTemplates but simplified for quotation

export function generateQuotationHTML(qtn, options = {}) {
  const {
    company = {},
    theme = 'classic_blue',
    template = 'classic',
    customColor = '#0D3B66',
  } = options;

  const primary = customColor || '#0D3B66';

  const fmt = (n) =>
    new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n || 0);

  const items = qtn.items || [];

  const subtotal = items.reduce(
    (s, i) => s + (i.quantity || 0) * (i.unit_price || 0),
    0
  );

  const gstAmount = subtotal * ((qtn.gst_rate || 0) / 100);
  const total = subtotal + gstAmount;

  return `
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 20px;
        color: #222;
      }
      .header {
        display: flex;
        justify-content: space-between;
        border-bottom: 2px solid ${primary};
        padding-bottom: 10px;
        margin-bottom: 20px;
      }
      .title {
        font-size: 28px;
        font-weight: bold;
        color: ${primary};
      }
      .box {
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th {
        background: ${primary};
        color: white;
        padding: 8px;
        font-size: 12px;
      }
      td {
        padding: 8px;
        border-bottom: 1px solid #ddd;
        font-size: 12px;
      }
      .right {
        text-align: right;
      }
      .total {
        font-weight: bold;
        font-size: 14px;
      }
      .footer {
        margin-top: 40px;
        font-size: 12px;
      }
    </style>
  </head>

  <body>

    <div class="header">
      <div>
        <div class="title">QUOTATION</div>
        <div>No: ${qtn.quotation_no || ''}</div>
        <div>Date: ${qtn.date || ''}</div>
      </div>

      <div style="text-align:right">
        <strong>${company.name || ''}</strong><br/>
        ${company.address || ''}<br/>
        ${company.phone || ''}<br/>
        ${company.email || ''}
      </div>
    </div>

    <div class="box">
      <strong>Bill To:</strong><br/>
      ${qtn.client_name || ''}<br/>
      ${qtn.client_address || ''}<br/>
      ${qtn.client_email || ''}<br/>
      ${qtn.client_phone || ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (it, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${it.description || ''}</td>
            <td class="right">${it.quantity || 0}</td>
            <td class="right">₹${fmt(it.unit_price)}</td>
            <td class="right">₹${fmt(
              (it.quantity || 0) * (it.unit_price || 0)
            )}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <table style="margin-top:20px;width:300px;float:right">
      <tr>
        <td>Subtotal</td>
        <td class="right">₹${fmt(subtotal)}</td>
      </tr>
      <tr>
        <td>GST (${qtn.gst_rate || 0}%)</td>
        <td class="right">₹${fmt(gstAmount)}</td>
      </tr>
      <tr class="total">
        <td>Total</td>
        <td class="right">₹${fmt(total)}</td>
      </tr>
    </table>

    <div style="clear:both"></div>

    <div class="footer">
      <strong>Terms:</strong><br/>
      ${qtn.payment_terms || ''}<br/><br/>

      <strong>Notes:</strong><br/>
      ${qtn.notes || ''}
    </div>

  </body>
  </html>
  `;
}
