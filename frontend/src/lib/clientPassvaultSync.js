// frontend/src/lib/clientPassvaultSync.js
// ─────────────────────────────────────────────────────────────────────────────
// Bi-directional autofill between a Client record and a PassVault entry.
// Rule: NEVER overwrite a non-empty field on either side. Only fill blanks.
// ─────────────────────────────────────────────────────────────────────────────
import api from '@/lib/api'; // adjust if your axios instance lives elsewhere

const isEmpty = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const pick = (...vals) => {
  for (const v of vals) if (!isEmpty(v)) return v;
  return '';
};

const looksLikeEmail = (s) => typeof s === 'string' && /\S+@\S+\.\S+/.test(s);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find the best matching contact_person by holder_name.
// Uses case-insensitive partial match so "NIRAV ASHOK SHAH" ↔ "Nirav Shah" etc.
// Returns the matched contact or null.
// ─────────────────────────────────────────────────────────────────────────────
function findContactByName(contacts = [], holderName = '') {
  if (!holderName || !contacts.length) return null;
  const needle = holderName.trim().toLowerCase();
  // 1. Exact match
  let found = contacts.find(
    (c) => c?.name && c.name.trim().toLowerCase() === needle
  );
  if (found) return found;
  // 2. Contains match (holder_name contains contact name or vice-versa)
  found = contacts.find(
    (c) =>
      c?.name &&
      (needle.includes(c.name.trim().toLowerCase()) ||
        c.name.trim().toLowerCase().includes(needle))
  );
  return found || null;
}

/**
 * Map a Client record → partial PassVault fields.
 * When entry.holder_name is set and matches a specific contact_person,
 * that contact's DIN / phone / email is preferred over the first contact.
 */
export function clientToPassvaultPatch(client, entry = {}) {
  if (!client) return {};
  const patch = {};

  // Find the contact_person that matches holder_name (if any)
  const contacts = Array.isArray(client.contact_persons) ? client.contact_persons : [];
  const matchedContact = findContactByName(contacts, entry.holder_name);
  // Fallback to first contact if no name match
  const primaryContact = matchedContact || contacts[0] || null;

  // mobile  ←  matched contact phone > client.phone > first contact phone
  if (isEmpty(entry.mobile)) {
    const p = pick(
      matchedContact?.phone,
      client.phone,
      primaryContact?.phone
    );
    if (!isEmpty(p)) patch.mobile = p;
  }

  // username ← matched contact email > client email > first contact email
  if (isEmpty(entry.username)) {
    const e = pick(
      matchedContact?.email,
      client.email,
      primaryContact?.email
    );
    if (!isEmpty(e)) patch.username = e;
  }

  // holder_name ← company_name OR primary contact name
  if (isEmpty(entry.holder_name)) {
    const h =
      entry.holder_type === 'INDIVIDUAL'
        ? pick(primaryContact?.name, client.company_name)
        : pick(client.company_name, primaryContact?.name);
    if (!isEmpty(h)) patch.holder_name = h;
  }

  // holder_pan  ← matched contact pan > client.pan
  if (isEmpty(entry.holder_pan)) {
    const pan = pick(matchedContact?.pan, client.pan);
    if (!isEmpty(pan)) patch.holder_pan = String(pan).toUpperCase();
  }

  // holder_din  ← matched contact DIN > any contact DIN
  if (isEmpty(entry.holder_din)) {
    const d = !isEmpty(matchedContact?.din)
      ? matchedContact.din
      : pick(...contacts.map((c) => c?.din));
    if (!isEmpty(d)) patch.holder_din = d;
  }

  // trade_name  ← company_name
  if (isEmpty(entry.trade_name) && !isEmpty(client.company_name)) {
    patch.trade_name = client.company_name;
  }

  // client_id / client_name linkage
  if (isEmpty(entry.client_id) && !isEmpty(client.id)) {
    patch.client_id = String(client.id);
  }
  if (isEmpty(entry.client_name) && !isEmpty(client.company_name)) {
    patch.client_name = client.company_name;
  }

  return patch;
}

/**
 * When holder_name changes in the form, re-evaluate which contact_person
 * to use and return any updated fields (DIN, mobile, email).
 * Only fills BLANK fields — never overwrites existing user input.
 */
export function refillByHolderName(client, currentForm) {
  if (!client) return {};
  const contacts = Array.isArray(client.contact_persons) ? client.contact_persons : [];
  const matchedContact = findContactByName(contacts, currentForm.holder_name);
  if (!matchedContact) return {};

  const patch = {};

  if (isEmpty(currentForm.holder_din) && !isEmpty(matchedContact.din)) {
    patch.holder_din = matchedContact.din;
  }
  if (isEmpty(currentForm.mobile) && !isEmpty(matchedContact.phone)) {
    patch.mobile = matchedContact.phone;
  }
  if (isEmpty(currentForm.username) && !isEmpty(matchedContact.email)) {
    patch.username = matchedContact.email;
  }
  if (isEmpty(currentForm.holder_pan) && !isEmpty(matchedContact.pan)) {
    patch.holder_pan = String(matchedContact.pan).toUpperCase();
  }

  return patch;
}

/**
 * Aggregate one-or-more PassVault entries → partial Client fields.
 * Walks all entries; first non-empty value per field wins.
 */
