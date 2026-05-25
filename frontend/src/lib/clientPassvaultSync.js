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

/**
 * Map a Client record → partial PassVault fields.
 * Used to fill blanks on a PassVault entry.
 */
export function clientToPassvaultPatch(client, entry = {}) {
  if (!client) return {};
  const patch = {};

  // mobile  ←  client.phone / first contact phone
  if (isEmpty(entry.mobile)) {
    const p = pick(client.phone, client.contact_persons?.[0]?.phone);
    if (!isEmpty(p)) patch.mobile = p;
  }

  // username ← email (only if current username is empty)
  if (isEmpty(entry.username)) {
    const e = pick(client.email, client.contact_persons?.[0]?.email);
    if (!isEmpty(e)) patch.username = e;
  }

  // holder_name ← company_name OR primary contact name
  if (isEmpty(entry.holder_name)) {
    const h =
      entry.holder_type === 'INDIVIDUAL'
        ? pick(client.contact_persons?.[0]?.name, client.company_name)
        : pick(client.company_name, client.contact_persons?.[0]?.name);
    if (!isEmpty(h)) patch.holder_name = h;
  }

  // holder_pan  ← client.pan
  if (isEmpty(entry.holder_pan) && !isEmpty(client.pan)) {
    patch.holder_pan = String(client.pan).toUpperCase();
  }

  // holder_din  ← first contact DIN
  if (isEmpty(entry.holder_din)) {
    const d = pick(...(client.contact_persons || []).map((c) => c?.din));
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

  // Backfill contact_persons[0] DIN / name / phone / email if entirely missing
  const cps = Array.isArray(client.contact_persons) ? [...client.contact_persons] : [];
  const cp0 = { ...(cps[0] || { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }) };

  if (isEmpty(cp0.din)) {
    const d = entries.map((e) => e?.holder_din).find((v) => !isEmpty(v));
    if (!isEmpty(d)) cp0.din = d;
  }
  if (isEmpty(cp0.name)) {
    const n = entries
      .filter((e) => e?.holder_type === 'INDIVIDUAL')
      .map((e) => e?.holder_name)
      .find((v) => !isEmpty(v));
    if (!isEmpty(n)) cp0.name = n;
  }
  if (isEmpty(cp0.phone) && !isEmpty(patch.phone)) cp0.phone = patch.phone;
  if (isEmpty(cp0.email) && !isEmpty(patch.email)) cp0.email = patch.email;

  // Only emit contact_persons in the patch if we actually changed something
  const original = cps[0] || {};
  const changed = ['din', 'name', 'phone', 'email'].some((k) => cp0[k] !== original[k]);
  if (changed) {
    cps[0] = cp0;
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
