import React, { useState } from "react";
import { bulkReports, pdfDownloadUrl, shareLinkFor } from "@/lib/trademark-qc-api";
import StatusBadge from "./StatusBadge";
import { Stack, FilePdf, Link as LinkIcon, ArrowRight, X, CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";

const placeholder = "One brand name per line, e.g.\nKunjveda\nFumera\nZorbixsynth";

export const BulkSearchPanel = ({ onPickReport }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [klass, setKlass] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const namesFromText = () =>
    text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  const run = async () => {
    const names = namesFromText();
    if (names.length === 0) return toast.error("Enter at least one name (one per line)");
    if (names.length > 20) return toast.error("Max 20 names per batch");
    setLoading(true);
    setItems([]);
    try {
      const data = await bulkReports(names, { class_filter: klass ? Number(klass) : null });
      setItems(data.items || []);
      toast.success(`Bulk report ready — ${data.count} names processed`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk search failed");
    } finally { setLoading(false); }
  };

  const copyShare = async (id) => {
    try {
      await navigator.clipboard.writeText(shareLinkFor(id));
      toast.success("Share link copied");
    } catch { toast.error("Could not copy link"); }
  };

  return (
    <section data-testid="bulk-search-panel" className="ts-card overflow-hidden">
      <button
        data-testid="bulk-search-toggle"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-3">
          <div className="ts-icon-bubble bg-emerald-50">
            <Stack size={18} weight="bold" className="text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Bulk search</p>
            <p className="text-xs text-slate-500">Check up to 20 names at once</p>
          </div>
        </span>
        <CaretDown size={16} weight="bold" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 lg:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
            <textarea
              data-testid="bulk-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              rows={5}
              className="ts-input resize-none"
            />
            <div className="space-y-3">
              <select
                data-testid="bulk-class-select"
                value={klass}
                onChange={(e) => setKlass(e.target.value)}
                className="ts-input"
              >
                <option value="">All classes</option>
                {Array.from({ length: 45 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
              <button
                data-testid="bulk-run"
                onClick={run}
                disabled={loading}
                className="ts-btn-primary w-full justify-center"
              >
                {loading ? "Processing…" : "Run batch"}
                <ArrowRight size={14} weight="bold" />
              </button>
              <p className="text-[11px] text-slate-500">Each name produces an independent stored report.</p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden" data-testid="bulk-results">
              <div className="grid grid-cols-[1fr_120px_70px_1fr_auto] bg-slate-50/70 border-b border-slate-200">
                <Th>Name</Th><Th>Status</Th><Th align="right">Risk</Th><Th>Headline</Th><Th align="right">Actions</Th>
              </div>
              {items.map((it, idx) => (
                <div key={`${it.name}-${idx}`} data-testid={`bulk-row-${idx}`}
                  className="grid grid-cols-[1fr_120px_70px_1fr_auto] border-b border-slate-100 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                  <Td><span className="font-medium text-slate-900">{it.name}</span></Td>
                  <Td>{it.error ? (
                      <span className="text-xs text-red-600 inline-flex items-center gap-1 font-medium">
                        <X size={10} weight="bold" /> Failed
                      </span>
                    ) : <StatusBadge status={it.overall_status} />}</Td>
                  <Td align="right" className="font-semibold tabular-nums text-slate-800">{it.error ? "—" : it.risk_score}</Td>
                  <Td className="text-xs text-slate-600 truncate">{it.error ? it.error : it.headline}</Td>
                  <Td align="right">
                    {!it.error && it.id && (
                      <div className="flex items-center gap-1.5 justify-end">
                        <button data-testid={`bulk-open-${idx}`} onClick={() => onPickReport && onPickReport(it.id)}
                          className="px-2.5 py-1 rounded-lg text-xs text-blue-700 hover:bg-blue-50 font-medium">View</button>
                        <a data-testid={`bulk-pdf-${idx}`} href={pdfDownloadUrl(it.id)} target="_blank" rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg text-xs text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1">
                          <FilePdf size={11} weight="bold" /> PDF
                        </a>
                        <button data-testid={`bulk-share-${idx}`} onClick={() => copyShare(it.id)}
                          className="px-2.5 py-1 rounded-lg text-xs text-slate-700 hover:bg-slate-100 font-medium inline-flex items-center gap-1">
                          <LinkIcon size={11} weight="bold" /> Link
                        </button>
                      </div>
                    )}
                  </Td>
                </div>
              ))}
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
const Td = ({ children, align = "left", className = "" }) => (
  <div className={`px-4 py-3 text-${align} flex items-center ${className} ${align === "right" ? "justify-end" : ""}`}>{children}</div>
);

export default BulkSearchPanel;
