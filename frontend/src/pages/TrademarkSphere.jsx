/**
 * TrademarkSphere.jsx — QuickCompany Trademark Integration for Taskosphere
 *
 * Replaces the previous TrademarkSphere.jsx.
 * Drop this file into: frontend/src/pages/TrademarkSphere.jsx
 *
 * Features integrated from QuickCompany Trademark:
 *  - Full trademark availability report with risk score
 *  - Verdict panel (AVAILABLE / CAUTION / CONFLICT)
 *  - Stat grid (exact, phonetic, similar, blocking counts)
 *  - Full matches table with filters
 *  - Class-wise breakdown
 *  - Recommendations + alternative name suggestions
 *  - Bulk search (up to 20 names)
 *  - Class finder (describe your product → get Nice classes)
 *  - PDF download + share link
 *  - History docket (recent 25 reports)
 *  - API/embed developer panel
 *  - Logo upload for device mark search
 */

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  generateReport,
  listHistory,
  getReport,
} from "@/lib/trademark-qc-api";

// ── Trademark components (all in src/components/trademark/) ──────────────────
import { HeroBanner }        from "@/components/trademark/Hero";
import { SearchBar }         from "@/components/trademark/SearchBar";
import { BulkSearchPanel }   from "@/components/trademark/BulkSearchPanel";
import { ClassFinderPanel }  from "@/components/trademark/ClassFinderPanel";
import { VerdictPanel }      from "@/components/trademark/VerdictPanel";
import { StatGrid }          from "@/components/trademark/StatGrid";
import { MatchesTable }      from "@/components/trademark/MatchesTable";
import { ClassBreakdown }    from "@/components/trademark/ClassBreakdown";
import { Recommendations }   from "@/components/trademark/Recommendations";
import { ReportActions }     from "@/components/trademark/ReportActions";
import { ApiDeveloperPanel } from "@/components/trademark/ApiDeveloperPanel";
import { HistoryRail }       from "@/components/trademark/HistoryRail";
import { ReportSkeleton }    from "@/components/trademark/ReportSkeleton";

import { Warning, FileText } from "@phosphor-icons/react";

// ── Inline CSS tokens required by the QC components ─────────────────────────
// These replicate the .ts-* utility classes from the QC app's index.css.
// They are scoped inside a <style> tag rendered once when this page mounts.
const TM_STYLES = `
  .ts-hero-gradient {
    background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 30%, #2563eb 60%, #0891b2 100%);
  }
  .ts-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 1rem;
    box-shadow: 0 1px 2px 0 rgba(15,23,42,.04), 0 1px 3px 0 rgba(15,23,42,.04);
  }
  .ts-card-hover:hover {
    box-shadow: 0 4px 6px -1px rgba(15,23,42,.06), 0 2px 4px -1px rgba(15,23,42,.04);
  }
  .ts-icon-bubble {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    flex-shrink: 0;
  }
  .ts-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    border-radius: 0.75rem;
    background: #2563eb;
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    transition: background 0.15s;
    border: none;
    cursor: pointer;
  }
  .ts-btn-primary:hover { background: #1d4ed8; }
  .ts-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ts-btn-white {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-radius: 0.75rem;
    background: #ffffff;
    color: #1e3a8a;
    font-size: 0.875rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .ts-btn-white:hover { opacity: 0.9; }
  .ts-btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-radius: 0.75rem;
    background: rgba(255,255,255,0.12);
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid rgba(255,255,255,0.25);
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s;
  }
  .ts-btn-ghost:hover { background: rgba(255,255,255,0.2); }
  .ts-input {
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    color: #0f172a;
    background: #ffffff;
    outline: none;
    transition: border-color 0.15s;
  }
  .ts-input:focus { border-color: #2563eb; }
`;

