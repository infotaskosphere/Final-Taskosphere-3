// QuotationTemplates.jsx
import { generateInvoiceHTML } from './InvoiceTemplates';

export function generateQuotationHTML(qtn, options = {}) {
  const { company = {}, theme, template, customColor } = options;

  // Map quotation fields to invoice shape
  const inv = {
    invoice_no:       qtn.quotation_no || '',
    invoice_type:     'estimate',
    invoice_date:     qtn.date || '',
    due_date:         qtn.validity_days
                        ? `Valid for ${qtn.validity_days} days`
                        : '',
    client_name:      qtn.client_name || '',
    client_address:   qtn.client_address || '',
    client_email:     qtn.client_email || '',
    client_phone:     qtn.client_phone || '',
    client_gstin:     qtn.client_gstin || '',
    client_state:     qtn.client_state || '',
    is_interstate:    qtn.is_interstate || false,
    payment_terms:    qtn.payment_terms || '',
    reference_no:     qtn.subject || '',
    notes:            qtn.notes || '',
    terms_conditions: (qtn.extra_terms || []).join('\n'),
    items: (qtn.items || []).map(it => ({
      description:   it.description || '',
      hsn_sac:       it.hsn_sac || '',
      quantity:      it.quantity || 1,
      unit:          it.unit || 'service',
      unit_price:    it.unit_price || 0,
      discount_pct:  it.discount_pct || 0,
      gst_rate:      qtn.gst_rate || 18,
    })),
    gst_rate:         qtn.gst_rate || 18,
    discount_amount:  0,
    shipping_charges: 0,
    other_charges:    0,
    amount_paid:      0,
  };

  // Override company.invoice_title to "Quotation" so all templates
  // display "Quotation" instead of "Tax Invoice" or "Estimate"
  const companyOverride = {
    ...company,
    invoice_title: 'Quotation',
  };

  return generateInvoiceHTML(inv, {
    company:     companyOverride,
    template:    template    || qtn.invoice_template    || 'classic',
    theme:       theme       || qtn.invoice_theme       || 'classic_blue',
    customColor: customColor || qtn.invoice_custom_color || '#0D3B66',
  });
}
