import React from "react";

export const ReportSkeleton = () => (
  <div data-testid="report-skeleton" className="space-y-4">
    <div className="ts-card p-8 lg:p-10 ts-hero-gradient relative overflow-hidden">
      <div className="h-3 w-32 bg-white/30 animate-pulse rounded-full mb-5" />
      <div className="h-10 w-3/4 bg-white/30 animate-pulse rounded-lg mb-3" />
      <div className="h-10 w-1/2 bg-white/30 animate-pulse rounded-lg mb-6" />
      <div className="h-3 w-full bg-white/30 animate-pulse rounded-full" />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="ts-card p-5">
          <div className="h-3 w-20 bg-slate-200 animate-pulse rounded mb-4" />
          <div className="h-10 w-12 bg-slate-200 animate-pulse rounded mb-3" />
          <div className="h-3 w-24 bg-slate-200 animate-pulse rounded" />
        </div>
      ))}
    </div>
  </div>
);

export default ReportSkeleton;
