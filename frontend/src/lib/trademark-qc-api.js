/**
 * trademark-qc-api.js
 *
 * API helpers for the QuickCompany Trademark integration inside Taskosphere.
 * Place in: frontend/src/lib/trademark-qc-api.js
 *
 * All calls go to /api/trademark-qc/... on the same backend that Taskosphere already uses.
 * We reuse the existing `api` axios instance from api.js so auth headers / interceptors
 * are automatically included.
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
  // Build the full URL using the same base that api.js resolves to
  const base = api.defaults.baseURL || "";
  return `${base}/trademark-qc/searches/${reportId}/pdf`;
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
