import React from "react";
import {
  Target, Pulse, ChartLineUp, WarningCircle, Database, Bell,
} from "@phosphor-icons/react";

const ICONS_BY_KEY = {
  total: { Icon: Database, bg: "bg-blue-50", color: "text-blue-600" },
  exact: { Icon: Target, bg: "bg-emerald-50", color: "text-emerald-600" },
  phonetic: { Icon: Pulse, bg: "bg-cyan-50", color: "text-cyan-600" },
  similar: { Icon: ChartLineUp, bg: "bg-amber-50", color: "text-amber-600" },
  blocking: { Icon: WarningCircle, bg: "bg-red-50", color: "text-red-600" },
  alerts: { Icon: Bell, bg: "bg-violet-50", color: "text-violet-600" },
};

const NUM_COLOR_BY_KEY = {
  total: "text-blue-600",
  exact: "text-emerald-600",
  phonetic: "text-cyan-600",
  similar: "text-amber-600",
  blocking: "text-red-600",
  alerts: "text-violet-600",
};

const StatCard = ({ k, label, value, hint, onClick, testId }) => {
  const { Icon, bg, color } = ICONS_BY_KEY[k] || ICONS_BY_KEY.total;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      data-testid={testId || `stat-${k}`}
      onClick={onClick}
      className={`ts-card ts-card-hover p-5 text-left transition-shadow ${
        onClick ? "cursor-pointer" : ""
      } w-full`}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">
          {label}
        </span>
        <span className={`ts-icon-bubble ${bg}`}>
          <Icon size={18} weight="bold" className={color} />
        </span>
      </div>
      <div className={`text-4xl font-bold leading-none tracking-tight ${NUM_COLOR_BY_KEY[k] || "text-slate-900"}`}>
        {value}
      </div>
      <div className="mt-3 text-xs text-slate-500">{hint}</div>
    </Tag>
  );
};

export const StatGrid = ({ report }) => {
  if (!report) return null;
  const c = report.summary_counts || {};
  return (
    <div
      data-testid="stat-grid"
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4"
    >
      <StatCard k="total" label="Total Matches" value={c.total_results ?? 0} hint="All recorded filings" />
      <StatCard k="exact" label="Exact" value={c.exact ?? 0} hint="Identical name matches" />
      <StatCard k="phonetic" label="Phonetic" value={c.phonetic ?? 0} hint="Sound-alike matches" />
      <StatCard k="similar" label="Similar" value={c.contains_or_similar ?? 0} hint="Visual / partial overlap" />
      <StatCard k="blocking" label="Blocking" value={c.blocking_exact_matches ?? 0} hint="Registered exact marks" />
    </div>
  );
};

export default StatGrid;
