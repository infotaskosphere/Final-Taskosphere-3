import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Sparkles, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";

/**
 * Drop this next to any file upload. Pass the selected File object.
 * It auto-calls /api/ai/analyze-document and shows a collapsible panel.
 *
 * Props:
 *   file        — File object (or null). Analysis re-runs when this changes.
 *   autoAnalyze — boolean (default true). Set false to require a button click.
 *   label       — optional string shown in the panel header
 */
export default function AIFileInsights({ file, autoAnalyze = true, label }) {
  const [status,   setStatus]   = useState("idle"); // idle | loading | done | error
  const [result,   setResult]   = useState("");
  const [expanded, setExpanded] = useState(true);
  const prevFile = useRef(null);

  useEffect(() => {
    if (!file || file === prevFile.current) return;
    prevFile.current = file;
    setResult("");
    setExpanded(true);

    if (!autoAnalyze) { setStatus("idle"); return; }
    analyze(file);
  }, [file, autoAnalyze]);

  async function analyze(f) {
    if (!f) return;
    setStatus("loading");
    const form = new FormData();
    form.append("file", f);
    try {
      const { data } = await axios.post("/api/ai/analyze-document", form, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data.analysis || "No analysis returned.");
      setStatus("done");
    } catch (err) {
      setResult(err?.response?.data?.detail || "AI analysis failed.");
      setStatus("error");
    }
  }

  if (!file) return null;
  if (status === "idle") return (
    <button
      onClick={() => analyze(file)}
      className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
    >
      <Sparkles className="w-3.5 h-3.5" /> Analyse with AI
    </button>
  );

  return (
    <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 overflow-hidden text-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300">
          {status === "loading"
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Sparkles className="w-3.5 h-3.5" />}
          {status === "loading" ? "AI is analysing…" : label || "AI Insights"}
        </span>
        {status !== "loading" && (
          expanded
            ? <ChevronUp  className="w-3.5 h-3.5 text-blue-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
        )}
      </button>

      {/* Body */}
      {expanded && status !== "loading" && (
        <div className="px-3 pb-3 pt-0">
          <pre className={`whitespace-pre-wrap leading-relaxed text-xs font-sans ${
            status === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-slate-700 dark:text-slate-300"
          }`}>
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
