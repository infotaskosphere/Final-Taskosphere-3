/**
 * frontend/src/lib/pincode.js
 * ════════════════════════════════════════════════════════════════════════
 * PIN code → Indian State / GST state-code lookup, shared by every place
 * in the app that needs to auto-fill a state or auto-decide CGST+SGST vs
 * IGST from a 6-digit PIN (Invoicing, Invoice Settings, the Client form).
 *
 * Talks to GET /api/pincode/{pincode} (backend/pincode_lookup.py). Results
 * are cached in memory for the session so re-typing/re-visiting the same
 * PIN doesn't re-hit the network.
 */
import api from '@/lib/api';

const cache = new Map();

/**
 * Resolve a PIN code to { pincode, valid, state, state_code }.
 * Returns null immediately (no network call) if `pincode` isn't a
 * complete 6-digit number yet — call this on every keystroke and it will
 * simply no-op until the 6th digit lands.
 */
export async function lookupPincode(pincode) {
  const digits = String(pincode || '').replace(/\D/g, '');
  if (digits.length !== 6) return null;

  if (cache.has(digits)) return cache.get(digits);

  try {
    const { data } = await api.get(`/pincode/${digits}`);
    cache.set(digits, data);
    return data;
  } catch {
    // Network/lookup failure — never block the form, just skip auto-fill.
    return null;
  }
}

/** True → IGST (inter-state). False → CGST+SGST (intra-state). null → unknown. */
export function isInterState(stateCodeA, stateCodeB) {
  if (!stateCodeA || !stateCodeB) return null;
  return stateCodeA !== stateCodeB;
}

// Official GST State/UT codes (2-digit, CBIC) — handy for local fallback
// comparisons (e.g. matching a client's already-saved `state` name to a
// code without a network round-trip).
export const GST_STATE_CODES = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03',
  'Chandigarh': '04', 'Uttarakhand': '05', 'Haryana': '06', 'Delhi': '07',
  'Rajasthan': '08', 'Uttar Pradesh': '09', 'Bihar': '10', 'Sikkim': '11',
  'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14',
  'Mizoram': '15', 'Tripura': '16', 'Meghalaya': '17', 'Assam': '18',
  'West Bengal': '19', 'Jharkhand': '20', 'Odisha': '21',
  'Chhattisgarh': '22', 'Madhya Pradesh': '23', 'Gujarat': '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26', 'Maharashtra': '27',
  'Karnataka': '29', 'Goa': '30', 'Lakshadweep': '31', 'Kerala': '32',
  'Tamil Nadu': '33', 'Puducherry': '34', 'Andaman and Nicobar Islands': '35',
  'Telangana': '36', 'Andhra Pradesh': '37', 'Ladakh': '38',
  'Other Territory': '97',
};

export default { lookupPincode, isInterState, GST_STATE_CODES };
