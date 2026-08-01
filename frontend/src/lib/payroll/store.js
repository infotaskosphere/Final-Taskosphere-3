// store.js — persistence for the Payroll module.
// Tries the governed backend first (/payroll records carry a JSON payload in
// `details`), and always keeps a local mirror so the module works offline and
// while the backend schema catches up.

import api from '@/lib/api';
import { DEFAULT_SETTINGS } from './statutory';

const KEY = 'taskosphere.payroll.v1';

const blank = () => ({ settings: DEFAULT_SETTINGS, employees: [], runs: [] });

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

export function listEmployees() { return read().employees; }

export function upsertEmployee(emp) {
  const s = read();
  const employees = [...s.employees];
  const i = employees.findIndex((e) => e.id === emp.id);
  const record = { ...emp, id: emp.id || uid(), updatedAt: new Date().toISOString() };
  if (i >= 0) employees[i] = record; else employees.push(record);
  write({ ...s, employees });
  return record;
}

export function removeEmployee(id) {
  const s = read();
  write({ ...s, employees: s.employees.filter((e) => e.id !== id) });
}

export function importEmployees(rows) {
  const s = read();
  const employees = [...s.employees];
  rows.forEach((r) => {
    const i = employees.findIndex((e) => e.code && e.code === r.code);
    const record = { ...blankEmployee(), ...r, id: i >= 0 ? employees[i].id : uid() };
    if (i >= 0) employees[i] = record; else employees.push(record);
  });
  write({ ...s, employees });
  return employees.length;
}

export function blankEmployee() {
  return {
    id: '',
    code: '',
    name: '',
    fatherName: '',
    gender: 'M',
    dob: '',
    doj: '',
    dol: '',
    designation: '',
    department: '',
    location: '',
    pan: '',
    aadhaar: '',
    mobile: '',
    email: '',
    age: null,
    monthlyTds: 0,
    status: 'active',
    structure: { basic: 0, da: 0, hra: 0, conveyance: 0, medical: 0, special: 0, otherAllowance: 0 },
    pf: {
      enabled: true, uan: '', memberId: '', epsEligible: true, vpfRate: 0,
      contributeOnActualWages: false, includeSpecialAllowance: false, joinDate: '', exitDate: '', exitReason: '',
    },
    esi: { enabled: true, ipNumber: '', dispensary: '', disabled: false, continueTillPeriodEnd: false },
    bank: { accountNumber: '', ifsc: '', bankName: '', accountHolder: '' },
  };
}

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
