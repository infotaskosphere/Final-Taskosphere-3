/**
 * trademark-qc-api.js — v3
 *
 * API helpers for the QuickCompany Trademark integration inside Taskosphere.
 * Place in: frontend/src/lib/trademark-qc-api.js
 *
 * All calls go to /api/trademark-qc/... on the same backend that Taskosphere already uses.
 * We reuse the existing `api` axios instance from api.js so auth headers / interceptors
 * are automatically included.
 *
 * New in v3:
 *   - getBrandingPreference / saveBrandingPreference  (default company persistence)
 *   - pdfDownloadUrl now supports branding query params via brandedPdfUrl()
 */

import api from "@/lib/api";

// ─── Report generation ────────────────────────────────────────────────────────

export async function generateReport(name, opts = {}) {
  const { class_filter = null, device_only = false, logo_data_url = null } = opts;
  const { data } = await api.post("/trademark-qc/report", {
    name,
    class_filter,
    device_only,
    logo_data_url,
  }, { timeout: 60000 });
  return data;
}

export async function bulkReports(names, opts = {}) {
  const { class_filter = null, device_only = false } = opts;
  const { data } = await api.post(
    "/trademark-qc/bulk",
    { names, class_filter, device_only },
    { timeout: 120000 }
  );
  return data;
}

export async function findClasses(description, top = 5) {
  const { data } = await api.post("/trademark-qc/class-finder", { description, top });
  return data;
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function listHistory(limit = 25) {
  const { data } = await api.get("/trademark-qc/searches", { params: { limit } });
  return data;
}

export async function getReport(id) {
  const { data } = await api.get(`/trademark-qc/searches/${id}`);
  return data;
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function pdfDownloadUrl(reportId) {
  const base = api.defaults.baseURL || "";
  return `${base}/trademark-qc/searches/${reportId}/pdf`;
}

/**
 * Build a PDF URL that instructs the backend to overlay the given branding
 * onto the stored report — without re-running the trademark scrape.
 *
 * @param {string} reportId
 * @param {{ footer?: string, tagline?: string, watermark?: string, customWatermark?: string, logo?: string }} branding
 * @returns {string}
 */
export function brandedPdfUrl(reportId, branding = {}) {
  const base = api.defaults.baseURL || "";
  const params = new URLSearchParams();
  if (branding?.footer)   params.set("footer",    branding.footer);
  if (branding?.tagline)  params.set("tagline",   branding.tagline);
  const wm = branding?.watermark === "CUSTOM"
    ? (branding.customWatermark || "")
    : (branding?.watermark || "");
  if (wm)                 params.set("watermark", wm);
  if (branding?.logo)     params.set("has_logo",  "1");
  const qs = params.toString();
  return `${base}/trademark-qc/searches/${reportId}/pdf${qs ? `?${qs}` : ""}`;
}

export function shareLinkFor(reportId) {
  return `${window.location.origin}/trademark-sphere?report=${reportId}`;
}

export async function quickCheck(name, classFilter = null) {
  const params = { name };
  if (classFilter) params.class = classFilter;
  const { data } = await api.get("/trademark-qc/check", { params });
  return data;
}

// ─── Branding preference (cross-device default company) ──────────────────────

/**
 * Save the user's default reporting company to the backend.
 * Called when user clicks "Set Default" in BrandingPanel.
 */
export async function saveBrandingPreference(pref = {}) {
  const { data } = await api.post("/trademark-qc/branding-preference", {
    default_company_id:   pref.defaultCompanyId   || null,
    default_company_name: pref.defaultCompanyName || null,
    footer:               pref.footer    || "",
    tagline:              pref.tagline   || "",
    watermark:            pref.watermark || "",
  });
  return data;
}

/**
 * Fetch saved branding preference from backend.
 * Used on first load to restore the user's default company cross-device.
 * Falls back gracefully if the endpoint isn't available.
 */
export async function getBrandingPreference() {
  try {
    const { data } = await api.get("/trademark-qc/branding-preference");
    return {
      defaultCompanyId:   data.default_company_id   || null,
      defaultCompanyName: data.default_company_name || null,
      footer:    data.footer    || "",
      tagline:   data.tagline   || "",
      watermark: data.watermark || "",
    };
  } catch {
    return null; // graceful fallback — frontend uses localStorage
  }
}
