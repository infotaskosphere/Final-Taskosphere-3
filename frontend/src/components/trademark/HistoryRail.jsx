import React from "react";
import StatusBadge from "./StatusBadge";
import { ClockCounterClockwise, ArrowRight } from "@phosphor-icons/react";

const dateFmt = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export const HistoryRail = ({ items, onSelect, activeId }) => {
  return (
    <aside data-testid="history-rail" className="ts-card overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center gap-3">
        <div className="ts-icon-bubble bg-blue-50">
          <ClockCounterClockwise size={18} weight="bold" className="text-blue-600" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Docket</p>
          <h4 className="text-sm font-semibold text-slate-900">Recent reports</h4>
        </div>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        {(!items || items.length === 0) && (
          <div className="p-6 text-xs text-slate-500">
            No reports yet. Run your first search.
          </div>
        )}
        {items?.map((it) => {
          const active = it.id === activeId;
          return (
            <button
              key={it.id}
              data-testid={`history-item-${it.id}`}
              onClick={() => onSelect(it)}
              className={`w-full text-left p-4 border-b border-slate-100 last:border-b-0 group transition-colors ${
                active ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] uppercase tracking-widest font-medium ${active ? "text-blue-700" : "text-slate-400"}`}>
                  {dateFmt(it.created_at)}
                </span>
                <ArrowRight size={12} weight="bold"
                  className={`transition-opacity ${active ? "opacity-100 text-blue-600" : "opacity-0 group-hover:opacity-60"}`} />
              </div>
              <div className={`font-semibold text-base leading-tight mb-2 truncate ${active ? "text-blue-900" : "text-slate-900"}`}>
                {it.query}
              </div>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={it.overall_status} />
                <span className="text-[10px] uppercase tracking-widest font-medium text-slate-500">
                  Risk {it.risk_score}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default HistoryRail;
