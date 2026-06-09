import React from "react";
import { ChartBar } from "@phosphor-icons/react";

export const ClassBreakdown = ({ rows }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <section data-testid="class-breakdown" className="ts-card overflow-hidden">
      <div className="p-6 lg:p-7 border-b border-slate-100 flex items-center gap-3">
        <div className="ts-icon-bubble bg-violet-50">
          <ChartBar size={18} weight="bold" className="text-violet-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Class-wise breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Filings across {rows.length} class{rows.length === 1 ? "" : "es"}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/50">
            <Th>Class</Th><Th>Hint</Th>
            <Th align="right">Total</Th><Th align="right">Blocking</Th><Th align="right">Dead</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.class} className="border-t border-slate-100" data-testid={`class-row-${r.class}`}>
              <Td>
                <span className="inline-flex items-center justify-center min-w-[2.75rem] px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold text-xs">
                  CL{String(r.class).padStart(2, "0")}
                </span>
              </Td>
              <Td className="text-slate-700">{r.hint}</Td>
              <Td align="right" className="tabular-nums font-medium text-slate-900">{r.total}</Td>
              <Td align="right" className="tabular-nums font-medium text-red-600">{r.blocking}</Td>
              <Td align="right" className="tabular-nums text-slate-500">{r.dead}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
const Th = ({ children, align = "left" }) => (
  <th className={`px-4 py-3 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-${align}`}>{children}</th>
);
const Td = ({ children, align = "left", className = "" }) => (
  <td className={`px-4 py-3 text-${align} ${className}`}>{children}</td>
);
export default ClassBreakdown;
