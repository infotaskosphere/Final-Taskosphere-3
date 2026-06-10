import React, { useState } from "react";
import { pdfDownloadUrl, shareLinkFor } from "@/lib/trademark-qc-api";
import { bulkReportsBranded, bulkExport } from "@/lib/trademark-qc-api.bulk";
import StatusBadge from "./StatusBadge";
import { Stack, FilePdf, Link as LinkIcon, ArrowRight, X, CaretDown,
         FileDoc, FileXls, Download } from "@phosphor-icons/react";
import { toast } from "sonner";

const placeholder = "One brand name per line, e.g.\nKunjveda\nFumera\nZorbixsynth";

/**
 * `branding` shape (passed from TrademarkSphere parent):
 *   { logo_data_url, footer, tagline, watermark, custom_watermark,
 *     prepared_by, disclaimer, company_name,
 *     client_name, client_mobile, report_date }
 */
export const BulkSearchPanel = ({ onPickReport, branding = {} }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [klass, setKlass] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [format, setFormat] = useState("pdf");
  const [enableMonitoring, setEnableMonitoring] = useState(false);

  const namesFromText = () =>
    text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  const validateBranding = () => {
    const probs = [];
    if (!branding.tagline) probs.push("Header tagline missing");
    if (!branding.footer)  probs.push("Footer text missing");
    if (!branding.logo_data_url) probs.push("Company logo missing (recommended)");
    return probs;
  };

  const run = async () => {
    const names = namesFromText();
    if (names.length === 0) return toast.error("Enter at least one name (one per line)");
    if (names.length > 50)  return toast.error("Max 50 names per batch");
    setLoading(true); setItems([]); setAnalytics(null);
    try {
      const data = await bulkReportsBranded(names, {
        class_filter: klass ? Number(klass) : null,
        ...branding,
        enable_monitoring: enableMonitoring,
      });
      setItems(data.items || []);
      setAnalytics(data.analytics || null);
      toast.success(`Bulk report ready — ${data.count} names processed`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk search failed");
    } finally { setLoading(false); }
  };

  const doExport = async (fmt = format) => {
    const names = namesFromText();
    if (names.length === 0) return toast.error("Enter at least one name");
    const probs = validateBranding();
    if (probs.find((p) => !p.includes("recommended"))) {
      return toast.error("Branding incomplete: " + probs.join("; "));
    }
    setExporting(true);
    try {
      const fname = await bulkExport(
        names,
        { class_filter: klass ? Number(klass) : null, ...branding, enable_monitoring: enableMonitoring },
        fmt,
      );
      toast.success(`Downloaded ${fname}`);
    } catch (e) {
      const msg = e?.response?.data?.detail
        || (e?.response?.data instanceof Blob ? await e.response.data.text() : null)
        || "Export failed";
      toast.error(typeof msg === "string" ? msg : "Export failed");
    } finally { setExporting(false); }
  };

  const copyShare = async (id) => {
    try { await navigator.clipboard.writeText(shareLinkFor(id)); toast.success("Share link copied"); }
    catch { toast.error("Could not copy link"); }
  };

  return (
    <section data-testid="bulk-search-panel" className="ts-card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
        <span className="flex items-center gap-3">
          <div className="ts-icon-bubble bg-emerald-50">
            <Stack size={18} weight="bold" className="text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Bulk search</p>
            <p className="text-xs text-slate-500">Up to 50 names · combined dossier with portfolio analytics</p>
          </div>
        </span>
        <CaretDown size={16} weight="bold" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 lg:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder={placeholder} rows={6} className="ts-input resize-none" />
            <div className="space-y-2">
              <select value={klass} onChange={(e) => setKlass(e.target.value)} className="ts-input">
                <option value="">All classes</option>
                {Array.from({ length: 45 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="ts-input">
                <option value="pdf">Export · PDF</option>
                <option value="docx">Export · DOCX</option>
                <option value="xlsx">Export · Excel</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={enableMonitoring}
                  onChange={(e) => setEnableMonitoring(e.target.checked)} />
                Suggest trademark monitoring
              </label>
              <button onClick={run} disabled={loading}
                className="ts-btn-primary w-full justify-center">
                {loading ? "Processing…" : "Run batch"} <ArrowRight size={14} weight="bold" />
              </button>
              <button onClick={() => doExport(format)} disabled={exporting}
                className="ts-btn-secondary w-full justify-center inline-flex items-center gap-1.5">
                {format === "pdf"  && <FilePdf size={14} weight="bold" />}
                {format === "docx" && <FileDoc size={14} weight="bold" />}
                {format === "xlsx" && <FileXls size={14} weight="bold" />}
                {exporting ? "Generating…" : "Download combined report"}
              </button>
            </div>
          </div>

          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-center">
              {[
                ["Total",       analytics.total_marks,                  "text-slate-900"],
                ["Available",   analytics.available,                    "text-emerald-700"],
                ["Caution",     analytics.caution,                      "text-amber-700"],
                ["Conflict",    analytics.conflict,                     "text-red-700"],
                ["Avg Risk",    `${analytics.average_risk}/100`,        "text-blue-700"],
                ["High Risk",   analytics.high_risk_marks,              "text-orange-700"],
                ["Avg Success", `${analytics.average_success_probability}%`, "text-indigo-700"],
              ].map(([k, v, color]) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{k}</p>
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{v}</p>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_110px_70px_90px_110px_1fr_auto] bg-slate-50/70 border-b border-slate-200">
                <Th>Name</Th><Th>Status</Th><Th align="right">Risk</Th><Th align="right">Success</Th>
                <Th>Badge</Th><Th>Headline</Th><Th align="right">Actions</Th>
              </div>
              {items.map((it, idx) => {
                const an = it?.report?.analytics || {};
                return (
                  <div key={`${it.name}-${idx}`}
                    className="grid grid-cols-[1fr_110px_70px_90px_110px_1fr_auto] border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40">
                    <Td><span className="font-medium text-slate-900">{it.name}</span></Td>
                    <Td>{it.error
                      ? <span className="text-xs text-red-600 inline-flex items-center gap-1 font-medium"><X size={10} weight="bold" /> Failed</span>
                      : <StatusBadge status={it.overall_status} />}</Td>
                    <Td align="right" className="font-semibold tabular-nums text-slate-800">
                      {it.error ? "—" : it.risk_score}
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums text-indigo-700">
                      {it.error ? "—" : `${an.success_probability_pct ?? 0}%`}
                    </Td>
                    <Td className="text-[11px] font-bold uppercase"
                      style={{ color: an.recommendation_color || "#475569" }}>
                      {it.error ? "—" : (an.recommendation_badge || "—")}
                    </Td>
                    <Td className="text-xs text-slate-600 truncate">
                      {it.error ? it.error : it.headline}
                    </Td>
                    <Td align="right">
                      {!it.error && it.id && (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => onPickReport && onPickReport(it.id)}
                            className="px-2.5 py-1 rounded-lg text-xs text-blue-700 hover:bg-blue-50 font-medium">View</button>
                          <a href={pdfDownloadUrl(it.id)} target="_blank" rel="noreferrer"
                            className="px-2.5 py-1 rounded-lg text-xs text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1">
                            <FilePdf size={11} weight="bold" /> PDF
                          </a>
                          <button onClick={() => copyShare(it.id)}
                            className="px-2.5 py-1 rounded-lg text-xs text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1">
                            <LinkIcon size={11} weight="bold" /> Link
                          </button>
                        </div>
                      )}
                    </Td>
                  </div>
                );
              })}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => doExport("pdf")}  disabled={exporting}
                className="ts-btn-secondary inline-flex items-center gap-1.5"><FilePdf size={14} weight="bold" /> Combined PDF</button>
              <button onClick={() => doExport("docx")} disabled={exporting}
                className="ts-btn-secondary inline-flex items-center gap-1.5"><FileDoc size={14} weight="bold" /> DOCX</button>
              <button onClick={() => doExport("xlsx")} disabled={exporting}
                className="ts-btn-secondary inline-flex items-center gap-1.5"><FileXls size={14} weight="bold" /> Excel</button>
              <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                <Download size={11} /> identical layout to individual reports
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const Th = ({ children, align = "left" }) => (
  <div className={`px-4 py-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-${align}`}>{children}</div>
);
const Td = ({ children, align = "left", className = "", style }) => (
  <div style={style}
    className={`px-4 py-3 text-${align} flex items-center ${className} ${align === "right" ? "justify-end" : ""}`}>{children}</div>
);

export default BulkSearchPanel;
