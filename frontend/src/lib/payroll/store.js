// store.js — persistence for the Payroll module.
//
// Employees are NOT a separate payroll-only list anymore — the roster is the
// firm's real Users collection (GET /users, the same list People Matrix →
// Users manages). Payroll only keeps a small local "overlay" per user for
// the fields Users has no concept of: PAN/Aadhaar, PF (UAN/EPS/VPF), ESI,
// bank details, salary structure breakdown and monthly TDS. Name, DOB, date
// of joining, department and active/inactive status are always read live
// from Users — edit those there, not here — so the two never drift apart.
//
// Payroll runs still try the governed backend first (/payroll records carry
// a JSON payload in `details`), and always keep a local mirror so the module
// works offline and while the backend schema catches up.

import api from '@/lib/api';
import { DEFAULT_SETTINGS } from './statutory';

const KEY = 'taskosphere.payroll.v1';

// `employees` was the old (pre-Users-integration) local-only employee list.
// It is kept around untouched on read/write purely so nobody loses data —
// export a backup before switching over if you had employees entered here.
const blank = () => ({ settings: DEFAULT_SETTINGS, overlays: {}, runs: [], employees: [] });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    return {
      ...blank(),
      ...parsed,
      settings: deepMerge(DEFAULT_SETTINGS, parsed.settings || {}),
    };
  } catch {
    return blank();
  }
}

function write(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}

export function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(override || {}).forEach(([k, v]) => {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base?.[k] || {}, v) : v;
  });
  return out;
}

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const getState = read;
export const setState = write;

export function getSettings() { return read().settings; }
export function saveSettings(settings) {
  const s = read();
  return write({ ...s, settings: deepMerge(DEFAULT_SETTINGS, settings) }).settings;
}

// ── Users bridge ────────────────────────────────────────────────────────

/** The firm's full user roster, straight from the same endpoint People
 * Matrix → Users uses. Never throws — an unreachable backend just yields an
 * empty roster rather than crashing the Payroll page. */
