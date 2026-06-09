import React from "react";
import { ShieldCheck, ArrowsClockwise, ChartBar } from "@phosphor-icons/react";

export const HeroBanner = ({ onScrollToSearch }) => {
  return (
    <section
      data-testid="hero-banner"
      className="ts-hero-gradient rounded-2xl px-8 py-10 lg:px-12 lg:py-12 text-white relative overflow-hidden"
    >
      {/* Decorative blobs */}
      <div className="absolute -top-20 -right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 right-1/3 w-60 h-60 bg-cyan-300/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white/90 mb-5">
            <ShieldCheck size={14} weight="bold" />
            IP INDIA REGISTRY MONITOR
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-3">
            Trademark Availability
          </h2>
          <p className="text-blue-100 max-w-xl text-sm lg:text-base">
            Search the entire Indian trademark register, surface conflicting
            filings, score your risk, and generate a complete availability
            dossier — in seconds.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:gap-3">
          <button
            data-testid="hero-cta-search"
            onClick={onScrollToSearch}
            className="ts-btn-white"
          >
            <ChartBar size={16} weight="bold" />
            Start a Search
          </button>
          <a
            href="#docs"
            data-testid="hero-cta-docs"
            className="ts-btn-ghost"
          >
            <ArrowsClockwise size={16} weight="bold" />
            View API
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
