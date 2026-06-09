import React, { useState, useMemo } from "react";
import StatusBadge from "./StatusBadge";
import { ArrowUpRight, FunnelSimple, MagnifyingGlass } from "@phosphor-icons/react";
import clsx from "clsx";

const MATCH_LABEL = { exact: "Exact", phonetic: "Phonetic", contains: "Contains", similar: "Similar", weak: "Weak" };

export const MatchesTable = ({ rows }) => {
  const [matchFilter, setMatchFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (matchFilter !== "ALL" && r.match_type !== matchFilter.toLowerCase()) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, matchFilter, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.status).filter(Boolean));
    return ["ALL", ...Array.from(set)];
  }, [rows]);

  return (
    <section data-testid="matches-table-section" className="ts-card overflow-hidden">
      {/* Header */}
      <div className="p-6 lg:p-7 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="ts-icon-bubble bg-blue-50">
            <MagnifyingGlass size={18} weight="bold" className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">All recorded matches</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} of {rows.length} filings · newest first
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FunnelSimple size={14} weight="bold" className="text-slate-400" />
          <Select testId="filter-match-type" value={matchFilter} onChange={setMatchFilter}
            options={["ALL", "EXACT", "PHONETIC", "CONTAINS", "SIMILAR", "WEAK"]} label="Match" />
          <Select testId="filter-status" value={statusFilter} onChange={setStatusFilter}
            options={statusOptions} label="Status" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" data-testid="matches-table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/50">
              <Th>ID</Th><Th>Name</Th><Th>Applicant</Th><Th>Status</Th><Th>Logo</Th>
              <Th>Class</Th><Th>Match</Th><Th align="right">Risk</Th>
              <Th>Filed</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-12 text-center text-slate-400 text-sm">
                No matches under current filters.
              </td></tr>
            )}
            {filtered.map((r, idx) => (
              <tr key={`${r.application_id || idx}`} data-testid={`match-row-${idx}`}
                className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                <Td className="text-slate-500 font-mono text-xs">{r.application_id || "—"}</Td>
                <Td className="font-medium text-slate-900">{r.name}</Td>
                <Td className="text-slate-600">{r.applicant || "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td>
                  {r.mark_image_data_url || r.mark_image_url ? (
                    <img
                      src={r.mark_image_data_url || r.mark_image_url}
                      alt={r.name}
                      className="h-8 w-8 object-contain rounded border border-slate-200 bg-white p-0.5"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 font-bold uppercase">
                      {(r.name || "?").slice(0, 2)}
                    </div>
                  )}
                </Td>
                <Td className="text-slate-700">{r.class ?? "—"}</Td>
                <Td>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium uppercase tracking-wider">
                    {MATCH_LABEL[r.match_type] || r.match_type}
                  </span>
                </Td>
                <Td align="right">
                  <span className={clsx("font-semibold tabular-nums",
                    r.individual_risk_score >= 70 ? "text-red-600" :
                    r.individual_risk_score >= 40 ? "text-amber-600" : "text-emerald-600"
                  )}>
                    {r.individual_risk_score}
                  </span>
                </Td>
                <Td className="text-slate-500 whitespace-nowrap text-xs">{r.filing_date || "—"}</Td>
                <Td>
                  {r.detail_url && (
                    <a data-testid={`match-link-${idx}`} href={r.detail_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm font-medium">
                      View <ArrowUpRight size={12} weight="bold" />
                    </a>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const Th = ({ children, align = "left" }) => (
  <th className={`px-4 py-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-${align}`}>
    {children}
  </th>
);
const Td = ({ children, className = "", align = "left" }) => (
  <td className={`px-4 py-3 align-middle text-${align} ${className}`}>{children}</td>
);
const Select = ({ value, onChange, options, label, testId }) => (
  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-1">
    <span className="px-2 text-[10px] uppercase tracking-widest text-slate-400 font-semibold">{label}</span>
    <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}
      className="bg-transparent py-1.5 pr-3 text-xs text-slate-700 focus:outline-none">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default MatchesTable;
