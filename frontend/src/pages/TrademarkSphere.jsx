/**
 * TrademarkSphere.jsx — Redesigned for Taskosphere v2
 *
 * New features:
 *  1. Full Taskosphere design system (dark cards, brand blues, Inter/JetBrains fonts)
 *  2. Report Branding Panel — company logo header, footer text, watermark
 *  3. Client-linked search — fetch clients from /api/clients/search, search under a client's brand
 *  4. All QuickCompany features: verdict, risk score, bulk, class finder, history, PDF, share
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from "@/lib/api";
import {
  generateReport, listHistory, getReport, bulkReports,
  findClasses, pdfDownloadUrl, shareLinkFor,
} from "@/lib/trademark-qc-api";

import {
  Shield, Search, Upload, X, ChevronDown, ChevronRight,
  FileText, AlertTriangle, CheckCircle2, Clock, Building2,
  Download, Link2, Layers, Compass, BarChart3, Users,
  Sparkles, RefreshCw, Eye, ArrowUpRight, Copy, Check,
  ImageIcon, Type, Stamp, Tag, Hash, Zap, TrendingUp,
  Info, Filter, SlidersHorizontal, Plus, Trash2,
} from "lucide-react";

// ─── Design tokens (Taskosphere system) ──────────────────────────────────────
const DARK_T = {
  bg:      "#0f172a",
  card:    "#1e293b",
  raised:  "#263348",
  border:  "#334155",
  text:    "#f1f5f9",
  muted:   "#94a3b8",
  dimmer:  "#64748b",
  blue:    "#1F6FB2",
  blueL:   "#3B82F6",
  emerald: "#1FAF5A",
  amber:   "#F59E0B",
  red:     "#EF4444",
  violet:  "#8B5CF6",
};

const LIGHT_T = {
  bg:      "#F4F6FA",
  card:    "#ffffff",
  raised:  "#f1f5f9",
  border:  "#e2e8f0",
  text:    "#0f172a",
  muted:   "#475569",
  dimmer:  "#94a3b8",
  blue:    "#1F6FB2",
  blueL:   "#3B82F6",
  emerald: "#1FAF5A",
  amber:   "#D97706",
  red:     "#DC2626",
  violet:  "#7C3AED",
};

// T is used throughout by components; each component calls useT() to keep it in sync.
let T = LIGHT_T;

function useT() {
  const isDark = useDark();
  T = isDark ? DARK_T : LIGHT_T;
  return T;
}

const VERDICT_CFG = {
  AVAILABLE: { color: T.emerald, bg: "rgba(31,175,90,0.12)",  border: "rgba(31,175,90,0.3)",  label: "Available",  dot: "#4ade80" },
  CAUTION:   { color: T.amber,   bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", label: "Caution",    dot: "#fbbf24" },
  CONFLICT:  { color: T.red,     bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",  label: "Conflict",   dot: "#f87171" },
};

const STATUS_COLOR = {
  Registered: T.red, Accepted: T.red, Advertised: T.red,
  Opposed: T.amber, Objected: T.amber, "Under Examination": T.amber,
  Pending: T.amber, Abandoned: T.dimmer, Refused: T.dimmer,
  Withdrawn: T.dimmer, Removed: T.dimmer, Unknown: T.dimmer,
};

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.23, 1, 0.32, 1] } },
};
const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────
const Card = ({ children, className = "", style = {} }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, ...style }}
    className={className}>{children}</div>
);

const SectionHeader = ({ icon: Icon, color, label, sub }) => (
  <div className="flex items-center gap-3 mb-5">
    <div style={{ background: `${color}22`, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon size={18} style={{ color }} />
    </div>
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: T.dimmer, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: T.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

const Badge = ({ status }) => {
  const color = STATUS_COLOR[status] || T.dimmer;
  return (
    <span style={{ background: `${color}22`, border: `1px solid ${color}44`, color, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
};

const MatchBadge = ({ type }) => {
  const cfg = { exact: [T.red, "Exact"], phonetic: [T.amber, "Phonetic"], contains: [T.blueL, "Contains"], similar: [T.violet, "Similar"], weak: [T.dimmer, "Weak"] };
  const [color, label] = cfg[type] || [T.dimmer, type];
  return <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 99, padding: "1px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>;
};

const Pill = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? T.blueL : T.raised, color: active ? "#fff" : T.muted,
    border: `1px solid ${active ? T.blueL : T.border}`, borderRadius: 99,
    padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  }}>{label}</button>
);

const Input = ({ style = {}, ...props }) => (
  <input style={{
    background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10,
    color: T.text, padding: "10px 14px", fontSize: 14, outline: "none",
    width: "100%", fontFamily: "inherit", transition: "border-color 0.15s", ...style,
  }} {...props} />
);

const Textarea = ({ style = {}, ...props }) => (
  <textarea style={{
    background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10,
    color: T.text, padding: "10px 14px", fontSize: 14, outline: "none",
    width: "100%", fontFamily: "inherit", resize: "vertical", ...style,
  }} {...props} />
);

const Btn = ({ children, variant = "primary", onClick, disabled, style = {}, ...props }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", transition: "all 0.15s", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", ...style };
  const variants = {
    primary: { background: T.blue, color: "#fff" },
    ghost:   { background: T.raised, color: T.muted, border: `1px solid ${T.border}` },
    danger:  { background: "rgba(239,68,68,0.15)", color: T.red, border: `1px solid rgba(239,68,68,0.3)` },
    success: { background: "rgba(31,175,90,0.15)", color: T.emerald, border: `1px solid rgba(31,175,90,0.3)` },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled} {...props}>{children}</button>;
};

// ─── Verdict status badge ─────────────────────────────────────────────────────
const VerdictBadge = ({ status, large }) => {
  const cfg = VERDICT_CFG[status] || VERDICT_CFG.CAUTION;
  return (
    <span style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      borderRadius: 99, padding: large ? "6px 18px" : "3px 12px",
      fontSize: large ? 13 : 11, fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
};

// ─── Collapsible section ──────────────────────────────────────────────────────
function Collapsible({ title, icon: Icon, iconColor, badge, defaultOpen = false, children }) {
  useT();
  iconColor = iconColor || T.blueL;
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button onClick={() => setOpen(v => !v)} style={{ width: "100%", background: "none", border: "none", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: T.text }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: `${iconColor}22`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={16} style={{ color: iconColor }} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</div>
            {badge && <div style={{ fontSize: 11, color: T.dimmer, marginTop: 2 }}>{badge}</div>}
          </div>
        </div>
        <ChevronDown size={16} style={{ color: T.dimmer, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "20px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const Skeleton = ({ h = 20, w = "100%", r = 8, mb = 0 }) => (
  <div style={{ height: h, width: w, borderRadius: r, background: `linear-gradient(90deg, ${T.raised} 25%, ${T.border} 50%, ${T.raised} 75%)`, backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", marginBottom: mb }} />
);

// ─── Report Branding Panel ────────────────────────────────────────────────────
function BrandingPanel({ branding, onChange, companies = [] }) {
  useT();
  const fileRef = useRef();
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const handleLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500_000) return toast.error("Logo must be under 500 KB");
    const reader = new FileReader();
    reader.onload = () => onChange({ ...branding, logo: reader.result, logoName: f.name });
    reader.readAsDataURL(f);
  };

  const handleCompanySelect = (e) => {
    const id = e.target.value;
    setSelectedCompanyId(id);
    if (!id) return;
    const co = companies.find(c => String(c.id) === id);
    if (!co) return;
    onChange({
      ...branding,
      logo: co.tm_logo_base64 || co.logo_base64 || branding.logo,
      logoName: (co.tm_logo_base64 || co.logo_base64) ? co.name : branding.logoName,
      footer: branding.footer || `Prepared by ${co.name}${co.gstin ? ` · GSTIN: ${co.gstin}` : ""}`,
      tagline: branding.tagline || "Trademark Availability Report",
    });
  };

  const WATERMARKS = ["", "CONFIDENTIAL", "DRAFT", "FOR REVIEW", "PRIVILEGED", "CUSTOM"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

      {/* Company selector */}
      {companies.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Report Under Company
          </div>
          <div style={{ position: "relative" }}>
            <Building2 size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.dimmer, pointerEvents: "none" }} />
            <select
              value={selectedCompanyId}
              onChange={handleCompanySelect}
              style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: selectedCompanyId ? T.text : T.dimmer, padding: "10px 14px 10px 34px", fontSize: 13, width: "100%", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}
            >
              <option value="">Select company (optional)</option>
              {companies.map(co => (
                <option key={co.id} value={String(co.id)}>{co.name}{co.gstin ? ` — ${co.gstin}` : ""}</option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.dimmer, pointerEvents: "none" }} />
          </div>
          {selectedCompanyId && (() => {
            const co = companies.find(c => String(c.id) === selectedCompanyId);
            const logoSrc = co?.tm_logo_base64 || co?.logo_base64;
            return co ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 12px", background: `${T.blue}18`, border: `1px solid ${T.blue}33`, borderRadius: 8 }}>
                {logoSrc
                  ? <img src={logoSrc} alt="logo" style={{ height: 22, maxWidth: 80, objectFit: "contain", borderRadius: 4, background: "#fff", padding: 2 }} />
                  : <Building2 size={14} style={{ color: T.blueL }} />}
                <span style={{ fontSize: 12, color: T.blueL, fontWeight: 600 }}>{co.name}</span>
                {co.tm_logo_base64
                  ? <span style={{ fontSize: 11, color: T.dimmer }}>· TM logo auto-filled</span>
                  : co.logo_base64
                    ? <span style={{ fontSize: 11, color: T.dimmer }}>· logo auto-filled</span>
                    : null}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Logo */}
      <div>
        <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Company Logo (Header)</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
        {branding.logo ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.raised, borderRadius: 10, padding: "10px 14px", border: `1px solid ${T.border}` }}>
            <img src={branding.logo} alt="logo" style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 6, background: "#fff", padding: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branding.logoName}</div>
              <div style={{ fontSize: 11, color: T.dimmer }}>Logo uploaded</div>
            </div>
            <button onClick={() => onChange({ ...branding, logo: null, logoName: null })} style={{ background: "none", border: "none", color: T.dimmer, cursor: "pointer", padding: 4 }}><X size={14} /></button>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => fileRef.current?.click()} style={{ width: "100%", justifyContent: "center" }}>
            <ImageIcon size={14} /> Upload Logo
          </Btn>
        )}
      </div>

      {/* Watermark */}
      <div>
        <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Watermark</div>
        <select value={branding.watermark} onChange={e => onChange({ ...branding, watermark: e.target.value, customWatermark: e.target.value === "CUSTOM" ? branding.customWatermark : "" })}
          style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, padding: "10px 14px", fontSize: 13, width: "100%", outline: "none", fontFamily: "inherit" }}>
          {WATERMARKS.map(w => <option key={w} value={w}>{w || "No watermark"}</option>)}
        </select>
        {branding.watermark === "CUSTOM" && (
          <Input placeholder="Enter custom watermark text…" value={branding.customWatermark || ""} onChange={e => onChange({ ...branding, customWatermark: e.target.value })} style={{ marginTop: 8 }} />
        )}
      </div>

      {/* Footer text */}
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Footer Text</div>
        <Textarea rows={2} placeholder="e.g. Prepared by Shree Hanuma & Associates · Confidential · For client use only" value={branding.footer || ""} onChange={e => onChange({ ...branding, footer: e.target.value })} />
      </div>

      {/* Header tagline */}
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Header Tagline (below logo)</div>
        <Input placeholder="e.g. Trademark Availability Report · IP Compliance Practice" value={branding.tagline || ""} onChange={e => onChange({ ...branding, tagline: e.target.value })} />
      </div>
    </div>
  );
}