export default function TrademarkSphere() {
  const [report, setReport]               = useState(null);
  const [activeReportId, setActiveReportId] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [history, setHistory]             = useState([]);
  const [error, setError]                 = useState(null);
  const [lastClassFilter, setLastClassFilter] = useState(null);
  const [pinnedClass, setPinnedClass]     = useState("");

  // ── Load history on mount ─────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const h = await listHistory(25);
      setHistory(h);
    } catch (e) {
      console.warn("History fetch failed", e);
    }
  }, []);

  useEffect(() => {
    refreshHistory();

    // Check URL for shared report id (?report=<id>)
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get("report");
    if (sharedId) {
      (async () => {
        try {
          setLoading(true);
          const doc = await getReport(sharedId);
          setReport(doc.report);
          setActiveReportId(doc.id);
        } catch {
          toast.error("Could not load shared report");
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [refreshHistory]);

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearch = async (name, opts = {}) => {
    const classFilter = opts.class_filter ?? null;
    setLoading(true);
    setError(null);
    setReport(null);
    setActiveReportId(null);
    setLastClassFilter(classFilter);
    try {
      const data = await generateReport(name, {
        class_filter: classFilter,
        device_only: opts.device_only || false,
        logo_data_url: opts.logo_data_url || null,
      });
      setReport(data.report);
      setActiveReportId(data.id);
      toast.success(`Report ready — ${data.report.overall_status}`);
      refreshHistory();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || "Failed to generate report";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── History item selection ────────────────────────────────────────────────
  const handleHistorySelect = async (item) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setLastClassFilter(item.class_filter || null);
    try {
      const doc = await getReport(item.id);
      setReport(doc.report);
      setActiveReportId(doc.id);
      window.scrollTo({ top: 320, behavior: "smooth" });
    } catch {
      toast.error("Could not load report");
    } finally {
      setLoading(false);
    }
  };

  const scrollToSearch = () => {
    const el = document.querySelector('[data-testid="search-input"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Inject QC CSS tokens once */}
      <style>{TM_STYLES}</style>

      <div className="min-h-screen bg-slate-50">
        <main className="px-4 lg:px-8 py-6 space-y-6 max-w-screen-2xl mx-auto">

          {/* Hero banner */}
          <HeroBanner onScrollToSearch={scrollToSearch} />

          {/* Search row */}
          <div className="space-y-4">
            <SearchBar
              onSubmit={handleSearch}
              loading={loading}
              defaultClass={pinnedClass}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ClassFinderPanel
                onPickClass={(cls) => {
                  setPinnedClass(String(cls));
                  toast.success(`Class ${cls} pinned — type a brand name to search`);
                  scrollToSearch();
                }}
              />
              <BulkSearchPanel
                onPickReport={async (id) => {
                  const item = history.find((h) => h.id === id);
                  if (item) {
                    handleHistorySelect(item);
                  } else {
                    try {
                      const doc = await getReport(id);
                      setReport(doc.report);
                      setActiveReportId(doc.id);
                      refreshHistory();
                      window.scrollTo({ top: 320, behavior: "smooth" });
                    } catch (_) {}
                  }
                }}
              />
            </div>
          </div>

          {/* Report area + history rail */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">

            {/* Main report section */}
            <section className="space-y-6" data-testid="report-area">

              {loading && <ReportSkeleton />}

              {!loading && error && (
                <div className="ts-card p-8 border-red-200 bg-red-50">
                  <div className="flex items-center gap-3 mb-2">
                    <Warning size={20} weight="bold" className="text-red-600" />
                    <span className="text-xs uppercase tracking-widest font-semibold text-red-700">
                      Scraper error
                    </span>
                  </div>
                  <p className="text-red-800">{error}</p>
                  <p className="text-xs mt-2 text-red-600">
                    The QuickCompany source may be temporarily unreachable. Please retry.
                  </p>
                </div>
              )}

              {!loading && !error && report && (
                <>
                  <VerdictPanel report={report} />
                  <StatGrid report={report} />
                  <ReportActions reportId={activeReportId} />
                  <Recommendations
                    recommendations={report.recommendations}
                    alternatives={report.alternative_name_suggestions}
                  />
                  <ClassBreakdown rows={report.class_breakdown} />
                  <MatchesTable rows={report.all_results} />
                  <ApiDeveloperPanel query={report.query} classFilter={lastClassFilter} />
                </>
              )}

              {!loading && !error && !report && <EmptyState />}
            </section>

            {/* History rail */}
            <HistoryRail
              items={history}
              onSelect={handleHistorySelect}
              activeId={activeReportId}
            />
          </div>

          <footer className="pt-6 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-slate-500">
            <span>Data source: quickcompany.in · IP India trademark index</span>
            <span>For informational purposes only — not legal advice</span>
          </footer>

        </main>
      </div>
    </>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div data-testid="empty-state" className="ts-card p-10 lg:p-12 text-center">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-5">
      <FileText size={28} weight="bold" className="text-blue-600" />
    </div>
    <h3 className="text-xl font-semibold text-slate-900 mb-2">
      Enter a brand name above to generate your first report.
    </h3>
    <p className="text-sm text-slate-600 max-w-md mx-auto">
      Every search produces a verdict, risk score, list of conflicting filings,
      class-by-class breakdown, and a set of alternative name suggestions —
      saved automatically to the docket on the right.
    </p>
  </div>
);
