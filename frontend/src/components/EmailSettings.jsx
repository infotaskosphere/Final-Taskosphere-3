// ═══════════════════════════════════════════════════════════════════════════════
// EmailSettings.jsx  v4  — COMPLETE REWRITE
// Connect MULTIPLE email accounts via App Passwords — NO OAuth needed.
// NEW IN v4:
//  - FIX: Deleting one reminder/visit no longer wipes all auto-synced items
//  - FEATURE: Sender Email Whitelist — only sync from approved senders
//  - FEATURE: Smart category preview — shows TODO / REMINDER / VISIT badge
//  - FEATURE: Auto-save Todos toggle (Examination Reports → Todo)
//  - FEATURE: Category rules visible in UI
//  - Gmail pre-flight checklist (IMAP enable + App Password guide)
//  - All v3 features retained
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Mail, Plus, Trash2, CheckCircle2, AlertCircle,
  Loader2, Eye, EyeOff, ExternalLink, ChevronDown, ChevronUp,
  Wifi, WifiOff, Edit2, Check, X, Info, Shield,
  RefreshCw, Calendar, Bell, Eraser, Clock, Sparkles,
  Settings2, ToggleLeft, ToggleRight, Zap, AlertTriangle,
  CheckSquare, UserCheck, Filter, Tag, Plus as PlusIcon,
  List, ChevronRight, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

const C = { deepBlue: "#0D3B66", mediumBlue: "#1F6FB2", emerald: "#1FAF5A" };

const PROVIDER_COLORS = {
  gmail:   "#EA4335",
  outlook: "#0078D4",
  yahoo:   "#720E9E",
  icloud:  "#3B82F6",
  other:   "#374151",
};
const PROVIDER_ICONS = {
  gmail:   "G",
  outlook: "M",
  yahoo:   "Y",
  icloud:  "iC",
  other:   "@",
};

