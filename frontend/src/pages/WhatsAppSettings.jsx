// =============================================================================
// WhatsAppSettings.jsx — Message Templates (localStorage-based, no backend)
// Theme matches GeneralSettings / rest of the app via useDark()
// =============================================================================

import React, { useState, useEffect } from "react";
import { useDark } from "@/hooks/useDark";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  MessageCircle, Settings, Save, CheckCircle2,
  FileText, Users, Shield, Key, Eye, Building2, ChevronDown,
} from "lucide-react";
import { getWASettings, saveWASettings } from "@/hooks/useWhatsApp";
import api from "@/lib/api";

// ─── Brand colours (same palette as rest of app) ─────────────────────────────
const COLORS = {
  emeraldGreen: "#128C7E",
  lightGreen:   "#25D366",
};
const GRADIENT     = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;
const GRADIENT_BTN = `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`;

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATES = [
  {
    key:   "invoiceTemplate",
    label: "Invoice Reminder",
    vars:  "{number}  {amount}  {due_date}  {status}",
    icon:  FileText,
    color: "#3b82f6",
    pk:    "invoice",
    sample: { number: "INV-2024-001", amount: "25,000.00", due_date: "31 May 2026", status: "PENDING" },
  },
  {
    key:   "clientTemplate",
    label: "Client Message",
    vars:  "{name}  {firm}  {message}",
    icon:  Users,
    color: "#8b5cf6",
    pk:    "client",
    sample: { name: "Infosys Ltd", firm: "Your CA Firm", message: "Reminder about pending compliance." },
  },
  {
    key:   "dscTemplate",
    label: "DSC Expiry Alert",
    vars:  "{holder}  {expiry}  {days}",
    icon:  Shield,
    color: "#f59e0b",
    pk:    "dsc",
    sample: { holder: "John Doe", expiry: "15 Jun 2026", days: "22" },
  },
  {
    key:   "passwordTemplate",
    label: "Password Share",
    vars:  "{portal}  {username}  {password}",
    icon:  Key,
    color: "#ef4444",
    pk:    "password",
    sample: { portal: "GST Portal", username: "user@firm.com", password: "••••••••" },
  },
];