export function passvaultToClientPatch(entries, client = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return {};
  const patch = {};

  // phone ← any entry.mobile
  if (isEmpty(client.phone)) {
    const m = entries.map((e) => e?.mobile).find((v) => !isEmpty(v));
    if (!isEmpty(m)) patch.phone = m;
  }

  // email ← any entry.username that looks like an email
  if (isEmpty(client.email)) {
    const e = entries.map((x) => x?.username).find(looksLikeEmail);
    if (!isEmpty(e)) patch.email = e;
  }

  // pan ← any holder_pan
  if (isEmpty(client.pan)) {
    const p = entries.map((e) => e?.holder_pan).find((v) => !isEmpty(v));
    if (!isEmpty(p)) patch.pan = String(p).toUpperCase();
  }

  // Backfill contact_persons entries by matching holder_name
  const cps = Array.isArray(client.contact_persons) ? [...client.contact_persons] : [];

  // For each entry that has a holder_name, find or create the matching contact
  entries.forEach((e) => {
    if (!e?.holder_name) return;
    const idx = cps.findIndex(
      (c) => c?.name && c.name.trim().toLowerCase() === e.holder_name.trim().toLowerCase()
    );
    const cp = idx >= 0 ? { ...cps[idx] } : { name: e.holder_name };
    let changed = idx < 0; // new contact = changed

    if (isEmpty(cp.din) && !isEmpty(e.holder_din)) { cp.din = e.holder_din; changed = true; }
    if (isEmpty(cp.phone) && !isEmpty(e.mobile)) { cp.phone = e.mobile; changed = true; }
    if (isEmpty(cp.email) && looksLikeEmail(e.username)) { cp.email = e.username; changed = true; }

    if (changed) {
      if (idx >= 0) cps[idx] = cp;
      else cps.push(cp);
    }
  });

  // Legacy: also backfill first contact if no holder_name match
  const cp0 = { ...(cps[0] || { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }) };
  const origCp0 = cps[0] || {};
  let cp0Changed = false;

  if (isEmpty(cp0.din)) {
    const d = entries.map((e) => e?.holder_din).find((v) => !isEmpty(v));
    if (!isEmpty(d)) { cp0.din = d; cp0Changed = true; }
  }
  if (isEmpty(cp0.name)) {
    const n = entries
      .filter((e) => e?.holder_type === 'INDIVIDUAL')
      .map((e) => e?.holder_name)
      .find((v) => !isEmpty(v));
    if (!isEmpty(n)) { cp0.name = n; cp0Changed = true; }
  }
  if (isEmpty(cp0.phone) && !isEmpty(patch.phone)) { cp0.phone = patch.phone; cp0Changed = true; }
  if (isEmpty(cp0.email) && !isEmpty(patch.email)) { cp0.email = patch.email; cp0Changed = true; }

  const changed = ['din', 'name', 'phone', 'email'].some((k) => cp0[k] !== origCp0[k]);
  if (cp0Changed || changed) {
    cps[0] = cp0;
  }

  if (JSON.stringify(cps) !== JSON.stringify(client.contact_persons || [])) {
    patch.contact_persons = cps;
  }

  return patch;
}

/**
 * Fetch the client linked to a passvault entry (by client_id) and return
 * the fields that should be merged into the entry form. Safe: returns {} on
 * any error or when there's nothing to fill.
 */
export async function fetchClientFillForEntry(entry) {
  if (!entry?.client_id) return {};
  try {
    const r = await api.get(`/clients/${entry.client_id}`);
    return clientToPassvaultPatch(r.data, entry);
  } catch {
    // fallback: list and find — some backends don't expose /clients/:id
    try {
      const r = await api.get('/clients');
      const list = Array.isArray(r.data) ? r.data : [];
      const c = list.find((x) => String(x.id) === String(entry.client_id));
      return c ? clientToPassvaultPatch(c, entry) : {};
    } catch {
      return {};
    }
  }
}

/**
 * Fetch all passvault entries linked to a client and return the merge patch
 * for the client form. Safe: returns {} on any error.
 */
export async function fetchPassvaultFillForClient(client) {
  if (!client?.id) return {};
  try {
    // Try server-side filter first
    let entries = [];
    try {
      const r = await api.get('/passwords', { params: { client_id: client.id } });
      entries = Array.isArray(r.data) ? r.data : r.data?.items || [];
    } catch {
      const r = await api.get('/passwords');
      const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
      entries = all.filter((e) => String(e.client_id) === String(client.id));
    }
    return passvaultToClientPatch(entries, client);
  } catch {
    return {};
  }
}

/**
 * After a Client is saved, push any newly-filled values into linked PassVault
 * entries that are still missing them. Non-fatal.
 */
export async function backfillPassvaultFromClient(client) {
  if (!client?.id) return;
  try {
    let entries = [];
    try {
      const r = await api.get('/passwords', { params: { client_id: client.id } });
      entries = Array.isArray(r.data) ? r.data : r.data?.items || [];
    } catch {
      const r = await api.get('/passwords');
      const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
      entries = all.filter((e) => String(e.client_id) === String(client.id));
    }
    await Promise.all(
      entries.map(async (e) => {
        const patch = clientToPassvaultPatch(client, e);
        // strip linkage keys — they're already set
        delete patch.client_id;
        delete patch.client_name;
        if (Object.keys(patch).length === 0) return;
        try { await api.put(`/passwords/${e.id}`, patch); } catch { /* non-fatal */ }
      })
    );
  } catch { /* non-fatal */ }
}
