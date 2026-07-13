/**
 * bankSync — keep the firm's bank account in sync across the three places it
 * can be entered:
 *   1. Bank Accounts page       (backend bank_accounts collection)
 *   2. Invoice Settings         (localStorage inv settings + company record)
 *   3. Quotation Settings       (localStorage qtn settings + company record)
 *
 * The company record (backend) is the single source of truth. The backend
 * already mirrors changes between the company record and the bank_accounts
 * collection; these client helpers make sure both localStorage settings blobs
 * reflect the same bank details immediately, without needing a page reload.
 */

const INV_KEY = 'taskosphere_inv_settings_v2';
const QUO_KEY = 'taskosphere_qtn_settings_v2';

// The canonical bank field names used by the Invoice/Quotation settings forms.
export const BANK_FIELDS = [
  'bank_account_holder',
  'bank_name',
  'bank_account_no',
  'bank_ifsc',
  'bank_branch',
  'bank_account_type',
  'upi_id',
];

function readAll(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

function writeBankInto(key, companyId, bank) {
  const all = readAll(key);
  all[companyId] = { ...(all[companyId] || {}), ...bank };
  localStorage.setItem(key, JSON.stringify(all));
}

/** Keep only the recognised bank fields from an arbitrary object. */
export function pickBankFields(obj = {}) {
  const out = {};
  BANK_FIELDS.forEach((f) => { if (obj[f] !== undefined) out[f] = obj[f]; });
  return out;
}

/** Mirror a set of bank fields into BOTH the invoice and quotation settings. */
export function mirrorBankToSettings(companyId, bank) {
  if (!companyId) return;
  const clean = pickBankFields(bank);
  writeBankInto(INV_KEY, companyId, clean);
  writeBankInto(QUO_KEY, companyId, clean);
}

/**
 * Extract bank fields (form shape) from a company record. Only returns fields
 * that actually hold a value so it can be safely overlaid on top of the
 * locally-stored settings without wiping existing values.
 */
export function bankFromCompany(company) {
  if (!company) return {};
  const map = {
    bank_account_holder: company.bank_account_name || company.bank_account_holder || '',
    bank_name:           company.bank_name || '',
    bank_account_no:     company.bank_account_no || '',
    bank_ifsc:           company.bank_ifsc || '',
    bank_branch:         company.bank_branch || '',
    bank_account_type:   company.bank_account_type || '',
    upi_id:              company.upi_id || '',
  };
  const out = {};
  Object.entries(map).forEach(([k, v]) => { if (v) out[k] = v; });
  return out;
}

/** Convert a Bank Accounts page record into settings-form bank fields. */
export function bankFromAccount(account) {
  if (!account) return {};
  const type = (account.account_type || '').toString();
  return pickBankFields({
    bank_account_holder: account.account_holder || '',
    bank_name:           account.bank_name || '',
    bank_account_no:     account.account_number || account.account_number_full || '',
    bank_ifsc:           account.ifsc || '',
    bank_branch:         account.branch || '',
    bank_account_type:   type ? type.charAt(0).toUpperCase() + type.slice(1) : '',
    upi_id:              account.upi_id || '',
  });
}