// ─── Client selector ──────────────────────────────────────────────────────────
function ClientSelector({ value, onChange }) {
  useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(async (query) => {
    setLoading(true);
    try {
      const { data } = await api.get("/clients/search", { params: { q: query, limit: 20 } });
      setResults(data);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) search(q);
  }, [q, open, search]);

  const select = (client) => {
    onChange(client);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 11, color: T.dimmer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Search Under Client</div>
      <button onClick={() => setOpen(v => !v)} style={{
        width: "100%", background: T.raised, border: `1px solid ${value ? T.blueL : T.border}`,
        borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
        color: value ? T.text : T.dimmer, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={14} style={{ color: value ? T.blueL : T.dimmer }} />
          {value ? value.company_name : "Select a client (optional)"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {value && <button onClick={e => { e.stopPropagation(); onChange(null); }} style={{ background: "none", border: "none", color: T.dimmer, cursor: "pointer", lineHeight: 1, padding: 0 }}><X size={12} /></button>}
          <ChevronDown size={14} style={{ color: T.dimmer, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.15 }}
            style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 50, boxShadow: "0 16px 40px rgba(0,0,0,0.4)", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.dimmer }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" autoFocus
                  style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px 7px 30px", fontSize: 13, color: T.text, width: "100%", outline: "none", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {loading && <div style={{ padding: "14px 16px", color: T.dimmer, fontSize: 13 }}>Searching…</div>}
              {!loading && results.length === 0 && <div style={{ padding: "14px 16px", color: T.dimmer, fontSize: 13 }}>No clients found</div>}
              {results.map(c => (
                <button key={c.id} onClick={() => select(c)} style={{
                  width: "100%", background: "none", border: "none", padding: "10px 16px",
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  borderBottom: `1px solid ${T.border}`, color: T.text, fontFamily: "inherit",
                  textAlign: "left",
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: T.raised, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Building2 size={14} style={{ color: T.blueL }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.company_name}</div>
                    {c.gstin && <div style={{ fontSize: 11, color: T.dimmer }}>GSTIN: {c.gstin}</div>}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {value && (
        <div style={{ marginTop: 8, background: "rgba(31,111,178,0.1)", border: `1px solid rgba(31,111,178,0.3)`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={12} style={{ color: T.blueL, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.muted }}>Report will be filed under <strong style={{ color: T.text }}>{value.company_name}</strong></span>
        </div>
      )}
    </div>
  );
}

// ─── Main Search Bar ──────────────────────────────────────────────────────────
function SearchBar({ onSubmit, loading, defaultClass, client }) {
  useT();
  const [name, setName] = useState("");
  const [klass, setKlass] = useState(defaultClass || "");
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoName, setLogoName] = useState(null);
  const fileRef = useRef();

  useEffect(() => { if (defaultClass !== undefined) setKlass(String(defaultClass || "")); }, [defaultClass]);

  // Auto-fill from client
  useEffect(() => {
    if (client?.company_name && !name) setName(client.company_name);
  }, [client]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) return toast.error("Please upload an image file");
    if (f.size > 350_000) return toast.error("Logo must be under 350 KB");
    const reader = new FileReader();
    reader.onload = () => { setLogoDataUrl(reader.result); setLogoName(f.name); setDeviceOnly(true); };
    reader.readAsDataURL(f);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || loading) return;
    onSubmit(name.trim(), { class_filter: klass ? Number(klass) : null, device_only: deviceOnly, logo_data_url: logoDataUrl });
  };

  return (
    <Card style={{ padding: 24 }}>
      <form onSubmit={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px auto", gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.dimmer }} />
            <input data-testid="search-input" type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={client ? `Search "${client.company_name}"…` : "Enter brand name e.g. Zorbixsynth"}
              style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, padding: "11px 14px 11px 40px", fontSize: 14, outline: "none", width: "100%", fontFamily: "inherit" }} />
          </div>

          <select value={klass} onChange={e => setKlass(e.target.value)}
            style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: klass ? T.text : T.dimmer, padding: "11px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
            <option value="">All classes</option>
            {Array.from({ length: 45 }, (_, i) => i + 1).map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>

          <Btn type="submit" disabled={loading || !name.trim()} style={{ padding: "11px 24px", fontSize: 14 }}>
            {loading ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Analysing…</> : <><Zap size={14} /> Run Report</>}
          </Btn>
        </div>

        {/* Advanced row */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={deviceOnly} onChange={e => setDeviceOnly(e.target.checked)} style={{ accentColor: T.blueL, width: 15, height: 15 }} />
            <span style={{ fontSize: 13, color: T.muted }}>Device / logo marks only</span>
          </label>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
          <Btn type="button" variant="ghost" onClick={() => fileRef.current?.click()} style={{ padding: "6px 14px" }}>
            <ImageIcon size={13} /> {logoDataUrl ? "Replace logo" : "Upload logo (optional)"}
          </Btn>

          {logoDataUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={logoDataUrl} alt="preview" style={{ height: 28, width: 28, objectFit: "contain", borderRadius: 6, background: T.raised, border: `1px solid ${T.border}`, padding: 3 }} />
              <span style={{ fontSize: 12, color: T.muted }}>{logoName}</span>
              <button type="button" onClick={() => { setLogoDataUrl(null); setLogoName(null); }} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><X size={12} /> Remove</button>
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}

// ─── Verdict panel ────────────────────────────────────────────────────────────
function VerdictPanel({ report }) {
  useT();
  const cfg = VERDICT_CFG[report.overall_status] || VERDICT_CFG.CAUTION;
  const pct = report.risk_score;
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <div style={{
        background: `linear-gradient(135deg, #0D3B66 0%, #1F6FB2 50%, #1e3a8a 100%)`,
        borderRadius: 18, padding: "32px 36px", position: "relative", overflow: "hidden",
        border: `1px solid rgba(31,111,178,0.4)`,
      }}>
        {/* bg blobs */}
        <div style={{ position: "absolute", top: -60, right: -40, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: "40%", width: 180, height: 180, borderRadius: "50%", background: "rgba(56,189,248,0.1)", pointerEvents: "none" }} />

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(255,255,255,0.6)", fontWeight: 700, marginBottom: 12 }}>
              TRADEMARK AVAILABILITY REPORT {report.device_only ? "· DEVICE MARKS" : ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <VerdictBadge status={report.overall_status} large />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>RISK SCORE — {pct}/100</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1.3, maxWidth: 520, marginBottom: 24 }}>{report.headline}</div>

            {/* risk bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>0 — Low risk</span><span>100 — High risk</span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.15)", borderRadius: 99, overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
                  style={{ height: "100%", borderRadius: 99, background: cfg.dot }} />
              </div>
            </div>
          </div>

          {/* Score ring */}
          <div style={{ textAlign: "center", background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: `2px solid ${cfg.dot}44`, borderRadius: 20, padding: "24px 32px" }}>
            <div style={{ fontSize: 56, fontWeight: 800, color: cfg.dot, lineHeight: 1, letterSpacing: "-2px", fontFamily: "'JetBrains Mono', monospace" }}>{pct}</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginTop: 6, fontWeight: 700 }}>Risk Score</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{report.summary_counts?.total_results ?? 0} filings</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stat grid ────────────────────────────────────────────────────────────────
function StatGrid({ report }) {
  useT();
  const c = report.summary_counts || {};
  const stats = [
    { label: "Total Matches", value: c.total_results ?? 0, color: T.blueL, hint: "All indexed filings" },
    { label: "Exact", value: c.exact ?? 0, color: T.red, hint: "Identical name matches" },
    { label: "Phonetic", value: c.phonetic ?? 0, color: T.amber, hint: "Sound-alike matches" },
    { label: "Similar", value: c.contains_or_similar ?? 0, color: T.violet, hint: "Visual / partial overlap" },
    { label: "Blocking", value: c.blocking_exact_matches ?? 0, color: T.red, hint: "Registered exact marks" },
  ];
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible"
      style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {stats.map(s => (
        <motion.div key={s.label} variants={fadeUp}>
          <Card style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.dimmer, fontWeight: 700, marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.dimmer, marginTop: 6 }}>{s.hint}</div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Report actions ───────────────────────────────────────────────────────────
function ReportActions({ reportId }) {
  useT();
  const [copied, setCopied] = useState(false);
  if (!reportId) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareLinkFor(reportId)); setCopied(true); toast.success("Share link copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Could not copy link"); }
  };
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <a href={pdfDownloadUrl(reportId)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
        <Btn variant="ghost"><Download size={14} /> Download PDF</Btn>
      </a>
      <Btn variant="ghost" onClick={copy}>
        {copied ? <Check size={14} style={{ color: T.emerald }} /> : <Link2 size={14} />}
        {copied ? "Copied!" : "Copy share link"}
      </Btn>
    </div>
  );
}

// ─── Recommendations ──────────────────────────────────────────────────────────
function Recommendations({ recommendations, alternatives }) {
  useT();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card style={{ padding: "20px 22px" }}>
        <SectionHeader icon={Sparkles} color={T.amber} label="Recommendations" sub="Legal guidance" />
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
          {recommendations.map((r, i) => (
            <li key={i} style={{ display: "flex", gap: 10, paddingBottom: 12, borderBottom: i < recommendations.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "rgba(31,111,178,0.2)", color: T.blueL, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
              <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{r}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card style={{ padding: "20px 22px", background: `linear-gradient(135deg, ${T.card} 0%, rgba(139,92,246,0.05) 100%)` }}>
        <SectionHeader icon={Tag} color={T.violet} label="Alternative Names" sub="Suggested variations" />
        {alternatives?.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {alternatives.map((a, i) => (
              <span key={i} style={{ background: "rgba(139,92,246,0.12)", border: `1px solid rgba(139,92,246,0.3)`, color: T.violet, borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 600 }}>{a}</span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: T.muted }}>Your mark looks largely clear — no alternatives required.</p>
        )}
      </Card>
    </div>
  );
}

// ─── Class breakdown ──────────────────────────────────────────────────────────
function ClassBreakdown({ rows }) {
  useT();
  if (!rows?.length) return null;
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}` }}>
        <SectionHeader icon={BarChart3} color={T.violet} label="Class Breakdown" sub={`Filings across ${rows.length} class${rows.length === 1 ? "" : "es"}`} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.raised }}>
              {["Class", "Sector", "Total", "Blocking", "Dead"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: h === "Total" || h === "Blocking" || h === "Dead" ? "right" : "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.dimmer, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.class} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: "10px 16px" }}>
                  <span style={{ background: "rgba(31,111,178,0.2)", color: T.blueL, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>CL{String(r.class).padStart(2, "0")}</span>
                </td>
                <td style={{ padding: "10px 16px", color: T.muted }}>{r.hint || "—"}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{r.total}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: T.red, fontFamily: "'JetBrains Mono', monospace" }}>{r.blocking}</td>
                <td style={{ padding: "10px 16px", textAlign: "right", color: T.dimmer, fontFamily: "'JetBrains Mono', monospace" }}>{r.dead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Matches table ────────────────────────────────────────────────────────────
function MatchesTable({ rows }) {
  useT();
  const [matchFilter, setMatchFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQ, setSearchQ] = useState("");

  const statusOptions = ["ALL", ...Array.from(new Set(rows.map(r => r.status).filter(Boolean)))];
  const filtered = rows.filter(r => {
    if (matchFilter !== "ALL" && r.match_type !== matchFilter.toLowerCase()) return false;
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (searchQ && !r.name?.toLowerCase().includes(searchQ.toLowerCase()) && !r.applicant?.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <SectionHeader icon={Search} color={T.blueL} label="All Recorded Matches" sub={`${filtered.length} of ${rows.length} filings`} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.dimmer }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Filter…"
              style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 12, color: T.text, outline: "none", width: 140, fontFamily: "inherit" }} />
          </div>
          <select value={matchFilter} onChange={e => setMatchFilter(e.target.value)}
            style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
            {["ALL", "EXACT", "PHONETIC", "CONTAINS", "SIMILAR", "WEAK"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, padding: "6px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }}>
            {statusOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.raised }}>
              {["ID", "Name", "Applicant", "Status", "Class", "Match", "Risk", "Filed", ""].map((h, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: h === "Risk" ? "right" : "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.dimmer, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: "32px", textAlign: "center", color: T.dimmer, fontSize: 13 }}>No matches under current filters.</td></tr>
            )}
            {filtered.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: "10px 14px", color: T.dimmer, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{r.application_id || "—"}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600, color: T.text }}>{r.name}</td>
                <td style={{ padding: "10px 14px", color: T.muted }}>{r.applicant || "—"}</td>
                <td style={{ padding: "10px 14px" }}><Badge status={r.status} /></td>
                <td style={{ padding: "10px 14px", color: T.muted }}>{r.class ?? "—"}</td>
                <td style={{ padding: "10px 14px" }}><MatchBadge type={r.match_type} /></td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: r.individual_risk_score >= 70 ? T.red : r.individual_risk_score >= 40 ? T.amber : T.emerald }}>{r.individual_risk_score}</td>
                <td style={{ padding: "10px 14px", color: T.dimmer, fontSize: 11, whiteSpace: "nowrap" }}>{r.filing_date || "—"}</td>
                <td style={{ padding: "10px 14px" }}>
                  {r.detail_url && <a href={r.detail_url} target="_blank" rel="noreferrer" style={{ color: T.blueL, fontSize: 12, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>View <ArrowUpRight size={11} /></a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── API developer panel ──────────────────────────────────────────────────────
function ApiPanel({ query, classFilter }) {
  useT();
  const [copied, setCopied] = useState(null);
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/api$/, "");
  const q = encodeURIComponent(query || "your-brand");
  const cls = classFilter ? `&class=${classFilter}` : "";
  const curl = `curl "${base}/api/trademark-qc/check?name=${q}${cls}"`;
  const js = `const r = await fetch("${base}/api/trademark-qc/check?name=${q}${cls}");\nconst report = await r.json();\nconsole.log(report.overall_status, report.risk_score);`;

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  return (
    <Collapsible title="API & Embed" icon={Hash} iconColor={T.emerald} badge="Integrate in any web app" id="docs">
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>This endpoint is CORS-open — embed in any application.</p>
      {[["cURL", curl, "curl"], ["JavaScript", js, "js"]].map(([title, code, key]) => (
        <div key={key} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, marginBottom: 12 }}>
          <div style={{ background: "#0d1117", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>{title}</span>
            <button onClick={() => copy(code, key)} style={{ background: "none", border: "none", color: T.dimmer, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
              {copied === key ? <Check size={11} style={{ color: T.emerald }} /> : <Copy size={11} />} {copied === key ? "Copied" : "Copy"}
            </button>
          </div>
          <pre style={{ background: "#010409", color: "#79c0ff", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: "14px", margin: 0, overflowX: "auto", lineHeight: 1.6 }}>{code}</pre>
        </div>
      ))}
    </Collapsible>
  );
}

// ─── Bulk search ──────────────────────────────────────────────────────────────
function BulkPanel({ onPickReport }) {
  useT();
  const [text, setText] = useState("");
  const [klass, setKlass] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const run = async () => {
    const names = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return toast.error("Enter at least one name");
    if (names.length > 20) return toast.error("Max 20 names per batch");
    setLoading(true); setItems([]);
    try {
      const data = await bulkReports(names, { class_filter: klass ? Number(klass) : null });
      setItems(data.items || []);
      toast.success(`Batch complete — ${data.count} names processed`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Bulk search failed"); }
    finally { setLoading(false); }
  };

  return (
    <Collapsible title="Bulk Search" icon={Layers} iconColor={T.emerald} badge="Check up to 20 names at once">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12, marginBottom: 12 }}>
        <Textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={"One brand name per line:\nKunjveda\nFumera\nZorbixsynth"} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={klass} onChange={e => setKlass(e.target.value)}
            style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 10, color: T.muted, padding: "10px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
            <option value="">All classes</option>
            {Array.from({ length: 45 }, (_, i) => i + 1).map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
          <Btn onClick={run} disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Processing…" : "Run Batch"}
          </Btn>
          <p style={{ fontSize: 11, color: T.dimmer, margin: 0 }}>Each name creates a stored report.</p>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 60px 1fr auto", padding: "10px 14px", borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : "none", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 600, color: T.text, fontSize: 13 }}>{it.name}</span>
              {it.error ? <span style={{ color: T.red, fontSize: 12 }}>Failed</span> : <VerdictBadge status={it.overall_status} />}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.muted, fontSize: 13 }}>{it.error ? "—" : it.risk_score}</span>
              <span style={{ fontSize: 12, color: T.dimmer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.error || it.headline}</span>
              {!it.error && it.id && (
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="ghost" onClick={() => onPickReport?.(it.id)} style={{ padding: "4px 10px", fontSize: 11 }}>View</Btn>
                  <a href={pdfDownloadUrl(it.id)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <Btn variant="ghost" style={{ padding: "4px 10px", fontSize: 11 }}><Download size={11} /> PDF</Btn>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// ─── Class finder ─────────────────────────────────────────────────────────────
function ClassFinderPanel({ onPickClass }) {
  useT();
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const run = async () => {
    if (desc.trim().length < 5) return toast.error("Describe your goods/services in a few words");
    setLoading(true); setSuggestions([]);
    try {
      const data = await findClasses(desc.trim(), 6);
      setSuggestions(data.suggestions || []);
      if (!data.suggestions?.length) toast("No class matched — try more specific terms");
    } catch { toast.error("Class finder failed"); }
    finally { setLoading(false); }
  };

  const CONF_COLOR = { high: T.emerald, medium: T.amber, low: T.dimmer };

  return (
    <Collapsible title="Class Finder" icon={Compass} iconColor={T.violet} badge="Describe your product → get Nice classification">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, marginBottom: 16 }}>
        <Textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. AI-powered SaaS platform for online coaching, organic ayurvedic skincare" />
        <Btn onClick={run} disabled={loading} style={{ alignSelf: "start", justifyContent: "center", height: 44 }}>
          {loading ? "Analysing…" : "Find Classes"}
        </Btn>
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {suggestions.map((s, i) => (
            <button key={s.class} onClick={() => onPickClass?.(s.class)}
              style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "left", cursor: "pointer", transition: "border-color 0.15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: T.dimmer, fontWeight: 600, textTransform: "uppercase" }}>Rank {i + 1} · {s.score} pts</span>
                <span style={{ fontSize: 10, color: CONF_COLOR[s.confidence] || T.dimmer, fontWeight: 700, textTransform: "uppercase" }}>{s.confidence}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ background: "rgba(31,111,178,0.2)", color: T.blueL, borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>CL{String(s.class).padStart(2, "0")}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{s.title}</span>
              </div>
              <p style={{ fontSize: 12, color: T.dimmer, margin: "0 0 8px", lineHeight: 1.5 }}>{s.summary}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {s.matched_keywords.slice(0, 4).map(k => (
                  <span key={k} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 4, padding: "2px 7px", fontSize: 10 }}>{k}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

// ─── History rail ─────────────────────────────────────────────────────────────
function HistoryRail({ items, onSelect, activeId }) {
  useT();
  const fmt = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: "rgba(31,111,178,0.2)", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Clock size={14} style={{ color: T.blueL }} />
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.dimmer, fontWeight: 700 }}>Docket</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Recent Reports</div>
        </div>
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent` }}>
        {(!items?.length) && <div style={{ padding: "20px 18px", color: T.dimmer, fontSize: 13 }}>No reports yet. Run your first search.</div>}
        {items?.map(it => {
          const active = it.id === activeId;
          const cfg = VERDICT_CFG[it.overall_status] || VERDICT_CFG.CAUTION;
          return (
            <button key={it.id} onClick={() => onSelect(it)} style={{
              width: "100%", background: active ? "rgba(31,111,178,0.1)" : "none",
              border: "none", borderBottom: `1px solid ${T.border}`,
              padding: "12px 16px", textAlign: "left", cursor: "pointer",
              borderLeft: active ? `3px solid ${T.blueL}` : `3px solid transparent`, transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 10, color: T.dimmer, marginBottom: 4 }}>{fmt(it.created_at)}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.query}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <VerdictBadge status={it.overall_status} />
                <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono', monospace" }}>Risk {it.risk_score}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onScroll }) {
  useT();
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <Card style={{ padding: "60px 40px", textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(31,111,178,0.15)", border: `1px solid rgba(31,111,178,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Shield size={32} style={{ color: T.blueL }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>Enter a brand name to generate your report</h3>
        <p style={{ fontSize: 14, color: T.muted, maxWidth: 440, margin: "0 auto 24px", lineHeight: 1.6 }}>
          Every search produces a verdict, risk score, conflicting filings, class breakdown, and alternative name suggestions — saved automatically to your docket.
        </p>
        <Btn onClick={onScroll}><Search size={14} /> Start a Search</Btn>
      </Card>
    </motion.div>
  );
}

// ─── Skeleton loader full ─────────────────────────────────────────────────────
function ReportSkeleton() {
  useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      <div style={{ background: `linear-gradient(135deg, #0D3B66, #1F6FB2)`, borderRadius: 18, padding: "32px 36px" }}>
        <Skeleton h={12} w={200} r={6} mb={16} /><Skeleton h={32} w="70%" r={8} mb={12} /><Skeleton h={20} w="45%" r={6} mb={24} /><Skeleton h={8} r={99} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
        {[1,2,3,4,5].map(i=><Card key={i} style={{padding:"18px 20px"}}><Skeleton h={10} w={80} r={4} mb={10}/><Skeleton h={36} w={50} r={6} mb={8}/><Skeleton h={10} w={90} r={4}/></Card>)}
      </div>
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────
function PageHeader() {
  useT();
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, #0D3B66, #1F6FB2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Shield size={22} style={{ color: "#fff" }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: "-0.5px" }}>Trademark Sphere</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.dimmer }}>IP India registry · QuickCompany data source</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════
export default function TrademarkSphere() {
  useT();
  const { user } = useAuth();

  const [report, setReport]             = useState(null);
  const [activeId, setActiveId]         = useState(null);
  const [loading, setLoading]           = useState(false);
  const [history, setHistory]           = useState([]);
  const [error, setError]               = useState(null);
  const [lastClassFilter, setLastClassFilter] = useState(null);
  const [pinnedClass, setPinnedClass]   = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  // Companies for report branding
  const [companies, setCompanies] = useState([]);

  // Branding state
  const [branding, setBranding] = useState({ logo: null, logoName: null, footer: "", tagline: "", watermark: "", customWatermark: "" });

  const searchRef = useRef();

  useEffect(() => {
    api.get('/companies').then(res => setCompanies(res.data)).catch(() => {});
  }, []);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await listHistory(25)); } catch {}
  }, []);

  useEffect(() => {
    refreshHistory();
    const p = new URLSearchParams(window.location.search);
    const sid = p.get("report");
    if (sid) {
      (async () => {
        try { setLoading(true); const d = await getReport(sid); setReport(d.report); setActiveId(d.id); } catch { toast.error("Could not load shared report"); }
        finally { setLoading(false); }
      })();
    }
  }, [refreshHistory]);

  const handleSearch = async (name, opts = {}) => {
    setLoading(true); setError(null); setReport(null); setActiveId(null);
    setLastClassFilter(opts.class_filter ?? null);
    try {
      // Merge branding into logo_data_url if no logo uploaded in search bar
      const effectiveLogo = opts.logo_data_url || branding.logo || null;
      const data = await generateReport(name, { ...opts, logo_data_url: effectiveLogo });
      setReport(data.report);
      setActiveId(data.id);
      toast.success(`Report ready — ${data.report.overall_status}`);
      refreshHistory();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || "Failed to generate report";
      setError(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleHistorySelect = async (item) => {
    setLoading(true); setError(null); setReport(null);
    setLastClassFilter(item.class_filter || null);
    try {
      const d = await getReport(item.id);
      setReport(d.report); setActiveId(d.id);
      window.scrollTo({ top: 320, behavior: "smooth" });
    } catch { toast.error("Could not load report"); }
    finally { setLoading(false); }
  };

  const scrollToSearch = () => {
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    searchRef.current?.querySelector('input[data-testid="search-input"]')?.focus();
  };

  return (
    <>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Inter', -apple-system, sans-serif", padding: "28px 28px 48px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>

          <PageHeader />

          {/* ── Top row: client selector + branding ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <Card style={{ padding: "20px 22px" }}>
              <ClientSelector value={selectedClient} onChange={setSelectedClient} />
            </Card>
            <Collapsible title="Report Branding" icon={Stamp} iconColor={T.amber} badge="Logo · watermark · footer">
              <BrandingPanel branding={branding} onChange={setBranding} companies={companies} />
            </Collapsible>
          </div>

          {/* ── Search bar ── */}
          <div ref={searchRef} style={{ marginBottom: 16 }}>
            <SearchBar onSubmit={handleSearch} loading={loading} defaultClass={pinnedClass} client={selectedClient} />
          </div>

          {/* ── Tools row: class finder + bulk ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <ClassFinderPanel onPickClass={(cls) => { setPinnedClass(String(cls)); toast.success(`Class ${cls} pinned`); scrollToSearch(); }} />
            <BulkPanel onPickReport={async (id) => {
              const item = history.find(h => h.id === id);
              if (item) handleHistorySelect(item);
              else { try { const d = await getReport(id); setReport(d.report); setActiveId(d.id); refreshHistory(); } catch {} }
            }} />
          </div>

          {/* ── Report + history ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {loading && <ReportSkeleton />}

              {!loading && error && (
                <Card style={{ padding: "28px 28px", borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <AlertTriangle size={18} style={{ color: T.red }} />
                    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: T.red }}>Scraper Error</span>
                  </div>
                  <p style={{ margin: 0, color: "#fca5a5", fontSize: 14 }}>{error}</p>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: T.dimmer }}>QuickCompany source may be temporarily unreachable. Please retry.</p>
                </Card>
              )}

              {!loading && !error && report && (
                <motion.div variants={stagger} initial="hidden" animate="visible" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <VerdictPanel report={report} />
                  <StatGrid report={report} />

                  {/* Branding preview strip if configured */}
                  {(branding.logo || branding.watermark || branding.footer) && (
                    <Card style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {branding.logo && <img src={branding.logo} alt="brand" style={{ height: 32, objectFit: "contain", borderRadius: 4, background: "#fff", padding: "2px 6px" }} />}
                        <div>
                          {branding.tagline && <div style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>{branding.tagline}</div>}
                          {branding.footer && <div style={{ fontSize: 11, color: T.dimmer }}>{branding.footer}</div>}
                        </div>
                        {(branding.watermark === "CUSTOM" ? branding.customWatermark : branding.watermark) && (
                          <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: T.dimmer, letterSpacing: "0.15em", textTransform: "uppercase", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", opacity: 0.6 }}>
                            {branding.watermark === "CUSTOM" ? branding.customWatermark : branding.watermark}
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  <ReportActions reportId={activeId} />
                  <Recommendations recommendations={report.recommendations} alternatives={report.alternative_name_suggestions} />
                  <ClassBreakdown rows={report.class_breakdown} />
                  <MatchesTable rows={report.all_results} />
                  <ApiPanel query={report.query} classFilter={lastClassFilter} />
                </motion.div>
              )}

              {!loading && !error && !report && <EmptyState onScroll={scrollToSearch} />}
            </div>

            <div style={{ position: "sticky", top: 24, alignSelf: "start" }}>
              <HistoryRail items={history} onSelect={handleHistorySelect} activeId={activeId} />
            </div>
          </div>

          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", fontSize: 12, color: T.dimmer }}>
            <span>Data source: quickcompany.in · IP India trademark index</span>
            <span>For informational purposes only — not legal advice</span>
          </div>
        </div>
      </div>
    </>
  );
}
