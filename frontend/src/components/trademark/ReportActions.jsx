import React, { useState } from "react";
import { pdfDownloadUrl, shareLinkFor } from "@/lib/trademark-qc-api";
import { FilePdf, Link as LinkIcon, Check } from "@phosphor-icons/react";
import { toast } from "sonner";

export const ReportActions = ({ reportId }) => {
  const [copied, setCopied] = useState(false);
  if (!reportId) return null;

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareLinkFor(reportId));
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy link"); }
  };

  return (
    <div data-testid="report-actions" className="flex flex-wrap items-center gap-2">
      <a
        data-testid="action-download-pdf"
        href={pdfDownloadUrl(reportId)}
        target="_blank"
        rel="noreferrer"
        className="ts-btn-primary"
      >
        <FilePdf size={14} weight="bold" />
        Download PDF
      </a>
      <button
        data-testid="action-copy-link"
        onClick={copyShare}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
      >
        {copied ? <Check size={14} weight="bold" className="text-emerald-600" /> : <LinkIcon size={14} weight="bold" />}
        {copied ? "Link copied" : "Copy share link"}
      </button>
    </div>
  );
};

export default ReportActions;
