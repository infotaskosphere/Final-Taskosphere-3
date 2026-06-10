/**
 * Append these helpers to `frontend/src/lib/trademark-qc-api.js`.
 * They power the new bulk export flow (PDF / DOCX / XLSX) and
 * the branding-aware bulk run.
 */

import api from "@/lib/api";

/**
 * Branding-aware bulk run. Backend will persist each report with branding
 * embedded, so individual PDFs from history will look identical to the
 * combined bulk PDF.
 */
export async function bulkReportsBranded(names, opts = {}) {
  const {
    class_filter = null,
    device_only = false,
    logo_data_url = null,
    footer = "",
    tagline = "",
    watermark = "",
    custom_watermark = "",
    prepared_by = "",
    disclaimer = "",
    company_name = "",
    client_name = "",
    client_mobile = "",
    report_date = "",
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
 * Download a combined bulk report (cover + per-mark dossiers) in the chosen
 * format. Triggers a browser download.
 */
export async function bulkExport(names, opts = {}, format = "pdf") {
  const body = {
    names,
    class_filter:      opts.class_filter ?? null,
    device_only:       !!opts.device_only,
    logo_data_url:     opts.logo_data_url || null,
    footer:            opts.footer || "",
    tagline:           opts.tagline || "",
    watermark:         opts.watermark || "",
    custom_watermark:  opts.custom_watermark || "",
    prepared_by:       opts.prepared_by || "",
    disclaimer:        opts.disclaimer || "",
    company_name:      opts.company_name || "",
    client_name:       opts.client_name || "",
    client_mobile:     opts.client_mobile || "",
    report_date:       opts.report_date || "",
    enable_monitoring: !!opts.enable_monitoring,
  };
  const res = await api.post(
    `/trademark-qc/bulk/export?format=${encodeURIComponent(format)}`,
    body,
    { responseType: "blob", timeout: 300000 }
  );

  const cd = res.headers?.["content-disposition"] || "";
  const m  = /filename="?([^"]+)"?/.exec(cd);
  const today = new Date().toISOString().slice(0, 10);
  const filename = (m && m[1]) || `bulk_trademark_report_${today}.${format}`;

  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
  return filename;
}