// ─── Build live preview text ──────────────────────────────────────────────────
function buildPreviewText(settings, previewKey) {
  const lines = [];
  if (settings.includeGreeting) {
    lines.push((settings.greetingTemplate || "Dear {name},").replace("{name}", "Valued Client"));
    lines.push("");
  }
  if (settings.firmName) {
    lines.push("*" + settings.firmName + "*" + (settings.firmTagline ? " | " + settings.firmTagline : ""));
    lines.push("");
  }
  const tpl = TEMPLATES.find(t => t.pk === previewKey);
  if (tpl) {
    let msg = settings[tpl.key] || "";
    Object.entries(tpl.sample).forEach(([k, v]) => {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    });
    lines.push(msg);
  }
  if (settings.includeFooter && settings.footerNote) {
    lines.push("");
    lines.push(settings.footerNote);
  }
  return lines.join("\n");
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ on, onChange, isDark }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11, cursor: "pointer",
        background: on ? COLORS.lightGreen : (isDark ? "#334155" : "#cbd5e1"),
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 20 : 3,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function WhatsAppSettings() {
  const isDark  = useDark();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [settings,   setSettings]   = useState(getWASettings);
  const [saved,      setSaved]      = useState(false);
  const [previewKey, setPreviewKey] = useState("invoice");
  const [activeTab,  setActiveTab]  = useState(isAdmin ? "templates" : "info");
  const [companies,  setCompanies]  = useState([]);

  useEffect(() => {
    api.get("/companies").then(r => setCompanies(r.data || [])).catch(() => {});
  }, []);

  // Auto-populate firmName from first company if not yet set
  useEffect(() => {
    if (companies.length > 0 && !settings.firmName) {
      const first = companies[0];
      setSettings(s => ({ ...s, firmName: first.name || first.trade_name || "" }));
    }
  }, [companies]); // eslint-disable-line

  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = () => {
    saveWASettings(settings);
    toast.success("WhatsApp templates saved — all pages updated!");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── Theme-aware class helpers ──────────────────────────────────────────────
  const card  = isDark ? "bg-slate-800 border-slate-700"  : "bg-white border-slate-200";
  const inner = isDark ? "bg-slate-900 border-slate-700"  : "bg-slate-50 border-slate-200";
  const txt   = isDark ? "text-slate-100"                  : "text-slate-800";
  const muted = isDark ? "text-slate-400"                  : "text-slate-500";
  const divider = isDark ? "border-slate-700" : "border-slate-200";

  const inputCls = [
    "w-full rounded-lg border px-3 py-2 text-sm outline-none",
    "focus:ring-2 focus:ring-emerald-400 transition",
    isDark
      ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-600"
      : "bg-white border-slate-300 text-slate-800 placeholder-slate-400",
  ].join(" ");

  const labelCls = `block text-[11px] font-semibold uppercase tracking-wider mb-1 ${muted}`;

  const TABS = [
    ...(isAdmin ? [{ id: "templates", label: "Message Templates", icon: MessageCircle }] : []),
    { id: "info", label: "How It Works", icon: Eye },
  ];

  const previewText = buildPreviewText(settings, previewKey);

  return (
    <div className="space-y-4 w-full min-w-0 overflow-x-hidden">

      {/* ── BANNER ─────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div
          className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{ background: GRADIENT, boxShadow: "0 8px 32px rgba(18,140,126,0.25)" }}
        >
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                WhatsApp Settings
              </h1>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mt-0.5">
                Message templates · Shared across all pages
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="relative mt-4 flex flex-wrap gap-1 bg-white/10 p-1 rounded-xl w-fit">
            {TABS.map(t => {
              const I = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                    active ? "bg-white text-slate-800 shadow" : "text-white/80 hover:text-white"
                  }`}
                >
                  <I className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ── TEMPLATES TAB ──────────────────────────────────────────── */}
      {activeTab === "templates" && isAdmin && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

          {/* LEFT: form (3/5) */}
          <motion.div
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
            className="xl:col-span-3"
          >
            <div className={`rounded-2xl border shadow-sm p-5 sm:p-6 space-y-5 ${card}`}>

              {/* Firm identity */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-emerald-500" />
                  <span className={`text-sm font-bold ${txt}`}>Firm Identity</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Firm Name</label>
                    {companies.length > 0 ? (
                      <div className="flex gap-2">
                        <input
                          className={inputCls}
                          value={settings.firmName || ""}
                          onChange={e => update("firmName", e.target.value)}
                          placeholder="Your CA Firm"
                        />
                        <div className="relative flex-shrink-0">
                          <select
                            className={`${inputCls} pr-7 appearance-none cursor-pointer`}
                            style={{ width: "auto", minWidth: 32 }}
                            value=""
                            onChange={e => { if (e.target.value) update("firmName", e.target.value); }}
                            title="Pick from your companies"
                          >
                            <option value="">↓</option>
                            {companies.map(co => (
                              <option key={co.id} value={co.name || co.trade_name || ""}>
                                {co.name || co.trade_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <input
                        className={inputCls}
                        value={settings.firmName || ""}
                        onChange={e => update("firmName", e.target.value)}
                        placeholder="Your CA Firm"
                      />
                    )}
                    {companies.length > 0 && (
                      <p className={`text-[10px] mt-1 ${muted}`}>Click ↓ to pick from your companies</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Tagline</label>
                    <input
                      className={inputCls}
                      value={settings.firmTagline || ""}
                      onChange={e => update("firmTagline", e.target.value)}
                      placeholder="Trusted Compliance Partner"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-5 mt-4">
                  {[
                    { key: "includeGreeting", label: "Include Greeting" },
                    { key: "includeFooter",   label: "Include Footer"   },
                  ].map(({ key, label }) => (
                    <label key={key} className={`flex items-center gap-2.5 cursor-pointer text-sm ${muted}`}>
                      <Toggle on={!!settings[key]} onChange={v => update(key, v)} isDark={isDark} />
                      {label}
                    </label>
                  ))}
                </div>

                {settings.includeGreeting && (
                  <div className="mt-3">
                    <label className={labelCls}>Greeting line <span className="normal-case font-normal opacity-70">(use {"{name}"})</span></label>
                    <input
                      className={inputCls}
                      value={settings.greetingTemplate || ""}
                      onChange={e => update("greetingTemplate", e.target.value)}
                      placeholder="Dear {name},"
                    />
                  </div>
                )}
                {settings.includeFooter && (
                  <div className="mt-3">
                    <label className={labelCls}>Footer note</label>
                    <input
                      className={inputCls}
                      value={settings.footerNote || ""}
                      onChange={e => update("footerNote", e.target.value)}
                      placeholder="Thank you for your trust."
                    />
                  </div>
                )}
              </div>

              <div className={`border-t ${divider}`} />

              {/* Templates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle className="h-4 w-4 text-emerald-500" />
                  <span className={`text-sm font-bold ${txt}`}>Message Templates</span>
                  <span className={`text-xs ml-1 ${muted}`}>— click any field to preview it</span>
                </div>

                <div className="space-y-4">
                  {TEMPLATES.map(tpl => {
                    const Icon = tpl.icon;
                    const isActive = previewKey === tpl.pk;
                    return (
                      <div
                        key={tpl.key}
                        className={`rounded-xl border p-4 transition ${inner} ${isActive ? "ring-2 ring-emerald-400/40" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ background: tpl.color + "22" }}
                          >
                            <Icon className="h-3.5 w-3.5" style={{ color: tpl.color }} />
                          </div>
                          <span className={`text-xs font-bold ${txt}`}>{tpl.label}</span>
                          <span className={`text-[10px] ml-auto font-mono opacity-60 ${muted}`}>{tpl.vars}</span>
                        </div>
                        <textarea
                          rows={3}
                          className={`${inputCls} resize-none font-mono text-xs`}
                          value={settings[tpl.key] || ""}
                          onChange={e => update(tpl.key, e.target.value)}
                          onFocus={() => setPreviewKey(tpl.pk)}
                          placeholder={`Write your ${tpl.label} message here…`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                style={{ background: saved ? "#25D366" : GRADIENT_BTN }}
              >
                {saved
                  ? <><CheckCircle2 className="h-4 w-4" /> Saved to all pages!</>
                  : <><Save className="h-4 w-4" /> Save Templates</>
                }
              </button>
            </div>
          </motion.div>

          {/* RIGHT: live preview (2/5) */}
          <motion.div
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
            className="xl:col-span-2 flex flex-col gap-4"
          >
            {/* WA preview */}
            <div className={`rounded-2xl border shadow-sm p-5 flex flex-col gap-4 ${card}`}>
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <span className={`text-sm font-bold ${txt}`}>Live Preview</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map(t => (
                  <button
                    key={t.pk}
                    onClick={() => setPreviewKey(t.pk)}
                    className="px-3 py-1 rounded-full text-xs font-semibold border transition"
                    style={{
                      borderColor: previewKey === t.pk ? t.color : (isDark ? "#334155" : "#e2e8f0"),
                      background:  previewKey === t.pk ? t.color + "22" : "transparent",
                      color:       previewKey === t.pk ? t.color : (isDark ? "#94a3b8" : "#64748b"),
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Chat bubble */}
              <div
                className="rounded-xl p-3 min-h-[160px]"
                style={{ background: isDark ? "#0b141a" : "#e5ddd5" }}
              >
                <div
                  className="rounded-lg p-3 max-w-[85%] leading-relaxed whitespace-pre-wrap break-words"
                  style={{
                    background:   isDark ? "#005c4b" : "#dcf8c6",
                    color:        isDark ? "#e9edef" : "#111827",
                    borderRadius: "8px 8px 8px 2px",
                    fontSize:     12,
                  }}
                >
                  {previewText || "Configure a template on the left to see the preview here."}
                </div>
                <p className={`text-right text-[10px] mt-1 ${muted}`}>Delivered ✓✓</p>
              </div>

              <div className={`rounded-xl border p-3 text-xs ${inner}`}>
                <p className={`leading-relaxed ${muted}`}>
                  <span className={`font-bold ${txt}`}>One page, all pages synced.</span>{" "}
                  WhatsApp buttons in Clients, Invoicing, DSC & PassVault all use these templates with real data auto-filled.
                </p>
              </div>
            </div>

            {/* Variable reference */}
            <div className={`rounded-2xl border shadow-sm p-5 ${card}`}>
              <div className="flex items-center gap-2 mb-3">
                <Settings className="h-4 w-4 text-emerald-500" />
                <span className={`text-sm font-bold ${txt}`}>Variable Reference</span>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Invoice",  vars: ["{number}", "{amount}", "{due_date}", "{status}"] },
                  { label: "Client",   vars: ["{name}", "{firm}", "{message}"]                  },
                  { label: "DSC",      vars: ["{holder}", "{expiry}", "{days}"]                 },
                  { label: "Password", vars: ["{portal}", "{username}", "{password}"]           },
                ].map(row => (
                  <div key={row.label} className="flex items-start gap-2">
                    <span className={`w-16 flex-shrink-0 font-semibold ${muted}`}>{row.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {row.vars.map(v => (
                        <code
                          key={v}
                          className="px-1.5 py-0.5 rounded font-mono"
                          style={{
                            background: isDark ? "#1e3a5f" : "#dbeafe",
                            color:      isDark ? "#60a5fa" : "#1e40af",
                            fontSize:   10,
                          }}
                        >
                          {v}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── HOW IT WORKS TAB ───────────────────────────────────────── */}
      {activeTab === "info" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className={`rounded-2xl border shadow-sm p-6 max-w-2xl ${card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-4 w-4 text-emerald-500" />
              <span className={`text-base font-bold ${txt}`}>How WhatsApp Integration Works</span>
            </div>
            <div className="space-y-4 text-sm">
              {[
                {
                  step: "1",
                  title: "No extra app or API key needed",
                  desc:  "Messages open in WhatsApp Web or your phone's WhatsApp directly — no third-party service required.",
                },
                {
                  step: "2",
                  title: "One-click send when phone is available",
                  desc:  "If a client has a phone number saved, clicking the WhatsApp button pre-fills the message and opens WhatsApp immediately.",
                },
                {
                  step: "3",
                  title: "Manual entry when phone is missing",
                  desc:  "If no phone number is saved, a small dialog appears where you can type the number before sending.",
                },
                {
                  step: "4",
                  title: "Templates auto-fill real data",
                  desc:  "Variables like {name}, {amount}, {due_date} are replaced with actual values from the record — no manual editing needed.",
                },
                {
                  step: "5",
                  title: "Available across the whole app",
                  desc:  "WhatsApp buttons appear in Clients, Invoicing, DSC Register, and Password Vault — all using the same templates set here.",
                },
              ].map(item => (
                <div key={item.step} className="flex gap-4">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: GRADIENT_BTN }}
                  >
                    {item.step}
                  </div>
                  <div>
                    <p className={`font-semibold mb-0.5 ${txt}`}>{item.title}</p>
                    <p className={muted}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
