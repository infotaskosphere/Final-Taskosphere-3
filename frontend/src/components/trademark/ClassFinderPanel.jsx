import React, { useState } from "react";
import { findClasses } from "@/lib/trademark-qc-api";
import { Compass, ArrowRight, Lightbulb, CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";

const CONF_COLORS = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

export const ClassFinderPanel = ({ onPickClass }) => {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const run = async () => {
    if (description.trim().length < 5) return toast.error("Describe your goods/services in a few words");
    setLoading(true);
    setSuggestions([]);
    try {
      const data = await findClasses(description.trim(), 6);
      setSuggestions(data.suggestions || []);
      if ((data.suggestions || []).length === 0) toast("No class matched — try more specific terms");
    } catch { toast.error("Class finder failed"); }
    finally { setLoading(false); }
  };

  return (
    <section data-testid="class-finder-panel" className="ts-card overflow-hidden">
      <button
        data-testid="class-finder-toggle"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-3">
          <div className="ts-icon-bubble bg-violet-50">
            <Compass size={18} weight="bold" className="text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900">Class Finder</p>
            <p className="text-xs text-slate-500">Find your trademark class from a description</p>
          </div>
        </span>
        <CaretDown size={16} weight="bold" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 lg:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
            <textarea
              data-testid="cf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you sell — e.g. 'AI-powered SaaS platform for online coaching' or 'organic ayurvedic skincare'"
              rows={4}
              className="ts-input resize-none"
            />
            <button
              data-testid="cf-run"
              onClick={run}
              disabled={loading}
              className="ts-btn-primary justify-center self-start h-12"
            >
              {loading ? "Analysing…" : "Find classes"}
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div data-testid="cf-results" className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {suggestions.map((s, i) => (
                <button
                  key={s.class}
                  data-testid={`cf-pick-${s.class}`}
                  onClick={() => onPickClass && onPickClass(s.class)}
                  className="ts-card ts-card-hover text-left p-5 transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                      Rank {String(i + 1).padStart(2, "0")} · Score {s.score}
                    </span>
                    <span className={`text-[10px] uppercase tracking-widest font-semibold border rounded-full px-2 py-0.5 ${CONF_COLORS[s.confidence] || CONF_COLORS.low}`}>
                      {s.confidence}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
                      CL{String(s.class).padStart(2, "0")}
                    </span>
                    <span className="text-base font-semibold text-slate-900">{s.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">{s.summary}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.matched_keywords.slice(0, 5).map((kw) => (
                      <span key={kw} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium">
                        {kw}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {suggestions.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <Lightbulb size={12} weight="bold" className="text-amber-500" />
              Click a class to pin it into the search above
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default ClassFinderPanel;