// Category color/label map
const CATEGORY_CONFIG = {
  todo:     { label: "Todo",     color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE" },
  reminder: { label: "Reminder", color: "#0D3B66", bg: "#EFF6FF", border: "#BFDBFE" },
  visit:    { label: "Visit",    color: "#059669", bg: "#F0FDF4", border: "#BBF7D0" },
};

const QUICK_PROVIDERS = [
  {
    id: "gmail", label: "Gmail", color: "#EA4335", icon: "G",
    domain: "gmail.com", imap_host: "imap.gmail.com", imap_port: 993,
    app_password_url: "https://myaccount.google.com/apppasswords",
    imap_enable_url:  "https://mail.google.com/mail/u/0/#settings/fwdandpop",
    steps: [
      { num: 1, text: "Enable IMAP:", link: "https://mail.google.com/mail/u/0/#settings/fwdandpop", linkText: "Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP → Save" },
      { num: 2, text: "Enable 2-Step Verification:", link: "https://myaccount.google.com/security", linkText: "myaccount.google.com/security" },
      { num: 3, text: "Create App Password:", link: "https://myaccount.google.com/apppasswords", linkText: "myaccount.google.com/apppasswords" },
      { num: 4, text: "Select App: Mail · Device: Other · Name: Taskosphere → Generate" },
      { num: 5, text: "Copy the 16-character password shown and paste it below" },
    ],
    note: "⚠️ All 3 steps above are required. AUTHENTICATION FAILED means IMAP is off or App Password is wrong.",
    placeholder: "abcd efgh ijkl mnop",
  },
  {
    id: "outlook", label: "Outlook / Hotmail", color: "#0078D4", icon: "M",
    domain: "outlook.com", imap_host: "outlook.office365.com", imap_port: 993,
    app_password_url: "https://account.microsoft.com/security",
    imap_enable_url: null,
    steps: [
      { num: 1, text: "Open", link: "https://account.microsoft.com/security", linkText: "account.microsoft.com/security" },
      { num: 2, text: "Click 'Advanced security options'" },
      { num: 3, text: "Under App passwords → Create a new app password" },
      { num: 4, text: "Copy the generated password and paste below" },
    ],
    note: "⚠️ Requires Microsoft account with 2-step verification on.",
    placeholder: "xxxx xxxx xxxx xxxx",
  },
  {
    id: "yahoo", label: "Yahoo Mail", color: "#720E9E", icon: "Y",
    domain: "yahoo.com", imap_host: "imap.mail.yahoo.com", imap_port: 993,
    app_password_url: "https://login.yahoo.com/myaccount/security/",
    imap_enable_url: null,
    steps: [
      { num: 1, text: "Open", link: "https://login.yahoo.com/myaccount/security/", linkText: "Yahoo Account Security" },
      { num: 2, text: "Click 'Generate app password'" },
      { num: 3, text: "Select 'Other App' → enter Taskosphere → Get password" },
      { num: 4, text: "Copy and paste the password below" },
    ],
    note: "⚠️ Do NOT use your Yahoo login password here.",
    placeholder: "xxxx xxxx xxxx xxxx",
  },
  {
    id: "icloud", label: "iCloud Mail", color: "#3B82F6", icon: "iC",
    domain: "icloud.com", imap_host: "imap.mail.me.com", imap_port: 993,
    app_password_url: "https://appleid.apple.com",
    imap_enable_url: null,
    steps: [
      { num: 1, text: "Open", link: "https://appleid.apple.com", linkText: "appleid.apple.com" },
      { num: 2, text: "Sign In & Security → App-Specific Passwords" },
      { num: 3, text: "Click + → name it Taskosphere → Create" },
      { num: 4, text: "Copy and paste the password below" },
    ],
    note: "⚠️ Apple ID must have 2FA enabled.",
    placeholder: "xxxx-xxxx-xxxx-xxxx",
  },
  {
    id: "other", label: "Other Email", color: "#374151", icon: "@",
    domain: "", imap_host: "", imap_port: 993, app_password_url: "",
    imap_enable_url: null,
    steps: [
      { num: 1, text: "Ask your email provider for IMAP settings" },
      { num: 2, text: "Typical host: imap.yourdomain.com · Port: 993" },
      { num: 3, text: "Use your regular password or an app password if available" },
    ],
    note: "",
    placeholder: "your email password",
  },
];

// Pre-defined sender suggestions for CA/CS firms
const SUGGESTED_SENDERS = [
  { email_address: "@ipindia.gov.in",           label: "IP India (all)" },
  { email_address: "noreply@ipindia.gov.in",    label: "IP India No-Reply" },
  { email_address: "@mca.gov.in",               label: "MCA Portal (all)" },
  { email_address: "@gst.gov.in",               label: "GST Portal (all)" },
  { email_address: "@incometax.gov.in",         label: "Income Tax (all)" },
  { email_address: "@taxinformationnetwork.com",label: "TIN / TDS" },
  { email_address: "@zoom.us",                  label: "Zoom Meetings" },
  { email_address: "@calendar.google.com",      label: "Google Calendar" },
];

// ─── Gmail Checklist Banner ──────────────────────────────────────────────────
function GmailChecklistBanner({ onDismiss }) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border-2 border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-red-100 border-b border-red-200">
        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-sm font-bold text-red-800 flex-1">Authentication Failed — Complete these 3 steps for Gmail</p>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        {[
          { num: 1, title: "Enable IMAP in Gmail", link: "https://mail.google.com/mail/u/0/#settings/fwdandpop", linkText: "Open Gmail IMAP Settings →", detail: "Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save Changes" },
          { num: 2, title: "Turn on 2-Step Verification", link: "https://myaccount.google.com/security", linkText: "Open Google Security →", detail: "Security → 2-Step Verification → Turn On" },
          { num: 3, title: "Generate a fresh App Password", link: "https://myaccount.google.com/apppasswords", linkText: "Create App Password →", detail: "App: Mail · Device: Other (Taskosphere) → Generate → Copy 16 chars" },
        ].map(step => (
          <div key={step.num} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-white">{step.num}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800">{step.title}</p>
              <p className="text-xs text-red-600 mt-0.5">{step.detail}</p>
              <a href={step.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-red-700 underline hover:text-red-900">
                {step.linkText}<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
        <div className="mt-2 p-2.5 rounded-xl bg-white border border-red-100 text-xs text-red-700">
          After completing all 3 steps, generate a <strong>brand new</strong> App Password and try again.
        </div>
      </div>
    </motion.div>
  );
}

// ─── Category Rules Info Panel ───────────────────────────────────────────────
function CategoryRulesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Smart Categorization Rules</span>
          <span className="text-xs text-slate-400">How emails are classified</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="p-4 space-y-3 bg-white">
              {[
                {
                  cat: "todo",
                  label: "→ Saved as Todo",
                  desc: "Action required notices",
                  examples: ["Examination Report", "Office Action", "Objection Raised", "Reply Required", "Show Cause Notice (to respond)", "Reply within X days"],
                },
                {
                  cat: "reminder",
                  label: "→ Saved as Reminder",
                  desc: "Scheduled dates and hearings",
                  examples: ["Trademark Hearing", "Court Hearing (NCLT, HC)", "GST Filing Dates (GSTR-1, 3B)", "Income Tax / Advance Tax", "Due Dates", "ROC Filing Deadlines"],
                },
                {
                  cat: "visit",
                  label: "→ Saved as Visit",
                  desc: "Meetings and consultations",
                  examples: ["Zoom Meeting Invite", "Google Meet Link", "Microsoft Teams", "Client Visit Scheduled", "Office Visit", "Conference / Webinar"],
                },
              ].map(({ cat, label, desc, examples }) => {
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <div key={cat} className="rounded-xl border p-3"
                    style={{ borderColor: cfg.border, backgroundColor: cfg.bg }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: cfg.color }}>
                        {cfg.label.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold" style={{ color: cfg.color }}>{label}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{desc}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {examples.map(ex => (
                        <span key={ex} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white border"
                          style={{ borderColor: cfg.border, color: cfg.color }}>
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400 mt-1">
                ℹ️ AI uses these rules + context to classify. You can always override when manually saving.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sender Whitelist Manager ────────────────────────────────────────────────
function SenderWhitelistManager({ userId }) {
  const [senders, setSenders]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding,   setAdding]   = useState(false);
  const [open,     setOpen]     = useState(false);

  const fetchSenders = useCallback(async () => {
    try {
      const res = await api.get("/email/sender-whitelist");
      setSenders(res.data?.senders || []);
    } catch {
      setSenders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSenders(); }, [fetchSenders]);

  const handleAdd = async (emailAddr, label) => {
    const addr = (emailAddr || newEmail).trim().toLowerCase();
    const lbl  = (label || newLabel).trim();
    if (!addr) { toast.error("Enter a sender email or @domain.com"); return; }
    if (!addr.includes("@")) { toast.error("Must contain @ — use email@domain.com or @domain.com"); return; }
    setAdding(true);
    try {
      const res = await api.post("/email/sender-whitelist", { email_address: addr, label: lbl || addr });
      setSenders(res.data?.senders || []);
      setNewEmail(""); setNewLabel("");
      toast.success(`✓ ${addr} added to whitelist`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add sender");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (addr) => {
    try {
      const res = await api.delete(`/email/sender-whitelist/${encodeURIComponent(addr)}`);
      setSenders(res.data?.senders || []);
      toast.success("Sender removed");
    } catch {
      toast.error("Failed to remove sender");
    }
  };

  const isWhitelistActive = senders.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isWhitelistActive ? "bg-emerald-50" : "bg-slate-100"}`}>
            <Filter className={`w-4 h-4 ${isWhitelistActive ? "text-emerald-600" : "text-slate-400"}`} />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">
              Sender Whitelist
              {isWhitelistActive && (
                <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {senders.length} ACTIVE
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {isWhitelistActive
                ? `Only syncing emails from ${senders.length} approved sender${senders.length !== 1 ? "s" : ""}`
                : "Syncing from all senders (no filter active)"}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-slate-100 p-5 space-y-4">

              {/* Info banner */}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <p className="font-bold mb-0.5">How the whitelist works</p>
                  <p>When one or more senders are added, <strong>only emails from those senders</strong> are scanned and auto-saved. All other emails are ignored. Leave empty to scan all.</p>
                  <p className="mt-1">Use <code className="bg-blue-100 px-1 rounded">@domain.com</code> to match all emails from a domain (e.g. <code className="bg-blue-100 px-1 rounded">@ipindia.gov.in</code>).</p>
                </div>
              </div>

              {/* Suggested senders */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Quick Add — Common Legal Senders</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_SENDERS.map(s => {
                    const already = senders.some(existing => existing.email_address === s.email_address);
                    return (
                      <button key={s.email_address}
                        onClick={() => !already && handleAdd(s.email_address, s.label)}
                        disabled={already || adding}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${
                          already
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default"
                            : "border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50 active:scale-95"
                        }`}>
                        {already ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom sender input */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Add Custom Sender</p>
                <div className="flex gap-2">
                  <input
                    type="text" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAdd()}
                    placeholder="sender@domain.com or @domain.com"
                    className="flex-1 h-9 px-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                  <input
                    type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    placeholder="Label (optional)"
                    className="w-36 h-9 px-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                  <Button onClick={() => handleAdd()} disabled={!newEmail.trim() || adding}
                    className="h-9 rounded-xl text-sm font-semibold text-white px-4"
                    style={{ background: C.deepBlue }}>
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Current whitelist */}
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
              ) : senders.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-slate-400">No senders added — all emails are scanned</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Whitelist ({senders.length})</p>
                  {senders.map(s => (
                    <motion.div key={s.email_address} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-100 bg-emerald-50">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800">{s.label || s.email_address}</p>
                        {s.label && s.label !== s.email_address && (
                          <p className="text-[10px] text-slate-400 font-mono">{s.email_address}</p>
                        )}
                      </div>
                      <button onClick={() => handleRemove(s.email_address)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))}
                  <button onClick={async () => {
                    if (!window.confirm("Clear entire whitelist? Emails from ALL senders will be scanned again.")) return;
                    try {
                      await api.put("/email/sender-whitelist", { senders: [] });
                      setSenders([]);
                      toast.success("Whitelist cleared — all senders will now be scanned");
                    } catch { toast.error("Failed to clear whitelist"); }
                  }} className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 mt-1 active:scale-95 transition-all">
                    <Trash2 className="w-3 h-3" /> Clear entire whitelist
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Auto-Save Dialog ────────────────────────────────────────────────────────
function AutoSaveDialog({ onSave, onSkip }) {
  const [autoReminders, setAutoReminders] = useState(true);
  const [autoVisits,    setAutoVisits]    = useState(true);
  const [autoTodos,     setAutoTodos]     = useState(true);
  const [scanHour,      setScanHour]      = useState(12);
  const [saving,        setSaving]        = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/email/auto-save-prefs", {
        auto_save_reminders: autoReminders,
        auto_save_visits:    autoVisits,
        auto_save_todos:     autoTodos,
        scan_time_hour:      scanHour,
        scan_time_minute:    0,
      });
      toast.success("✓ Auto-save preferences saved! Daily scan scheduled.");
      onSave({ auto_save_reminders: autoReminders, auto_save_visits: autoVisits, auto_save_todos: autoTodos, scan_time_hour: scanHour });
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-blue-50 to-purple-50 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Smart Auto-Save</h2>
              <p className="text-xs text-slate-500">Set it once — never miss a hearing or deadline</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mt-3">
            Taskosphere will <strong>automatically</strong> scan your inbox every day and save
            events to the right place based on smart rules.
          </p>
        </div>
        <div className="p-6 space-y-3">
          {[
            { label: "Save Notices as Todos", desc: "Examination reports, objection letters → Todo", icon: CheckSquare, iconCls: "text-purple-600", bgCls: "bg-purple-50 border-purple-100", togCls: "text-purple-600", val: autoTodos, set: setAutoTodos },
            { label: "Save Hearings as Reminders", desc: "Trademark hearings, GST dates, deadlines → Reminder", icon: Bell, iconCls: "text-blue-600", bgCls: "bg-blue-50 border-blue-100", togCls: "text-blue-600", val: autoReminders, set: setAutoReminders },
            { label: "Save Meetings as Visits", desc: "Zoom, Google Meet, client visits → Visit", icon: Calendar, iconCls: "text-emerald-600", bgCls: "bg-emerald-50 border-emerald-100", togCls: "text-emerald-600", val: autoVisits, set: setAutoVisits },
          ].map(item => (
            <div key={item.label} className={`flex items-center justify-between p-4 rounded-2xl border ${item.bgCls}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.bgCls.split(" ")[0]}`}>
                  <item.icon className={`w-4 h-4 ${item.iconCls}`} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
              <button onClick={() => item.set(s => !s)} className="transition-transform active:scale-95">
                {item.val
                  ? <ToggleRight className={`w-8 h-8 ${item.togCls}`} />
                  : <ToggleLeft className="w-8 h-8 text-slate-300" />}
              </button>
            </div>
          ))}

          <div className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50">
            <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">Daily Scan Time (IST)</p>
              <p className="text-xs text-slate-500">Inbox scanned automatically every day</p>
            </div>
            <select value={scanHour} onChange={e => setScanHour(Number(e.target.value))}
              className="px-3 py-1.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
              {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(h => (
                <option key={h} value={h}>
                  {h === 12 ? "12:00 PM (Noon)" : h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onSkip} className="flex-1 rounded-xl h-11 text-sm font-semibold text-slate-500">Not now</Button>
            <Button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-xl h-11 text-sm font-bold text-white"
              style={{ background: saving ? "#9CA3AF" : `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : <><Sparkles className="w-4 h-4 mr-2" />Enable Auto-Save</>}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Auto-Save Status Badge ──────────────────────────────────────────────────
function AutoSaveStatusBadge({ prefs, onEdit }) {
  if (!prefs) return null;
  const isActive = prefs.auto_save_reminders || prefs.auto_save_visits || prefs.auto_save_todos;
  const activeParts = [];
  if (prefs.auto_save_todos)     activeParts.push("Todos");
  if (prefs.auto_save_reminders) activeParts.push("Reminders");
  if (prefs.auto_save_visits)    activeParts.push("Visits");

  return (
    <button onClick={onEdit}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:opacity-80 ${
        isActive ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500"
      }`}>
      <Zap className="w-3 h-3" />
      {isActive ? `Auto-Save ON · ${activeParts.join(", ")}` : "Auto-Save OFF"}
      <Settings2 className="w-3 h-3 ml-0.5 opacity-60" />
    </button>
  );
}

// ─── Connect Form ─────────────────────────────────────────────────────────────
function ConnectForm({ provider, onSuccess, onCancel }) {
  const [emailVal,  setEmailVal]  = useState(provider.domain ? `@${provider.domain}` : "");
  const [password,  setPassword]  = useState("");
  const [host,      setHost]      = useState(provider.imap_host);
  const [port,      setPort]      = useState(provider.imap_port);
  const [label,     setLabel]     = useState("");
  const [showPass,  setShowPass]  = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [authError, setAuthError] = useState(false);

  const emailRef = useRef(null);
  useEffect(() => {
    if (emailRef.current) {
      const t = setTimeout(() => emailRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, []);

  const handleConnect = async () => {
    const trimEmail = emailVal.trim();
    if (!trimEmail || !trimEmail.includes("@")) { toast.error("Enter a valid email address"); return; }
    if (!password) { toast.error("App Password is required"); return; }
    setAuthError(false);
    setLoading(true);
    try {
      await api.post("/email/connections", {
        email_address: trimEmail,
        app_password:  password,
        imap_host:     host   || undefined,
        imap_port:     Number(port),
        label:         label  || undefined,
      });
      toast.success(`✓ ${trimEmail} connected successfully!`);
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Connection failed. Check your credentials.";
      const isAuthFail = msg.toLowerCase().includes("authentication") ||
                         msg.toLowerCase().includes("login failed") ||
                         msg.toLowerCase().includes("invalid credentials");
      if (isAuthFail && provider.id === "gmail") {
        setAuthError(true);
        setShowSteps(true);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="border rounded-2xl overflow-hidden" style={{ borderColor: provider.color + "30" }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: provider.color + "12" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white"
          style={{ backgroundColor: provider.color }}>
          {provider.icon}
        </div>
        <div>
          <p className="font-bold text-slate-800">Connect {provider.label}</p>
          <p className="text-xs text-slate-500">IMAP · App Password · No OAuth needed</p>
        </div>
        {provider.app_password_url && (
          <a href={provider.app_password_url} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border hover:opacity-80 transition-colors"
            style={{ color: provider.color, borderColor: provider.color + "40", backgroundColor: provider.color + "10" }}>
            <ExternalLink className="w-3 h-3" />Get App Password
          </a>
        )}
      </div>

      <div className="p-5 space-y-4">
        <AnimatePresence>
          {authError && provider.id === "gmail" && (
            <GmailChecklistBanner onDismiss={() => setAuthError(false)} />
          )}
        </AnimatePresence>

        {provider.steps.length > 0 && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <button onClick={() => setShowSteps(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
              <span className="flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" />How to get your App Password</span>
              {showSteps ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <AnimatePresence>
              {showSteps && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="px-4 py-3 space-y-2.5 bg-white">
                    {provider.steps.map(step => (
                      <div key={step.num} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: provider.color }}>{step.num}</span>
                        <p className="text-sm text-slate-600">
                          {step.text}
                          {step.link && (
                            <> <a href={step.link} target="_blank" rel="noopener noreferrer"
                              className="font-semibold underline" style={{ color: provider.color }}>{step.linkText}</a></>
                          )}
                        </p>
                      </div>
                    ))}
                    {provider.note && (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 font-medium">
                        {provider.note}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Email Address</label>
            <input ref={emailRef} type="text" inputMode="email" autoComplete="email"
              value={emailVal} onChange={e => setEmailVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder={`you@${provider.domain || "example.com"}`}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all" />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              App Password <span className="font-normal text-slate-400 normal-case">(NOT your Gmail login password)</span>
            </label>
            <div className="relative">
              <input type={showPass ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConnect()}
                placeholder={provider.placeholder || "app password"}
                className="w-full px-4 py-2.5 pr-11 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 font-mono transition-all" />
              <button onClick={() => setShowPass(s => !s)} type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Friendly Name <span className="font-normal text-slate-400 normal-case">(optional)</span>
            </label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Trademark Gmail, Personal Yahoo"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all" />
          </div>

          {provider.id === "other" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">IMAP Host</label>
                <input type="text" value={host} onChange={e => setHost(e.target.value)} placeholder="imap.yourdomain.com"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Port</label>
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2" />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl h-10 text-sm font-semibold">Cancel</Button>
          <Button onClick={handleConnect} disabled={loading}
            className="flex-1 rounded-xl h-10 text-sm font-bold text-white px-6"
            style={{ background: loading ? "#9CA3AF" : `linear-gradient(135deg, ${provider.color}, ${provider.color}CC)` }}>
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Testing & Connecting…</>
              : <><Wifi className="w-4 h-4 mr-2" />Connect Account</>}
          </Button>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
          <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700">
            Password is stored securely. We only read email subjects &amp; bodies for event extraction — we never send or modify anything.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Connected Account Card ───────────────────────────────────────────────────
function ConnectedAccountCard({ conn, onDisconnect, onTest, onToggle, onSync }) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal,     setLabelVal]     = useState(conn.label || conn.email_address);
  const [testing,      setTesting]      = useState(false);
  const [syncing,      setSyncing]      = useState(false);

  const color = PROVIDER_COLORS[conn.provider] || PROVIDER_COLORS.other;
  const icon  = PROVIDER_ICONS[conn.provider]  || PROVIDER_ICONS.other;

  const handleSaveLabel = async () => {
    try {
      await api.patch(`/email/connections/${encodeURIComponent(conn.email_address)}`, { label: labelVal });
      toast.success("Label updated");
      setEditingLabel(false);
    } catch { toast.error("Failed to update label"); }
  };

  const handleTest = async () => {
    setTesting(true);
    try { await onTest(conn.email_address); } finally { setTesting(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(conn.email_address); } finally { setSyncing(false); }
  };

  const hasError = !!conn.sync_error;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
      className="border rounded-2xl overflow-hidden transition-all"
      style={{ borderColor: hasError ? "#FECACA" : conn.is_active ? color + "30" : "#E5E7EB" }}>
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ backgroundColor: hasError ? "#FEF2F2" : conn.is_active ? color + "08" : "#F9FAFB" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ backgroundColor: conn.is_active ? color : "#9CA3AF" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={labelVal} onChange={e => setLabelVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                className="flex-1 px-2 py-1 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button onClick={handleSaveLabel} className="p-1 text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingLabel(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800 text-sm truncate">{conn.label || conn.email_address}</p>
              <button onClick={() => setEditingLabel(true)} className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400 truncate">{conn.email_address}</p>
        </div>
        <div className="flex-shrink-0">
          {hasError ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
              <AlertCircle className="w-3 h-3" /> Error
            </span>
          ) : conn.is_active ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Paused
            </span>
          )}
        </div>
      </div>

      {hasError && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs text-red-700 font-medium">{conn.sync_error}</p>
        </div>
      )}

      <div className="mx-5 my-3 flex items-center gap-2 flex-wrap">
        {[
          { color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", icon: CheckSquare, label: "Todos" },
          { color: "#0D3B66", bg: "#EFF6FF", border: "#BFDBFE", icon: Bell,        label: "Reminders" },
          { color: "#059669", bg: "#F0FDF4", border: "#BBF7D0", icon: Calendar,    label: "Visits" },
        ].map(item => (
          <div key={item.label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
            style={{ backgroundColor: item.bg, borderColor: item.border, color: item.color }}>
            <item.icon className="w-3 h-3" /> {item.label}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
        <div className="text-xs text-slate-400">
          {conn.last_synced
            ? `Synced ${format(parseISO(conn.last_synced), "MMM d, h:mm a")}`
            : `Connected ${conn.connected_at ? format(parseISO(conn.connected_at), "MMM d, yyyy") : ""}`}
          <span className="mx-1">·</span>
          <span className="font-medium">{conn.imap_host}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleSync} disabled={syncing} title="Sync now"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
          </button>
          <button onClick={handleTest} disabled={testing} title="Test connection"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />} Test
          </button>
          <button onClick={() => onToggle(conn.email_address, !conn.is_active)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
            {conn.is_active ? "Pause" : "Resume"}
          </button>
          <button onClick={() => onDisconnect(conn.email_address)} title="Disconnect"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Event Row — with category badge and correct save logic ─────────────────
function EventRow({ event, defaultType }) {
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState(null);
  const [saveType,  setSaveType]  = useState(
    defaultType || event.save_category || "reminder"
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (saveType === "todo") {
        const dateStr = event.date || new Date().toISOString().slice(0, 10);
        await api.post("/email/save-as-todo", {
          event_id:    event.id || "",
          title:       event.title,
          description: [
            event.organizer   && `From: ${event.organizer}`,
            event.description && `Notes: ${event.description}`,
            event.source_from && `Sender: ${event.source_from}`,
          ].filter(Boolean).join("\n") || null,
          remind_at:   `${dateStr}T10:00:00`,
        });
        toast.success(`✓ Todo: ${event.title}`);

      } else if (saveType === "reminder") {
        const dateStr = event.date || new Date().toISOString().slice(0, 10);
        const timeStr = event.time || "10:00";
        let remindAt;
        try { remindAt = new Date(`${dateStr}T${timeStr}:00+05:30`).toISOString(); }
        catch { remindAt = new Date(Date.now() + 86400000).toISOString(); }

        const descParts = [];
        if (event.organizer)      descParts.push(`From: ${event.organizer}`);
        if (event.description)    descParts.push(`Notes: ${event.description}`);
        if (event.source_subject) descParts.push(`Subject: ${event.source_subject}`);

        await api.post("/email/save-as-reminder", {
          event_id:    event.id || "",
          title:       event.title,
          description: descParts.join("\n") || null,
          remind_at:   remindAt,
        });
        toast.success(`✓ Reminder: ${event.title}`);

      } else {
        await api.post("/email/save-as-visit", {
          event_id:   event.id || "",
          title:      event.title,
          visit_date: event.date || new Date().toISOString().slice(0, 10),
          notes:      event.description || event.source_subject || "",
        });
        toast.success(`✓ Visit: ${event.title}`);
      }

      setSaved(true);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const catCfg = CATEGORY_CONFIG[saveType] || CATEGORY_CONFIG.reminder;

  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl border"
      style={{ backgroundColor: catCfg.bg, borderColor: catCfg.border }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            {/* AI-suggested category badge */}
            {event.save_category && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: CATEGORY_CONFIG[event.save_category]?.color || "#6B7280" }}>
                AI: {(CATEGORY_CONFIG[event.save_category]?.label || "").toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-800 truncate">{event.title}</p>
          <p className="text-xs font-mono mt-0.5" style={{ color: catCfg.color }}>
            {event.date ? `📅 ${event.date}${event.time ? ` · ${event.time}` : ""}` : "Date not found"}
            {event.email_account && <span className="ml-2 text-slate-400">· {event.email_account}</span>}
          </p>
          {event.description && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{event.description}</p>
          )}
        </div>

        {/* Save type selector */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <select
            value={saveType}
            onChange={e => setSaveType(e.target.value)}
            disabled={saved}
            className="text-[11px] font-bold rounded-lg border px-2 py-1 focus:outline-none cursor-pointer"
            style={{ borderColor: catCfg.border, color: catCfg.color, backgroundColor: catCfg.bg }}>
            <option value="todo">→ Todo</option>
            <option value="reminder">→ Reminder</option>
            <option value="visit">→ Visit</option>
          </select>
          <button
            onClick={handleSave} disabled={saving || saved}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ background: saved ? "#1FAF5A" : catCfg.color }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saved ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved</>
              : <><Check className="w-3.5 h-3.5" />Save</>}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1 border border-red-100">{error}</p>
      )}
    </div>
  );
}

// ─── MAIN EmailSettings Component ─────────────────────────────────────────────
export default function EmailSettings() {
  const [connections,     setConnections]     = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [activeForm,      setActiveForm]      = useState(null);
  const [showAddOptions,  setShowAddOptions]  = useState(false);
  const [extractedEvents, setExtractedEvents] = useState([]);
  const [scanning,        setScanning]        = useState(false);
  const [clearing,        setClearing]        = useState(false);
  const [autoSavePrefs,   setAutoSavePrefs]   = useState(null);
  const [showAutoDialog,  setShowAutoDialog]  = useState(false);
  const [prefsChecked,    setPrefsChecked]    = useState(false);
  const [activeTab,       setActiveTab]       = useState("connected"); // "connected" | "whitelist" | "rules"

  const loadConnections = useCallback(async () => {
    try {
      const res = await api.get("/email/connections");
      setConnections(res.data?.connections || []);
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAutoSavePrefs = useCallback(async () => {
    try {
      const [prefsRes, existsRes] = await Promise.all([
        api.get("/email/auto-save-prefs"),
        api.get("/email/auto-save-prefs/exists"),
      ]);
      setAutoSavePrefs(prefsRes.data);
      setPrefsChecked(true);
      return existsRes.data.has_set_prefs;
    } catch {
      setPrefsChecked(true);
      return true;
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  useEffect(() => {
    loadAutoSavePrefs().then(alreadySet => {
      if (!alreadySet) setTimeout(() => setShowAutoDialog(true), 1200);
    });
  }, [loadAutoSavePrefs]);

  const handleDisconnect = async (emailAddress) => {
    if (!window.confirm(`Disconnect ${emailAddress}? Events already imported will remain.`)) return;
    try {
      await api.delete(`/email/connections/${encodeURIComponent(emailAddress)}`);
      setConnections(prev => prev.filter(c => c.email_address !== emailAddress));
      toast.success(`${emailAddress} disconnected`);
    } catch { toast.error("Failed to disconnect"); }
  };

  const handleTest = async (emailAddress) => {
    try {
      await api.post(`/email/connections/${encodeURIComponent(emailAddress)}/test`);
      toast.success(`✓ ${emailAddress} is working`);
      loadConnections();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Connection test failed");
      loadConnections();
    }
  };

  const handleToggle = async (emailAddress, isActive) => {
    try {
      await api.patch(`/email/connections/${encodeURIComponent(emailAddress)}`, { is_active: isActive });
      setConnections(prev =>
        prev.map(c => c.email_address === emailAddress ? { ...c, is_active: isActive } : c)
      );
      toast.success(isActive ? "Account resumed" : "Account paused");
    } catch { toast.error("Failed to update"); }
  };

  const handleSync = async (emailAddress) => {
    try {
      const res = await api.get(`/email/extract-events?force_refresh=true&limit=50`, { timeout: 60000 });
      const events = (res.data || []).filter(e => e.email_account === emailAddress);
      toast.success(`✓ Synced — ${events.length} legal event(s) found`);
      loadConnections();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sync failed");
    }
  };

  const handleScanAll = async () => {
    if (connections.length === 0) { toast.error("No email accounts connected"); return; }
    setScanning(true);
    try {
      const res = await api.get("/email/extract-events?force_refresh=true&limit=100", { timeout: 90000 });
      const events = res.data || [];
      setExtractedEvents(events);
      toast.success(events.length === 0
        ? "All emails scanned — no legal events found (junk filtered)"
        : `✓ Found ${events.length} legal event(s) across ${connections.length} account(s)`
      );
    } catch (err) {
      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        toast.error("Scan taking too long. Try syncing accounts individually.");
      } else {
        toast.error(err?.response?.data?.detail || "Scan failed");
      }
    } finally {
      setScanning(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Clear all extracted events cache? Forces a completely fresh scan.\nNote: Already-saved reminders, todos, and visits will NOT be deleted.")) return;
    setClearing(true);
    try {
      await api.delete("/email/events/clear-all");
      setExtractedEvents([]);
      toast.success("Cache cleared. Run a fresh scan anytime.");
    } catch { toast.error("Failed to clear cache"); }
    finally { setClearing(false); }
  };

  const handleConnectSuccess = () => {
    setActiveForm(null);
    setShowAddOptions(false);
    loadConnections();
    if (prefsChecked && !autoSavePrefs?.auto_save_reminders && !autoSavePrefs?.auto_save_visits && !autoSavePrefs?.auto_save_todos) {
      setTimeout(() => setShowAutoDialog(true), 600);
    }
  };

  const handleAutoSaveSaved = (prefs) => {
    setAutoSavePrefs(prev => ({ ...prev, ...prefs }));
    setShowAutoDialog(false);
  };

  const activeProvider = QUICK_PROVIDERS.find(p => p.id === activeForm);

  // Group events by category for display
  const todoEvents     = extractedEvents.filter(e => e.save_category === "todo");
  const reminderEvents = extractedEvents.filter(e => e.save_category === "reminder" || (!e.save_category && ["Trademark Hearing","Court Hearing","Deadline","Appointment","Other"].includes(e.event_type)));
  const visitEvents    = extractedEvents.filter(e => e.save_category === "visit" || (!e.save_category && ["Visit","Online Meeting","Conference","Interview","Meeting"].includes(e.event_type)));

  const TAB_CONFIG = [
    { id: "connected",  label: "Accounts",    icon: Mail    },
    { id: "whitelist",  label: "Whitelist",   icon: Filter  },
    { id: "rules",      label: "Smart Rules", icon: Tag     },
  ];

  return (
    <>
      <AnimatePresence>
        {showAutoDialog && (
          <AutoSaveDialog
            onSave={handleAutoSaveSaved}
            onSkip={() => {
              setShowAutoDialog(false);
              api.post("/email/auto-save-prefs", {
                auto_save_reminders: false, auto_save_visits: false,
                auto_save_todos: false, scan_time_hour: 12, scan_time_minute: 0,
              }).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Email Integration</h1>
            <p className="text-sm text-slate-500 mt-1">
              Connect email accounts · set sender filters · auto-save to the right place
            </p>
          </div>
          <AutoSaveStatusBadge prefs={autoSavePrefs} onEdit={() => setShowAutoDialog(true)} />
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
          {TAB_CONFIG.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* How it works banner — only on accounts tab */}
        {activeTab === "connected" && (
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Info className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-1">Multiple accounts supported</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Connect as many Gmail, Outlook, or Yahoo accounts as needed. All inboxes are scanned together.
                {" "}Smart rules auto-classify: <strong>notices → Todos</strong>, <strong>hearings → Reminders</strong>, <strong>meetings → Visits</strong>.
                {autoSavePrefs?.auto_save_reminders || autoSavePrefs?.auto_save_visits || autoSavePrefs?.auto_save_todos
                  ? <> Auto-save is <strong>ON</strong>.</>
                  : <> <a href="#" onClick={e => { e.preventDefault(); setShowAutoDialog(true); }}
                      className="font-semibold underline">Enable Auto-Save</a> to skip manual clicks.</>}
              </p>
            </div>
          </div>
        )}

        {/* ── ACCOUNTS TAB ── */}
        {activeTab === "connected" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-700">
                Connected Accounts
                {connections.length > 0 && <span className="ml-2 text-sm font-normal text-slate-400">({connections.length})</span>}
              </h2>
              <div className="flex items-center gap-2">
                {connections.length > 0 && (
                  <>
                    <Button onClick={handleClearAll} disabled={clearing} size="sm" variant="ghost"
                      className="rounded-xl h-8 text-xs font-semibold text-slate-400 hover:text-red-500">
                      {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Eraser className="w-3.5 h-3.5 mr-1" />}
                      Reset Cache
                    </Button>
                    <Button onClick={handleScanAll} disabled={scanning} size="sm" variant="outline"
                      className="rounded-xl h-8 text-xs font-semibold border-purple-200 text-purple-700 hover:bg-purple-50">
                      {scanning
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Scanning…</>
                        : <><RefreshCw className="w-3.5 h-3.5 mr-1" />Scan All</>}
                    </Button>
                    <button
                      onClick={() => { setShowAddOptions(s => !s); setActiveForm(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all"
                      style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
                      <Plus className="w-4 h-4" /> Add Another
                    </button>
                  </>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : connections.length === 0 && !showAddOptions && !activeForm ? (
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                  <Mail className="w-8 h-8 text-slate-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700">No email accounts connected yet</p>
                  <p className="text-sm text-slate-400 mt-1">Connect Gmail, Outlook, Yahoo or any IMAP email</p>
                </div>
                <button onClick={() => setShowAddOptions(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-all"
                  style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
                  <Plus className="w-4 h-4" /> Connect Your First Account
                </button>
              </div>
            ) : (
              <AnimatePresence>
                {connections.map(conn => (
                  <ConnectedAccountCard key={conn.email_address} conn={conn}
                    onDisconnect={handleDisconnect} onTest={handleTest} onToggle={handleToggle} onSync={handleSync} />
                ))}
              </AnimatePresence>
            )}

            {/* Extracted Events — grouped by category */}
            <AnimatePresence>
              {extractedEvents.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-700">
                      Extracted Legal Events
                      <span className="ml-2 text-sm font-normal text-slate-400">({extractedEvents.length} total)</span>
                    </h2>
                    <button onClick={() => setExtractedEvents([])} className="text-xs text-slate-400 hover:text-slate-600 font-semibold">Clear</button>
                  </div>

                  {todoEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#8B5CF6" }}>
                        <CheckSquare className="w-3.5 h-3.5" /> Save as Todos — Action Required ({todoEvents.length})
                      </p>
                      {todoEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="todo" />)}
                    </div>
                  )}

                  {reminderEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#0D3B66" }}>
                        <Bell className="w-3.5 h-3.5" /> Save as Reminders — Hearings & Deadlines ({reminderEvents.length})
                      </p>
                      {reminderEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="reminder" />)}
                    </div>
                  )}

                  {visitEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#059669" }}>
                        <Calendar className="w-3.5 h-3.5" /> Save as Visits — Meetings & Consultations ({visitEvents.length})
                      </p>
                      {visitEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="visit" />)}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Provider Picker */}
            <AnimatePresence>
              {(showAddOptions || connections.length === 0) && !activeForm && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                  <h2 className="text-base font-bold text-slate-700">
                    {connections.length === 0 ? "Choose your email provider" : "Add another account"}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {QUICK_PROVIDERS.map(prov => (
                      <button key={prov.id}
                        onClick={() => { setActiveForm(prov.id); setShowAddOptions(false); }}
                        className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-transparent hover:border-current transition-all active:scale-95"
                        style={{ backgroundColor: prov.color + "08" }}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white"
                          style={{ backgroundColor: prov.color }}>{prov.icon}</div>
                        <span className="text-sm font-semibold text-slate-700 text-center leading-tight">{prov.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connect Form */}
            <AnimatePresence>
              {activeForm && activeProvider && (
                <ConnectForm key={activeForm} provider={activeProvider} onSuccess={handleConnectSuccess}
                  onCancel={() => { setActiveForm(null); if (connections.length === 0) setShowAddOptions(true); }} />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── WHITELIST TAB ── */}
        {activeTab === "whitelist" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-bold mb-0.5">What is the Sender Whitelist?</p>
                <p>By default, all emails from all senders are scanned. Once you add any sender here, <strong>ONLY emails from those approved senders</strong> will be scanned and processed. This prevents irrelevant emails from cluttering your todos, reminders, and visits.</p>
                <p className="mt-1.5 font-semibold">Recommended for CA/CS firms: add IP India, GST Portal, Income Tax, MCA, and your client domains.</p>
              </div>
            </div>
            <SenderWhitelistManager />
          </div>
        )}

        {/* ── SMART RULES TAB ── */}
        {activeTab === "rules" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-sm font-bold text-slate-700 mb-1">How Smart Categorization Works</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                When an email is scanned, Taskosphere uses AI + keyword rules to decide where to save it.
                You can always override the suggested category before clicking Save.
              </p>
            </div>
            <CategoryRulesPanel />

            {/* Auto-save prefs summary */}
            {autoSavePrefs && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">Current Auto-Save Settings</p>
                  <button onClick={() => setShowAutoDialog(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 active:scale-95 transition-all">
                    <Settings2 className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { label: "Notices → Todo",         active: autoSavePrefs.auto_save_todos,     color: "#8B5CF6" },
                    { label: "Hearings → Reminder",    active: autoSavePrefs.auto_save_reminders, color: "#0D3B66" },
                    { label: "Meetings → Visit",       active: autoSavePrefs.auto_save_visits,    color: "#059669" },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        item.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {item.active ? "ON" : "OFF"}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-700">Daily scan time</span>
                    <span className="text-xs font-bold text-slate-600">
                      {autoSavePrefs.scan_time_hour < 12
                        ? `${autoSavePrefs.scan_time_hour}:00 AM`
                        : autoSavePrefs.scan_time_hour === 12
                          ? "12:00 PM"
                          : `${autoSavePrefs.scan_time_hour - 12}:00 PM`} IST
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tips — always visible at bottom */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tips</p>
          <ul className="space-y-1.5">
            {[
              "Add @ipindia.gov.in to whitelist to auto-import all trademark hearings and notices",
              "Gmail requires: (1) IMAP enabled, (2) 2-Step Verification ON, (3) App Password generated",
              "Examination Reports are saved as Todos (action required), Hearings as Reminders",
              "Zoom/Google Meet invites are saved as Visits — check your calendar email sender",
              "Use 'Reset Cache' if you see wrong results, then Scan All for a fresh extraction",
              "FIX: Deleting one reminder/visit from email will NOT delete other auto-saved items",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
