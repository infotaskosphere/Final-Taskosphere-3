/**
 * trademark-qc-api.js — v5
 *
 * API helpers for the QuickCompany Trademark integration inside Taskosphere.
 * Place in: frontend/src/lib/trademark-qc-api.js
 *
 * All calls go to /api/trademark-qc/... on the same backend that Taskosphere already uses.
 * We reuse the existing `api` axios instance from api.js so auth headers / interceptors
 * are automatically included.
 *
 * New in v5:
 *   - generateReport() now accepts class_filters (array) for multi-class scraping.
 *     The backend scraper will fetch class-specific QC pages in addition to generic
 *     pages, guaranteeing no class is missed even if it has few results.
 * v4:
 *   - bulkReportsBranded()  branding-aware bulk run
 *   - bulkExport()          combined bulk PDF / DOCX / XLSX download
 * v3:
 *   - getBrandingPreference / saveBrandingPreference
 */

import api from "@/lib/api";

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Generate a single trademark availability report.
 *
 * @param {string} name         Brand name to search
 * @param {object} opts
 *   @param {number|null}   opts.class_filter    Primary class to focus verdict on (legacy)
 *   @param {number[]|null} opts.class_filters   All classes to scrape (multi-class mode).
 *                                               When provided, backend also fetches class-
 *                                               specific QC pages for each class to ensure
 *                                               complete coverage.
 *   @param {boolean}       opts.device_only
 *   @param {string|null}   opts.logo_data_url
 *   ... other branding fields
 */
export async function generateReport(name, opts = {}) {
  const {
    class_filter = null,
    class_filters = null,   // NEW: array of class ints for multi-class scraping
    device_only = false,
    logo_data_url = null,
    footer = "",
    tagline = "",
    watermark = "",
    custom_watermark = "",
    client_name = "",
    client_mobile = "",
    report_date = "",
  } = opts;

  // Derive class_filters from class_filter if not explicitly provided
  const effectiveClassFilters =
    class_filters && class_filters.length > 0
      ? class_filters
      : class_filter != null
        ? [class_filter]
        : null;

  const { data } = await api.post("/trademark-qc/report", {
    name,
    class_filter,
    class_filters: effectiveClassFilters,  // sent to backend for class-specific scraping
    device_only,
    logo_data_url,
    footer,
    tagline,
    watermark,
    custom_watermark,
    client_name,
    client_mobile,
    report_date,
  }, { timeout: 90000 });  // Increased timeout for multi-class scraping
  return data;
}

export async function deleteReport(reportId) {
  const { data } = await api.delete(`/trademark-qc/searches/${reportId}`);
  return data;
}

/**
 * Basic bulk run — no branding embedded in stored reports.
 * Use bulkReportsBranded() when you need per-report PDFs to match bulk PDF branding.
 */
export async function bulkReports(names, opts = {}) {
  const { class_filter = null, device_only = false } = opts;
  const { data } = await api.post(
    "/trademark-qc/bulk",
    { names, class_filter, device_only },
    { timeout: 120000 }
  );
  return data;
}

/**
 * Branding-aware bulk run.
 * Backend persists each report with branding embedded so individual PDFs from
 * history look identical to the combined bulk PDF.
 *
 * Returns { items, count, analytics }
 */
export async function bulkReportsBranded(names, opts = {}) {
  const {
    class_filter      = null,
    device_only       = false,
    logo_data_url     = null,
    footer            = "",
    tagline           = "",
    watermark         = "",
    custom_watermark  = "",
    prepared_by       = "",
    disclaimer        = "",
    company_name      = "",
    client_name       = "",
    client_mobile     = "",
    report_date       = "",
    enable_monitoring = false,
  } = opts;
  const { data } = await api.post(
    "/trademark-qc/bulk",
    {
      names, class_filter, device_only,
      logo_data_url, footer, tagline, watermark, custom_watermark,
      prepared_by, disclaimer, company_name,
      client_name, client_mobile, report_date,
      enable_monitoring,
    },
    { timeout: 180000 }
  );
  return data; // { items, count, analytics }
}

/**
 * Download a combined bulk report (cover + per-mark dossiers) in the chosen format.
 * Supported formats: "pdf" | "docx" | "xlsx"
 * Triggers a browser download automatically.
 * Returns the downloaded filename.
 */
export async function bulkExport(names, opts = {}, format = "pdf") {
  const body = {
    names,
    class_filter:      opts.class_filter      ?? null,
    device_only:       !!opts.device_only,
    logo_data_url:     opts.logo_data_url     || null,
    footer:            opts.footer            || "",
    tagline:           opts.tagline           || "",
    watermark:         opts.watermark         || "",
    custom_watermark:  opts.custom_watermark  || "",
    prepared_by:       opts.prepared_by       || "",
    disclaimer:        opts.disclaimer        || "",
    company_name:      opts.company_name      || "",
    client_name:       opts.client_name       || "",
    client_mobile:     opts.client_mobile     || "",
    report_date:       opts.report_date       || "",
    enable_monitoring: !!opts.enable_monitoring,
  };
  const res = await api.post(
    `/trademark-qc/bulk/export?format=${encodeURIComponent(format)}`,
    body,
    { responseType: "blob", timeout: 300000 }
  );
  // Extract filename from Content-Disposition header, fall back to a sensible default
  const cd       = res.headers?.["content-disposition"] || "";
  const m        = /filename="?([^"]+)"?/.exec(cd);
  const today    = new Date().toISOString().slice(0, 10);
  const brandSlug = names.slice(0, 3).map(n => n.trim().replace(/[^a-zA-Z0-9]/g, "_")).join("-").toLowerCase();
  const filename = (m && m[1]) || `${brandSlug}_trademark_report_${today}.${format}`;
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a   = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return filename;
}

export async function findClasses(description, top = 5) {
  const { data } = await api.post("/trademark-qc/class-finder", { description, top });
  return data;
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function listHistory(limit = 25) {
  const { data } = await api.get("/trademark-qc/searches", { params: { limit } });
  // Backend returns { items: [...], count: N } — unwrap to array
  return Array.isArray(data) ? data : (data?.items ?? []);
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
 */
export function brandedPdfUrl(reportId, branding = {}) {
  const base   = api.defaults.baseURL || "";
  const params = new URLSearchParams();
  if (branding?.footer)  params.set("footer",    branding.footer);
  if (branding?.tagline) params.set("tagline",   branding.tagline);
  const wm = branding?.watermark === "CUSTOM"
    ? (branding.customWatermark || "")
    : (branding?.watermark || "");
  if (wm)                params.set("watermark", wm);
  if (branding?.logo)    params.set("has_logo",  "1");
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

// ─── Branding preference (per-user, cross-device sync) ────────────────────────

/**
 * Save the user's default reporting company + branding to the backend.
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
 * Falls back gracefully if the endpoint isn't wired yet.
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
