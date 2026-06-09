import React from "react";
import StatusBadge from "./StatusBadge";
import clsx from "clsx";

const TONE = {
  AVAILABLE: { bar: "bg-emerald-500", ring: "ring-emerald-200" },
  CAUTION: { bar: "bg-amber-500", ring: "ring-amber-200" },
  CONFLICT: { bar: "bg-red-500", ring: "ring-red-200" },
};

export const VerdictPanel = ({ report }) => {
  const meta = TONE[report.overall_status] || TONE.CAUTION;
  const logo = report.logo_data_url;
  return (
    <section
      data-testid="verdict-panel"
      className="ts-hero-gradient rounded-2xl p-8 lg:p-10 text-white relative overflow-hidden"
    >
      <div className="absolute -top-16 -right-16 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 left-1/3 w-60 h-60 bg-cyan-300/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12">
        {/* Left */}
        <div>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div
              data-testid="verdict-eyebrow"
              className="text-xs uppercase tracking-widest text-blue-100/90 font-semibold"
            >
              CASE FILE / VERDICT {report.device_only ? "· DEVICE MARKS" : ""}
            </div>
            {logo && (
              <img
                data-testid="verdict-logo"
                src={logo}
                alt="subject logo"
                className="h-14 w-14 object-contain rounded-xl border border-white/30 bg-white/95 p-1.5"
              />
            )}
          </div>
          <div className="flex items-center gap-3 mb-5">
            <StatusBadge status={report.overall_status} large testId="verdict-status" />
            <span className="text-xs text-blue-100/80 font-medium tracking-wide">
              RISK SCORE — {report.risk_score}/100
            </span>
          </div>
          <h2
            data-testid="verdict-headline"
            className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight"
          >
            {report.headline}
          </h2>

          <div className="mt-8">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-blue-100/70 font-medium mb-2">
              <span>0 — Low</span>
              <span>100 — High</span>
            </div>
            <div className="h-2.5 w-full bg-white/15 rounded-full overflow-hidden">
              <div
                data-testid="risk-meter-bar"
                className={clsx("h-full rounded-full", meta.bar)}
                style={{ width: `${report.risk_score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right — risk score ring */}
        <div className="flex items-center justify-center">
          <div className={`text-center ring-8 ${meta.ring} ring-opacity-20 rounded-full p-8 bg-white/10 backdrop-blur-sm`}>
            <div className="text-6xl lg:text-7xl font-bold tracking-tight leading-none">
              {report.risk_score}
            </div>
            <div className="text-xs uppercase tracking-widest text-blue-100/80 mt-2 font-medium">
              Risk Score
            </div>
            <div className="text-[10px] text-blue-100/60 mt-1">
              {report.summary_counts?.total_results ?? 0} filings reviewed
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VerdictPanel;