export async function fetchUsers() {
  try {
    const { data } = await api.get('/users');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function overlayDefaults() {
  return {
    code: '',
    fatherName: '',
    gender: 'M',
    dol: '', // date of leaving — for the EPFO ECR leaver report; Users has no such field
    pan: '',
    aadhaar: '',
    monthlyTds: 0,
    structure: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, special: 0, otherAllowance: 0 },
    pf: {
      enabled: true, uan: '', memberId: '', epsEligible: true, vpfRate: 0,
      contributeOnActualWages: false, includeSpecialAllowance: false, exitReason: '',
    },
    esi: { enabled: true, ipNumber: '', dispensary: '', disabled: false, continueTillPeriodEnd: false },
    bank: { accountNumber: '', ifsc: '', bankName: '', accountHolder: '' },
    configured: false, // true once someone has actually filled in payroll details for this user
  };
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

/** Merge one backend User with their local payroll overlay into the shape
 * statutory.js / PayrollRun / exports.js already expect. Personal &
 * employment fields (name, dob, doj, department, status) come straight from
 * the user record and are treated as read-only here. */
function mergeUserWithOverlay(user, overlay) {
  const ov = deepMerge(overlayDefaults(), overlay || {});
  const uid_ = user.id || user._id;
  return {
    id: uid_,
    userId: uid_,
    code: ov.code,
    name: user.full_name || user.email || 'Unnamed user',
    email: user.email || '',
    mobile: user.phone || '',
    fatherName: ov.fatherName,
    gender: ov.gender,
    dob: user.birthday || '',
    doj: user.joining_date || '',
    dol: ov.dol,
    designation: (user.departments || [])[0] || '',
    department: (user.departments || [])[0] || '',
    pan: ov.pan,
    aadhaar: ov.aadhaar,
    age: ageFromDob(user.birthday),
    monthlyTds: ov.monthlyTds,
    status: user.is_active === false ? 'inactive' : 'active',
    structure: ov.structure,
    pf: ov.pf,
    esi: ov.esi,
    bank: { ...ov.bank, accountHolder: ov.bank.accountHolder || user.full_name || '' },
    configured: ov.configured,
    monthlySalaryOnFile: user.monthly_salary ?? null, // shown as a hint when structure isn't filled in yet
  };
}

/** Full employee roster for Payroll = every active-or-not User, merged with
 * whatever payroll overlay exists for them (blank defaults if none yet). */
export async function listEmployees() {
  const s = read();
  const users = await fetchUsers();
  return users.map((u) => mergeUserWithOverlay(u, s.overlays[u.id || u._id]));
}

/** Users who don't have payroll details filled in yet — this is what
 * "Add employee" now picks from, instead of creating a free-floating record
 * disconnected from Users. */
export async function listUnconfiguredUsers() {
  const s = read();
  const users = await fetchUsers();
  return users.filter((u) => !s.overlays[u.id || u._id]?.configured);
}

export function blankEmployee() {
  return { id: '', ...overlayDefaults() };
}

/** Saves only the payroll-specific overlay fields for an existing user —
 * name/dob/doj/department/status are never written here, they belong to
 * Users. `emp.id` must be a real Users id (see listUnconfiguredUsers). */
export function upsertEmployee(emp) {
  const s = read();
  if (!emp?.id) throw new Error('upsertEmployee requires an existing Users id');
  const overlay = {
    code: emp.code || '',
    fatherName: emp.fatherName || '',
    gender: emp.gender || 'M',
    dol: emp.dol || '',
    pan: emp.pan || '',
    aadhaar: emp.aadhaar || '',
    monthlyTds: Number(emp.monthlyTds) || 0,
    structure: emp.structure,
    pf: emp.pf,
    esi: emp.esi,
    bank: emp.bank,
    configured: true,
  };
  write({ ...s, overlays: { ...s.overlays, [emp.id]: overlay } });
  return overlay;
}

/** Clears the payroll overlay for a user (their Users account is untouched
 * — this only removes their salary structure / PF / ESI / bank setup from
 * Payroll, e.g. to redo onboarding). */
export function removeEmployee(id) {
  const s = read();
  const overlays = { ...s.overlays };
  delete overlays[id];
  write({ ...s, overlays });
}

/** Bulk import matches each sheet row to an existing user by email (primary
 * — Users always has one) then falls back to an exact full-name match, and
 * only ever writes the payroll overlay for that user. Rows that don't match
 * any existing user are skipped (create the person in Users first) — the
 * counts are returned so the UI can report what happened. */
export async function importEmployees(rows) {
  const s = read();
  const users = await fetchUsers();
  const overlays = { ...s.overlays };
  let matched = 0;
  let skipped = 0;

  rows.forEach((r) => {
    const user =
      (r.email && users.find((u) => (u.email || '').toLowerCase() === String(r.email).trim().toLowerCase())) ||
      (r.name && users.find((u) => (u.full_name || '').trim().toLowerCase() === String(r.name).trim().toLowerCase()));
    if (!user) { skipped += 1; return; }
    const uid_ = user.id || user._id;
    const existing = overlays[uid_] || {};
    overlays[uid_] = {
      ...existing,
      code: r.code || existing.code || '',
      fatherName: r.fatherName || existing.fatherName || '',
      gender: r.gender || existing.gender || 'M',
      pan: r.pan || existing.pan || '',
      aadhaar: r.aadhaar || existing.aadhaar || '',
      monthlyTds: r.monthlyTds ?? existing.monthlyTds ?? 0,
      structure: { ...existing.structure, ...r.structure },
      pf: { ...existing.pf, ...r.pf },
      esi: { ...existing.esi, ...r.esi },
      bank: { ...existing.bank, ...r.bank },
      configured: true,
    };
    matched += 1;
  });

  write({ ...s, overlays });
  return { matched, skipped, total: rows.length };
}

// ── Payroll runs ─────────────────────────────────────────────────────────

export function listRuns() {
  return read().runs.slice().sort((a, b) => `${b.year}${String(b.month).padStart(2, '0')}`.localeCompare(`${a.year}${String(a.month).padStart(2, '0')}`));
}

export function getRun(month, year) {
  return read().runs.find((r) => r.month === month && r.year === year) || null;
}

export function saveRun(run) {
  const s = read();
  const runs = [...s.runs];
  const i = runs.findIndex((r) => r.month === run.month && r.year === run.year);
  const record = { ...run, id: run.id || uid(), updatedAt: new Date().toISOString() };
  if (i >= 0) runs[i] = record; else runs.push(record);
  write({ ...s, runs });
  syncRunToBackend(record);
  return record;
}

export function deleteRun(id) {
  const s = read();
  write({ ...s, runs: s.runs.filter((r) => r.id !== id) });
}

/** Best-effort mirror of a finalised run into the governed /payroll list. */
async function syncRunToBackend(run) {
  if (run.status !== 'finalised') return;
  try {
    await api.post('/payroll', {
      title: `Payroll ${run.month}/${run.year} — ${run.lines.length} employees`,
      details: JSON.stringify({
        month: run.month, year: run.year, summary: run.summary, status: run.status,
      }).slice(0, 4000),
    });
  } catch {
    /* offline / no permission — the local mirror is the source of truth */
  }
}

export function exportBackup() { return JSON.stringify(read(), null, 2); }

export function importBackup(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  return write({ ...blank(), ...parsed, settings: deepMerge(DEFAULT_SETTINGS, parsed.settings || {}) });
}
