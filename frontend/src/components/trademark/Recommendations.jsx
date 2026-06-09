import React from "react";
import { Lightbulb, Sparkle } from "@phosphor-icons/react";

export const Recommendations = ({ recommendations, alternatives }) => {
  return (
    <section
      data-testid="recommendations"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <div className="ts-card p-6 lg:p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="ts-icon-bubble bg-amber-50">
            <Lightbulb size={18} weight="bold" className="text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Legal Opinion</p>
            <h3 className="text-base font-semibold text-slate-900">Recommendations</h3>
          </div>
        </div>
        <ul className="space-y-4">
          {recommendations.map((rec, i) => (
            <li key={i} data-testid={`rec-${i}`}
              className="flex gap-3 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{rec}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="ts-card p-6 lg:p-7 bg-gradient-to-br from-violet-50/50 to-blue-50/30">
        <div className="flex items-center gap-3 mb-5">
          <div className="ts-icon-bubble bg-violet-100">
            <Sparkle size={18} weight="bold" className="text-violet-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Alternatives</p>
            <h3 className="text-base font-semibold text-slate-900">Suggested names</h3>
          </div>
        </div>
        {alternatives && alternatives.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {alternatives.map((alt, i) => (
              <span key={alt} data-testid={`alt-${i}`}
                className="px-3 py-1.5 rounded-lg border border-violet-200 bg-white text-sm font-medium text-slate-800 hover:bg-violet-600 hover:text-white hover:border-violet-600 transition-colors cursor-default">
                {alt}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Your mark looks largely clear — no alternatives required.
          </p>
        )}
      </div>
    </section>
  );
};

export default Recommendations;
