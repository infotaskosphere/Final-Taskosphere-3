// companies.js — single shared helper for reading company MASTER DATA.
//
// Companies are created / edited in ONE place: Admin → Master Data
// (CompanyProfiles → /companies API in backend/quotations.py). Every other
// page (Quotations, Invoicing, Trademark Sphere, Bank Accounts, Reports,
// Attendance, Users, Journal Entries, Email/WhatsApp settings, GST sync…)
// only READS them.
//
// Use these helpers instead of calling api.get('/companies') directly so that:
//   * the response shape is always normalised to an ARRAY (some endpoints /
//     proxies wrap it as { companies: [...] } or { data: [...] } — mapping over
//     that object is what produced "companies.map is not a function"),
//   * a permission / network failure degrades to an empty list instead of
//     throwing and blanking the whole page,
//   * every page picks the right endpoint:
//       fetchCompanies()     → full records (address, GST, bank, logo, SMTP)
//       fetchCompanyList()   → same records for dropdowns / document headers
//
import api from "@/lib/api";

/** Always return an array of companies, whatever wrapper the API used. */
export function normalizeCompanies(payload) {
  const d = payload?.data !== undefined ? payload.data : payload;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.companies)) return d.companies;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}

/** Full company master records (needs a logged-in user only). */
export async function fetchCompanies({ silent = true } = {}) {
  try {
    const res = await api.get("/companies");
    return normalizeCompanies(res);
  } catch (err) {
    if (!silent) throw err;
    // eslint-disable-next-line no-console
    console.warn("[companies] failed to load /companies:", err?.response?.status || err?.message);
    return [];
  }
}

/** Company list for dropdowns & document headers. */
export async function fetchCompanyList({ silent = true } = {}) {
  try {
    const res = await api.get("/companies/list");
    return normalizeCompanies(res);
  } catch (err) {
    if (!silent) throw err;
    // eslint-disable-next-line no-console
    console.warn("[companies] failed to load /companies/list:", err?.response?.status || err?.message);
    return [];
  }
}

/** One company by id, resolved from the master list (no extra call needed). */
export function findCompany(companies, id) {
  if (!id) return null;
  return (Array.isArray(companies) ? companies : []).find((c) => c?.id === id) || null;
}

export default { fetchCompanies, fetchCompanyList, normalizeCompanies, findCompany };
