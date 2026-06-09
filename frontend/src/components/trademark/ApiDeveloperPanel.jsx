import React, { useState } from "react";
import { Copy, Check, Code } from "@phosphor-icons/react";

export const ApiDeveloperPanel = ({ query, classFilter }) => {
  const [copied, setCopied] = useState(null);
  const backend = import.meta.env.VITE_API_URL;
  const q = encodeURIComponent(query || "your-brand");
  const cls = classFilter ? `&class=${classFilter}` : "";
  const curl = `curl -X GET "${backend}/api/trademark-qc/check?name=${q}${cls}"`;
  const js =
    `const res = await fetch("${backend}/api/trademark-qc/check?name=${q}${cls}");\n` +
    `const report = await res.json();\n` +
    `console.log(report.overall_status, report.risk_score);`;

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch (_e) {}
  };

  return (
    <section data-testid="api-developer-panel" id="docs" className="ts-card overflow-hidden">
      <div className="p-6 lg:p-7 border-b border-slate-100 flex items-center gap-3">
        <div className="ts-icon-bubble bg-cyan-50">
          <Code size={18} weight="bold" className="text-cyan-600" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Integration</p>
          <h3 className="text-base font-semibold text-slate-900">Embed in any web app</h3>
        </div>
      </div>
      <div className="p-6 lg:p-7 space-y-5">
        <p className="text-sm text-slate-700 max-w-2xl">
          The same report is available as a public, CORS-open REST endpoint.
          Drop this into any other web application to instantly fetch availability data.
        </p>
        <CodeBlock title="cURL" code={curl} testId="curl-snippet"
          onCopy={() => copy(curl, "curl")} copied={copied === "curl"} />
        <CodeBlock title="JavaScript" code={js} testId="js-snippet"
          onCopy={() => copy(js, "js")} copied={copied === "js"} />
      </div>
    </section>
  );
};

const CodeBlock = ({ title, code, onCopy, copied, testId }) => (
  <div className="rounded-xl overflow-hidden border border-slate-200">
    <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2.5">
      <span className="text-[11px] font-mono uppercase tracking-widest text-slate-300">{title}</span>
      <button
        data-testid={`copy-${testId}`}
        onClick={onCopy}
        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors"
      >
        {copied ? <Check size={12} weight="bold" className="text-emerald-400" /> : <Copy size={12} weight="bold" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
    <pre data-testid={testId}
      className="bg-slate-950 text-emerald-300 font-mono text-xs p-4 overflow-x-auto leading-relaxed">
      {code}
    </pre>
  </div>
);

export default ApiDeveloperPanel;
