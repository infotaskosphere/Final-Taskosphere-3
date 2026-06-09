import React from "react";
import clsx from "clsx";

const PALETTE = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CAUTION: "bg-amber-50 text-amber-700 border-amber-200",
  CONFLICT: "bg-red-50 text-red-700 border-red-200",
  Registered: "bg-red-50 text-red-700 border-red-200",
  Accepted: "bg-red-50 text-red-700 border-red-200",
  Advertised: "bg-red-50 text-red-700 border-red-200",
  Opposed: "bg-red-50 text-red-700 border-red-200",
  Objected: "bg-amber-50 text-amber-700 border-amber-200",
  "Under Examination": "bg-amber-50 text-amber-700 border-amber-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Abandoned: "bg-slate-50 text-slate-600 border-slate-200",
  Refused: "bg-slate-50 text-slate-600 border-slate-200",
  Withdrawn: "bg-slate-50 text-slate-600 border-slate-200",
  Removed: "bg-slate-50 text-slate-600 border-slate-200",
  Unknown: "bg-slate-50 text-slate-600 border-slate-200",
};

export const StatusBadge = ({ status, large = false, testId }) => {
  const cls = PALETTE[status] || PALETTE.Unknown;
  return (
    <span
      data-testid={testId}
      className={clsx(
        "inline-flex items-center font-medium border rounded-full",
        large ? "text-xs px-3 py-1.5" : "text-[11px] px-2.5 py-0.5",
        cls
      )}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
