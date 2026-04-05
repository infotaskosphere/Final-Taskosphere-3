// ═══════════════════════════════════════════════════════════════════════════════
// EmailSettings.jsx  v5  — Dashboard-aligned design (full feature restore)
// All v4 features retained + redesigned to match Dashboard/Attendance UI
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import { useDark } from "@/hooks/useDark";
import {
  Mail, Plus, Trash2, CheckCircle2, AlertCircle,
  Loader2, Eye, EyeOff, ExternalLink, ChevronDown, ChevronUp,
  Wifi, WifiOff, Edit2, Check, X, Info, Shield,
  RefreshCw, Calendar, Bell, Eraser, Clock, Sparkles,
  Settings2, ToggleLeft, ToggleRight, Zap, AlertTriangle,
  CheckSquare, Filter, Tag, BookOpen, Activity, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { format, parseISO } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS  (mirrors Dashboard / Attendance exactly)
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     "#0D3B66",
  mediumBlue:   "#1F6FB2",
  emeraldGreen: "#1FAF5A",
  lightGreen:   "#5CCB5F",
  amber:        "#F59E0B",
  orange:       "#F97316",
  red:          "#EF4444",
  purple:       "#8B5CF6",
};

const D = {
  bg:      "#0f172a",
  card:    "#1e293b",
  raised:  "#263348",
  border:  "#334155",
  text:    "#f1f5f9",
  muted:   "#94a3b8",
  dimmer:  "#64748b",
};

// ─── ANIMATIONS (identical to Dashboard) ─────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
};
const springPhysics = { lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 } };

// ─── PROVIDER / CATEGORY CONSTANTS ───────────────────────────────────────────
const PROVIDER_COLORS = {
  gmail: "#EA4335", outlook: "#0078D4", yahoo: "#720E9E", icloud: "#3B82F6", other: "#374151",
};
const PROVIDER_ICONS = {
  gmail: "G", outlook: "M", yahoo: "Y", icloud: "iC", other: "@",
};
const CATEGORY_CONFIG = {
  todo: {
    label: "Todo", color: COLORS.purple,
    bg: "#F5F3FF", border: "#DDD6FE", darkBg: "rgba(139,92,246,0.12)",
  },
  reminder: {
    label: "Reminder", color: COLORS.deepBlue,
    bg: "#EFF6FF", border: "#BFDBFE", darkBg: "rgba(13,59,102,0.18)",
  },
  visit: {
    label: "Visit", color: COLORS.emeraldGreen,
    bg: "#F0FDF4", border: "#BBF7D0", darkBg: "rgba(31,175,90,0.12)",
  },
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

const SUGGESTED_SENDERS = [
  { email_address: "@ipindia.gov.in",            label: "IP India (all)" },
  { email_address: "noreply@ipindia.gov.in",     label: "IP India No-Reply" },
  { email_address: "@mca.gov.in",                label: "MCA Portal (all)" },
  { email_address: "@gst.gov.in",                label: "GST Portal (all)" },
  { email_address: "@incometax.gov.in",          label: "Income Tax (all)" },
  { email_address: "@taxinformationnetwork.com", label: "TIN / TDS" },
  { email_address: "@zoom.us",                   label: "Zoom Meetings" },
  { email_address: "@calendar.google.com",       label: "Google Calendar" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LAYOUT PRIMITIVES  (matches Dashboard exactly)
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ children, className = "", style = {} }) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white leading-none">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-1.5 flex-shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD  (matches Dashboard metric cards)
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, unit, color, trend }) {
  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springPhysics.lift }} whileTap={{ scale: 0.985 }}>
      <div className="rounded-2xl shadow-sm border h-full bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:shadow-md transition-all">
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
              <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-0.5">{unit}</p>
            </div>
            <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          </div>
          {trend && (
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate border-t border-slate-100 dark:border-slate-700 pt-2 mt-1">
              {trend}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-SAVE STATUS BADGE  (restored from v4)
// ─────────────────────────────────────────────────────────────────────────────
function AutoSaveStatusBadge({ prefs, onEdit, isDark }) {
  if (!prefs) return null;
  const isActive = prefs.auto_save_reminders || prefs.auto_save_visits || prefs.auto_save_todos;
  const activeParts = [];
  if (prefs.auto_save_todos)     activeParts.push("Todos");
  if (prefs.auto_save_reminders) activeParts.push("Reminders");
  if (prefs.auto_save_visits)    activeParts.push("Visits");

  return (
    <button
      onClick={onEdit}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:opacity-80 active:scale-95"
      style={isActive
        ? { backgroundColor: isDark ? "rgba(31,175,90,0.15)" : "#dcfce7", borderColor: isDark ? "#14532d" : "#bbf7d0", color: COLORS.emeraldGreen }
        : { backgroundColor: isDark ? D.raised : "#f8fafc", borderColor: isDark ? D.border : "#e2e8f0", color: isDark ? D.muted : "#64748b" }
      }
    >
      <Zap className="w-3 h-3" />
      {isActive ? `Auto-Save ON · ${activeParts.join(", ")}` : "Auto-Save OFF"}
      <Settings2 className="w-3 h-3 ml-0.5 opacity-60" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GMAIL AUTH-FAIL BANNER  (restored from v4)
// ─────────────────────────────────────────────────────────────────────────────
function GmailChecklistBanner({ onDismiss, isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl overflow-hidden border"
      style={{ borderColor: isDark ? "#7f1d1d" : "#fecaca", backgroundColor: isDark ? "rgba(239,68,68,0.08)" : "#fef2f2" }}
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: isDark ? "#7f1d1d" : "#fecaca", backgroundColor: isDark ? "rgba(239,68,68,0.12)" : "#fee2e2" }}>
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <p className="text-sm font-bold text-red-500 flex-1">Authentication Failed — Complete these 3 steps for Gmail</p>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
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
              <p className="text-sm font-bold text-red-500">{step.title}</p>
              <p className="text-xs mt-0.5" style={{ color: isDark ? "#fca5a5" : "#dc2626" }}>{step.detail}</p>
              <a href={step.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-red-500 underline hover:text-red-400">
                {step.linkText}<ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
        <div className="mt-2 p-2.5 rounded-xl text-xs font-medium"
          style={{ backgroundColor: isDark ? D.raised : "#ffffff", border: `1px solid ${isDark ? "#7f1d1d" : "#fecaca"}`, color: isDark ? "#fca5a5" : "#dc2626" }}>
          After completing all 3 steps, generate a <strong>brand new</strong> App Password and try again.
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY RULES PANEL  (restored from v4 — collapsible accordion)
// ─────────────────────────────────────────────────────────────────────────────
function CategoryRulesPanel({ isDark }) {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors"
        style={{ backgroundColor: open ? (isDark ? D.raised : "#f8fafc") : "transparent" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/40">
            <BookOpen className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Smart Categorization Rules</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">How emails are automatically classified</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        }
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-700">
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
                  <div
                    key={cat}
                    className="rounded-xl border p-3.5"
                    style={{ borderColor: isDark ? `${cfg.color}30` : cfg.border, backgroundColor: isDark ? cfg.darkBg : cfg.bg }}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xs font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cfg.color }}>
                        {cfg.label.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold" style={{ color: cfg.color }}>{label}</span>
                      <span className="text-[10px] ml-auto" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>{desc}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {examples.map(ex => (
                        <span
                          key={ex}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-md border"
                          style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", borderColor: isDark ? `${cfg.color}35` : cfg.border, color: cfg.color }}
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] pt-1" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>
                ℹ️ AI uses these rules + context to classify. You can always override the category before clicking Save.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-SAVE DIALOG  (restored from v4, redesigned)
// ─────────────────────────────────────────────────────────────────────────────
function AutoSaveDialog({ onSave, onSkip, isDark }) {
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
      toast.success("✓ Auto-save enabled! Daily scan scheduled.");
      onSave({ auto_save_reminders: autoReminders, auto_save_visits: autoVisits, auto_save_todos: autoTodos, scan_time_hour: scanHour });
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: isDark ? D.card : "#ffffff", border: isDark ? `1px solid ${D.border}` : "1px solid #e2e8f0" }}
      >
        {/* Header */}
        <div className="px-6 py-5 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Smart Auto-Save</h2>
              <p className="text-blue-200 text-xs mt-0.5">Set it once — never miss a hearing or deadline</p>
            </div>
          </div>
          <p className="text-sm text-blue-100 leading-relaxed mt-3 opacity-90">
            Taskosphere will <strong>automatically</strong> scan your inbox every day and save events to the right place.
          </p>
        </div>

        <div className="p-6 space-y-3">
          {[
            { label: "Save Notices as Todos",      desc: "Examination reports, objections → Todo",   icon: CheckSquare, color: COLORS.purple,       val: autoTodos,     set: setAutoTodos },
            { label: "Save Hearings as Reminders", desc: "Trademark hearings, GST dates → Reminder", icon: Bell,        color: COLORS.deepBlue,     val: autoReminders, set: setAutoReminders },
            { label: "Save Meetings as Visits",    desc: "Zoom, Google Meet, client visits → Visit", icon: Calendar,    color: COLORS.emeraldGreen, val: autoVisits,    set: setAutoVisits },
          ].map(item => (
            <div
              key={item.label}
              className="flex items-center justify-between p-4 rounded-2xl border"
              style={{ backgroundColor: isDark ? `${item.color}15` : `${item.color}08`, borderColor: isDark ? `${item.color}30` : `${item.color}20` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${item.color}15` }}>
                  <item.icon className="w-4 h-4" style={{ color: item.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: isDark ? D.text : "#1e293b" }}>{item.label}</p>
                  <p className="text-xs" style={{ color: isDark ? D.muted : "#64748b" }}>{item.desc}</p>
                </div>
              </div>
              <button onClick={() => item.set(s => !s)} className="transition-transform active:scale-95">
                {item.val
                  ? <ToggleRight className="w-8 h-8" style={{ color: item.color }} />
                  : <ToggleLeft className="w-8 h-8 text-slate-300 dark:text-slate-600" />}
              </button>
            </div>
          ))}

          {/* Scan time picker */}
          <div
            className="flex items-center gap-3 p-4 rounded-2xl border"
            style={{ backgroundColor: isDark ? D.raised : "#f8fafc", borderColor: isDark ? D.border : "#e2e8f0" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: isDark ? "#ffffff10" : "#f1f5f9" }}>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: isDark ? D.text : "#1e293b" }}>Daily Scan Time (IST)</p>
              <p className="text-xs" style={{ color: isDark ? D.muted : "#64748b" }}>Inbox scanned automatically every day</p>
            </div>
            <select
              value={scanHour} onChange={e => setScanHour(Number(e.target.value))}
              className="px-3 py-1.5 text-sm font-semibold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-400"
              style={{ backgroundColor: isDark ? D.raised : "#ffffff", borderColor: isDark ? D.border : "#e2e8f0", color: isDark ? D.text : "#1e293b" }}
            >
              {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(h => (
                <option key={h} value={h}>
                  {h === 12 ? "12:00 PM (Noon)" : h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="ghost" onClick={onSkip} className="flex-1 rounded-xl h-11 text-sm font-semibold"
              style={{ color: isDark ? D.muted : undefined }}>
              Not now
            </Button>
            <Button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-xl h-11 text-sm font-bold text-white"
              style={{ background: saving ? "#9CA3AF" : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : <><Sparkles className="w-4 h-4 mr-2" />Enable Auto-Save</>}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECT FORM
// ─────────────────────────────────────────────────────────────────────────────
function ConnectForm({ provider, onSuccess, onCancel, isDark }) {
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

  useEffect(() => { setTimeout(() => emailRef.current?.focus(), 50); }, []);

  const inputStyle = {
    backgroundColor: isDark ? D.raised : "#ffffff",
    borderColor: isDark ? D.border : "#d1d5db",
    color: isDark ? D.text : "#1e293b",
  };
  const inputCls = "w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";

  const handleConnect = async () => {
    const trimEmail = emailVal.trim();
    if (!trimEmail || !trimEmail.includes("@")) { toast.error("Enter a valid email address"); return; }
    if (!password) { toast.error("App Password is required"); return; }
    setAuthError(false); setLoading(true);
    try {
      await api.post("/email/connections", {
        email_address: trimEmail, app_password: password,
        imap_host: host || undefined, imap_port: Number(port), label: label || undefined,
      });
      toast.success(`✓ ${trimEmail} connected successfully!`);
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Connection failed. Check your credentials.";
      const isAuthFail = msg.toLowerCase().includes("authentication") || msg.toLowerCase().includes("login failed") || msg.toLowerCase().includes("invalid credentials");
      if (isAuthFail && provider.id === "gmail") { setAuthError(true); setShowSteps(true); }
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <SectionCard>
      {/* Header strip */}
      <div
        className="px-5 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700"
        style={{ backgroundColor: provider.color + (isDark ? "20" : "0d") }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ backgroundColor: provider.color }}>
          {provider.icon}
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm" style={{ color: isDark ? D.text : "#1e293b" }}>Connect {provider.label}</p>
          <p className="text-xs" style={{ color: isDark ? D.muted : "#64748b" }}>IMAP · App Password · No OAuth needed</p>
        </div>
        {provider.app_password_url && (
          <a href={provider.app_password_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:opacity-80"
            style={{ color: provider.color, borderColor: provider.color + "40", backgroundColor: isDark ? provider.color + "18" : provider.color + "10" }}>
            <ExternalLink className="w-3 h-3" /> Get App Password
          </a>
        )}
      </div>

      <div className="p-5 space-y-4">
        <AnimatePresence>
          {authError && provider.id === "gmail" && (
            <GmailChecklistBanner onDismiss={() => setAuthError(false)} isDark={isDark} />
          )}
        </AnimatePresence>

        {/* Steps accordion */}
        {provider.steps.length > 0 && (
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: isDark ? D.border : "#e2e8f0" }}>
            <button
              onClick={() => setShowSteps(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors"
              style={{ backgroundColor: isDark ? D.raised : "#f8fafc", color: isDark ? D.muted : "#374151" }}
            >
              <span className="flex items-center gap-2"><Info className="w-4 h-4" />How to get your App Password</span>
              {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <AnimatePresence>
              {showSteps && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="px-4 py-3 space-y-2.5" style={{ backgroundColor: isDark ? D.card : "#ffffff" }}>
                    {provider.steps.map(step => (
                      <div key={step.num} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: provider.color }}>{step.num}</span>
                        <p className="text-sm" style={{ color: isDark ? D.muted : "#475569" }}>
                          {step.text}
                          {step.link && (
                            <> <a href={step.link} target="_blank" rel="noopener noreferrer"
                              className="font-semibold underline" style={{ color: provider.color }}>{step.linkText}</a></>
                          )}
                        </p>
                      </div>
                    ))}
                    {provider.note && (
                      <div className="mt-2 p-2.5 rounded-lg border text-xs font-medium"
                        style={{ backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#fffbeb", borderColor: isDark ? "#92400e" : "#fde68a", color: isDark ? "#fbbf24" : "#92400e" }}>
                        {provider.note}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Credential inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: isDark ? D.muted : "#6b7280" }}>Email Address</label>
            <input ref={emailRef} type="text" inputMode="email" autoComplete="email"
              value={emailVal} onChange={e => setEmailVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder={`you@${provider.domain || "example.com"}`}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: isDark ? D.muted : "#6b7280" }}>
              App Password <span className="font-normal normal-case text-slate-400">(NOT your login password)</span>
            </label>
            <div className="relative">
              <input type={showPass ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConnect()}
                placeholder={provider.placeholder || "app password"}
                className={`${inputCls} pr-11 font-mono`} style={inputStyle} />
              <button onClick={() => setShowPass(s => !s)} type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: isDark ? D.muted : "#9ca3af" }}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: isDark ? D.muted : "#6b7280" }}>
              Friendly Name <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Trademark Gmail, Personal Yahoo"
              className={inputCls} style={inputStyle} />
          </div>
          {provider.id === "other" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: isDark ? D.muted : "#6b7280" }}>IMAP Host</label>
                <input type="text" value={host} onChange={e => setHost(e.target.value)} placeholder="imap.yourdomain.com"
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide block mb-1.5" style={{ color: isDark ? D.muted : "#6b7280" }}>Port</label>
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel} className="flex-1 rounded-xl h-10 font-semibold text-sm"
            style={{ color: isDark ? D.muted : undefined }}>Cancel</Button>
          <Button onClick={handleConnect} disabled={loading}
            className="flex-1 rounded-xl h-10 text-sm font-bold text-white px-6"
            style={{ background: loading ? "#9CA3AF" : `linear-gradient(135deg, ${provider.color}, ${provider.color}CC)` }}>
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Testing & Connecting…</>
              : <><Wifi className="w-4 h-4 mr-2" />Connect Account</>}
          </Button>
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 p-3 rounded-xl border"
          style={{ backgroundColor: isDark ? "rgba(31,175,90,0.08)" : "#f0fdf4", borderColor: isDark ? "#14532d" : "#bbf7d0" }}>
          <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Password is stored securely. We only read email subjects & bodies for event extraction — we never send or modify anything.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTED ACCOUNT CARD
// ─────────────────────────────────────────────────────────────────────────────
function ConnectedAccountCard({ conn, onDisconnect, onTest, onToggle, onSync, isDark }) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal,     setLabelVal]     = useState(conn.label || conn.email_address);
  const [testing,      setTesting]      = useState(false);
  const [syncing,      setSyncing]      = useState(false);

  const color    = PROVIDER_COLORS[conn.provider] || PROVIDER_COLORS.other;
  const icon     = PROVIDER_ICONS[conn.provider]  || PROVIDER_ICONS.other;
  const hasError = !!conn.sync_error;

  const handleSaveLabel = async () => {
    try {
      await api.patch(`/email/connections/${encodeURIComponent(conn.email_address)}`, { label: labelVal });
      toast.success("Label updated"); setEditingLabel(false);
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

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -2, transition: springPhysics.lift }}>
      <SectionCard>
        {/* Top row — identity + status */}
        <div
          className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700"
          style={{ backgroundColor: hasError ? (isDark ? "rgba(239,68,68,0.08)" : "#fef2f2") : undefined }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ backgroundColor: conn.is_active ? color : "#9CA3AF" }}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            {editingLabel ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={labelVal} onChange={e => setLabelVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                  className="flex-1 px-2 py-1 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-400"
                  style={{ backgroundColor: isDark ? D.raised : "#ffffff", borderColor: isDark ? D.border : "#e2e8f0", color: isDark ? D.text : "#1e293b" }} />
                <button onClick={handleSaveLabel} className="p-1 text-emerald-500 hover:text-emerald-400"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingLabel(false)} className="p-1" style={{ color: isDark ? D.muted : "#9ca3af" }}><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate" style={{ color: isDark ? D.text : "#1e293b" }}>
                  {conn.label || conn.email_address}
                </p>
                <button onClick={() => setEditingLabel(true)} className="p-0.5 flex-shrink-0 transition-colors"
                  style={{ color: isDark ? D.dimmer : "#cbd5e1" }}>
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
            <p className="text-xs truncate" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>{conn.email_address}</p>
          </div>
          <div className="flex-shrink-0">
            {hasError ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-500 px-2 py-1 rounded-full"
                style={{ backgroundColor: isDark ? "rgba(239,68,68,0.15)" : "#fee2e2" }}>
                <AlertCircle className="w-3 h-3" /> Error
              </span>
            ) : conn.is_active ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-500 px-2 py-1 rounded-full"
                style={{ backgroundColor: isDark ? "rgba(31,175,90,0.15)" : "#dcfce7" }}>
                <CheckCircle2 className="w-3 h-3" /> Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                style={{ color: isDark ? D.muted : "#64748b", backgroundColor: isDark ? D.raised : "#f1f5f9" }}>
                <WifiOff className="w-3 h-3" /> Paused
              </span>
            )}
          </div>
        </div>

        {/* Error message */}
        {hasError && (
          <div className="mx-4 mt-3 p-3 rounded-xl border text-xs"
            style={{ backgroundColor: isDark ? "rgba(239,68,68,0.08)" : "#fef2f2", borderColor: isDark ? "#7f1d1d" : "#fecaca", color: isDark ? "#fca5a5" : "#dc2626" }}>
            {conn.sync_error}
          </div>
        )}

        {/* Category chips */}
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          {[
            { color: COLORS.purple,       border: "#DDD6FE", bg: isDark ? "rgba(139,92,246,0.12)" : "#F5F3FF", icon: CheckSquare, label: "Todos"     },
            { color: COLORS.deepBlue,     border: "#BFDBFE", bg: isDark ? "rgba(13,59,102,0.20)"  : "#EFF6FF", icon: Bell,        label: "Reminders" },
            { color: COLORS.emeraldGreen, border: "#BBF7D0", bg: isDark ? "rgba(31,175,90,0.12)"  : "#F0FDF4", icon: Calendar,    label: "Visits"    },
          ].map(item => (
            <div key={item.label}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border"
              style={{ backgroundColor: item.bg, borderColor: item.border, color: item.color }}>
              <item.icon className="w-3 h-3" /> {item.label}
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700"
          style={{ backgroundColor: isDark ? D.raised : "#f8fafc" }}>
          <p className="text-xs" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>
            {conn.last_synced
              ? `Synced ${format(parseISO(conn.last_synced), "MMM d, h:mm a")}`
              : conn.connected_at ? `Connected ${format(parseISO(conn.connected_at), "MMM d, yyyy")}` : ""}
            {conn.imap_host && <><span className="mx-1.5">·</span><span className="font-medium">{conn.imap_host}</span></>}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:bg-slate-200 dark:hover:bg-slate-700"
              style={{ color: isDark ? D.muted : "#64748b" }}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
            </button>
            <button onClick={handleTest} disabled={testing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:bg-slate-200 dark:hover:bg-slate-700"
              style={{ color: isDark ? D.muted : "#64748b" }}>
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />} Test
            </button>
            <button onClick={() => onToggle(conn.email_address, !conn.is_active)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 hover:bg-slate-200 dark:hover:bg-slate-700"
              style={{ color: isDark ? D.muted : "#64748b" }}>
              {conn.is_active ? "Pause" : "Resume"}
            </button>
            <button onClick={() => onDisconnect(conn.email_address)}
              className="p-1.5 rounded-lg transition-all active:scale-95"
              style={{ color: isDark ? D.muted : "#94a3b8" }}
              onMouseEnter={e => { e.currentTarget.style.color = COLORS.red; e.currentTarget.style.backgroundColor = isDark ? "rgba(239,68,68,0.12)" : "#fef2f2"; }}
              onMouseLeave={e => { e.currentTarget.style.color = isDark ? D.muted : "#94a3b8"; e.currentTarget.style.backgroundColor = "transparent"; }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </SectionCard>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT ROW  (with category badge + correct save logic — restored from v4)
// ─────────────────────────────────────────────────────────────────────────────
function EventRow({ event, defaultType, isDark }) {
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);
  const [saveType, setSaveType] = useState(defaultType || event.save_category || "reminder");

  const handleSave = async () => {
    setSaving(true); setError(null);
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
          remind_at: `${dateStr}T10:00:00`,
        });
        toast.success(`✓ Todo: ${event.title}`);

      } else if (saveType === "reminder") {
        const dateStr = event.date || new Date().toISOString().slice(0, 10);
        const timeStr = event.time || "10:00";
        let remindAt;
        try { remindAt = new Date(`${dateStr}T${timeStr}:00+05:30`).toISOString(); }
        catch { remindAt = new Date(Date.now() + 86400000).toISOString(); }
        await api.post("/email/save-as-reminder", {
          event_id:    event.id || "",
          title:       event.title,
          description: [
            event.organizer      && `From: ${event.organizer}`,
            event.description    && `Notes: ${event.description}`,
            event.source_subject && `Subject: ${event.source_subject}`,
          ].filter(Boolean).join("\n") || null,
          remind_at: remindAt,
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
      setError(msg); toast.error(msg);
    } finally { setSaving(false); }
  };

  const catCfg = CATEGORY_CONFIG[saveType] || CATEGORY_CONFIG.reminder;

  return (
    <div
      className="p-3.5 rounded-xl border transition-all"
      style={{ backgroundColor: isDark ? catCfg.darkBg : catCfg.bg, borderColor: catCfg.border }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* AI-suggested category badge */}
          {event.save_category && (
            <span className="inline-flex mb-1 text-[9px] font-black px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: CATEGORY_CONFIG[event.save_category]?.color || "#6B7280" }}>
              AI: {(CATEGORY_CONFIG[event.save_category]?.label || "").toUpperCase()}
            </span>
          )}
          <p className="text-sm font-bold truncate" style={{ color: isDark ? D.text : "#1e293b" }}>{event.title}</p>
          <p className="text-xs font-mono mt-0.5" style={{ color: catCfg.color }}>
            {event.date ? `📅 ${event.date}${event.time ? ` · ${event.time}` : ""}` : "Date not found"}
            {event.email_account && <span className="ml-2" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>· {event.email_account}</span>}
          </p>
          {event.description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: isDark ? D.muted : "#64748b" }}>{event.description}</p>
          )}
        </div>

        {/* Save type + save button */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <select value={saveType} onChange={e => setSaveType(e.target.value)} disabled={saved}
            className="text-[11px] font-bold rounded-lg border px-2 py-1 focus:outline-none cursor-pointer"
            style={{ borderColor: catCfg.border, color: catCfg.color, backgroundColor: isDark ? D.raised : catCfg.bg }}>
            <option value="todo">→ Todo</option>
            <option value="reminder">→ Reminder</option>
            <option value="visit">→ Visit</option>
          </select>
          <button onClick={handleSave} disabled={saving || saved}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: saved ? COLORS.emeraldGreen : catCfg.color }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saved ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved</>
              : <><Check className="w-3.5 h-3.5" />Save</>}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-xs mt-2 rounded-lg px-2 py-1 border"
          style={{ color: COLORS.red, backgroundColor: isDark ? "rgba(239,68,68,0.08)" : "#fef2f2", borderColor: isDark ? "#7f1d1d" : "#fecaca" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SENDER WHITELIST MANAGER  (restored from v4 with full feature set)
// ─────────────────────────────────────────────────────────────────────────────
function SenderWhitelistManager({ isDark }) {
  const [senders,  setSenders]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding,   setAdding]   = useState(false);

  const inputStyle = {
    backgroundColor: isDark ? D.raised : "#ffffff",
    borderColor: isDark ? D.border : "#d1d5db",
    color: isDark ? D.text : "#1e293b",
  };
  const inputCls = "px-3.5 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all";

  const fetchSenders = useCallback(async () => {
    try { const res = await api.get("/email/sender-whitelist"); setSenders(res.data?.senders || []); }
    catch { setSenders([]); } finally { setLoading(false); }
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
    } finally { setAdding(false); }
  };

  const handleRemove = async (addr) => {
    try {
      const res = await api.delete(`/email/sender-whitelist/${encodeURIComponent(addr)}`);
      setSenders(res.data?.senders || []);
      toast.success("Sender removed");
    } catch { toast.error("Failed to remove sender"); }
  };

  const isWhitelistActive = senders.length > 0;

  return (
    <SectionCard>
      <CardHeaderRow
        iconBg={isDark ? "bg-emerald-900/40" : "bg-emerald-50"}
        icon={<Filter className="w-4 h-4 text-emerald-500" />}
        title="Sender Whitelist"
        subtitle={isWhitelistActive
          ? `${senders.length} approved sender${senders.length !== 1 ? "s" : ""} — others are ignored`
          : "No filter active — all senders are scanned"}
        badge={senders.length || undefined}
      />
      <div className="p-4 space-y-4">
        {/* Info banner */}
        <div className="p-3 rounded-xl border flex items-start gap-2"
          style={{ backgroundColor: isDark ? "rgba(59,130,246,0.08)" : "#eff6ff", borderColor: isDark ? "#1d4ed8" : "#bfdbfe" }}>
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs" style={{ color: isDark ? "#93c5fd" : "#1e40af" }}>
            <p className="font-bold mb-0.5">How the whitelist works</p>
            <p>When one or more senders are added, <strong>only emails from those senders</strong> are scanned and auto-saved. All other emails are ignored. Leave empty to scan all.</p>
            <p className="mt-1">Use <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">@domain.com</code> to match all emails from a domain (e.g. <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">@ipindia.gov.in</code>).</p>
          </div>
        </div>

        {/* Quick-add suggested senders */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>
            Quick Add — Common Legal Senders
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_SENDERS.map(s => {
              const already = senders.some(existing => existing.email_address === s.email_address);
              return (
                <button key={s.email_address}
                  onClick={() => !already && handleAdd(s.email_address, s.label)}
                  disabled={already || adding}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all active:scale-95"
                  style={already
                    ? { backgroundColor: isDark ? "rgba(31,175,90,0.12)" : "#dcfce7", borderColor: "#bbf7d0", color: COLORS.emeraldGreen, cursor: "default" }
                    : { backgroundColor: isDark ? D.raised : "#ffffff", borderColor: isDark ? D.border : "#e2e8f0", color: isDark ? D.muted : "#374151" }
                  }>
                  {already ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom sender input */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>
            Add Custom Sender
          </p>
          <div className="flex gap-2">
            <input type="text" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="sender@domain.com or @domain.com"
              className={`flex-1 h-9 ${inputCls}`} style={inputStyle} />
            <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Label (optional)"
              className={`w-36 h-9 ${inputCls}`} style={inputStyle} />
            <Button onClick={() => handleAdd()} disabled={!newEmail.trim() || adding}
              className="h-9 rounded-xl text-sm font-semibold text-white px-4"
              style={{ backgroundColor: COLORS.deepBlue }}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Active whitelist */}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : senders.length === 0 ? (
          <div className="py-4 text-center text-sm" style={{ color: isDark ? D.muted : "#94a3b8" }}>
            No senders added — all emails are scanned
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isDark ? D.dimmer : "#94a3b8" }}>
              Active Whitelist ({senders.length})
            </p>
            {senders.map(s => (
              <motion.div key={s.email_address} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                style={{ backgroundColor: isDark ? "rgba(31,175,90,0.08)" : "#f0fdf4", borderColor: isDark ? "#14532d" : "#bbf7d0" }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: isDark ? "rgba(31,175,90,0.20)" : "#dcfce7" }}>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: isDark ? D.text : "#1e293b" }}>{s.label || s.email_address}</p>
                  {s.label && s.label !== s.email_address && (
                    <p className="text-[10px] font-mono" style={{ color: isDark ? D.muted : "#94a3b8" }}>{s.email_address}</p>
                  )}
                </div>
                <button onClick={() => handleRemove(s.email_address)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90"
                  style={{ color: isDark ? D.muted : "#94a3b8" }}
                  onMouseEnter={e => { e.currentTarget.style.color = COLORS.red; e.currentTarget.style.backgroundColor = isDark ? "rgba(239,68,68,0.12)" : "#fef2f2"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = isDark ? D.muted : "#94a3b8"; e.currentTarget.style.backgroundColor = "transparent"; }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
            <button
              onClick={async () => {
                if (!window.confirm("Clear entire whitelist? Emails from ALL senders will be scanned again.")) return;
                try {
                  await api.put("/email/sender-whitelist", { senders: [] });
                  setSenders([]);
                  toast.success("Whitelist cleared — all senders will now be scanned");
                } catch { toast.error("Failed to clear whitelist"); }
              }}
              className="text-xs font-semibold flex items-center gap-1 mt-1 active:scale-95 transition-all"
              style={{ color: isDark ? "#f87171" : COLORS.red }}>
              <Trash2 className="w-3 h-3" /> Clear entire whitelist
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function EmailSettings() {
  const isDark = useDark();

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
  const [activeTab,       setActiveTab]       = useState("accounts");

  const loadConnections = useCallback(async () => {
    try {
      const res = await api.get("/email/connections");
      setConnections(res.data?.connections || []);
    } catch (err) { console.error("Failed to load connections:", err); }
    finally { setLoading(false); }
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
    } catch { setPrefsChecked(true); return true; }
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
      setConnections(prev => prev.map(c => c.email_address === emailAddress ? { ...c, is_active: isActive } : c));
      toast.success(isActive ? "Account resumed" : "Account paused");
    } catch { toast.error("Failed to update"); }
  };

  const handleSync = async (emailAddress) => {
    try {
      const res = await api.get("/email/extract-events?force_refresh=true&limit=50", { timeout: 60000 });
      const events = (res.data || []).filter(e => e.email_account === emailAddress);
      toast.success(`✓ Synced — ${events.length} legal event(s) found`);
      loadConnections();
    } catch (err) { toast.error(err?.response?.data?.detail || "Sync failed"); }
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
        : `✓ Found ${events.length} legal event(s) across ${connections.length} account(s)`);
    } catch (err) {
      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        toast.error("Scan taking too long. Try syncing accounts individually.");
      } else {
        toast.error(err?.response?.data?.detail || "Scan failed");
      }
    } finally { setScanning(false); }
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
    setActiveForm(null); setShowAddOptions(false); loadConnections();
    if (prefsChecked && !autoSavePrefs?.auto_save_reminders && !autoSavePrefs?.auto_save_visits && !autoSavePrefs?.auto_save_todos) {
      setTimeout(() => setShowAutoDialog(true), 600);
    }
  };

  const activeProvider = QUICK_PROVIDERS.find(p => p.id === activeForm);

  const todoEvents     = extractedEvents.filter(e => e.save_category === "todo");
  const reminderEvents = extractedEvents.filter(e => e.save_category === "reminder" || (!e.save_category && ["Trademark Hearing","Court Hearing","Deadline","Appointment","Other"].includes(e.event_type)));
  const visitEvents    = extractedEvents.filter(e => e.save_category === "visit"    || (!e.save_category && ["Visit","Online Meeting","Conference","Interview","Meeting"].includes(e.event_type)));

  const autoSaveActive = autoSavePrefs?.auto_save_reminders || autoSavePrefs?.auto_save_visits || autoSavePrefs?.auto_save_todos;

  const TAB_CONFIG = [
    { id: "accounts",  label: "Accounts",    icon: Mail   },
    { id: "whitelist", label: "Whitelist",   icon: Filter },
    { id: "rules",     label: "Smart Rules", icon: Tag    },
  ];

  return (
    <TooltipProvider>
      <AnimatePresence>
        {showAutoDialog && (
          <AutoSaveDialog
            isDark={isDark}
            onSave={prefs => { setAutoSavePrefs(prev => ({ ...prev, ...prefs })); setShowAutoDialog(false); }}
            onSkip={() => {
              setShowAutoDialog(false);
              api.post("/email/auto-save-prefs", { auto_save_reminders: false, auto_save_visits: false, auto_save_todos: false, scan_time_hour: 12, scan_time_minute: 0 }).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="min-h-screen p-5 md:p-6 lg:p-8 space-y-5"
        style={{ background: isDark ? D.bg : "#f8fafc" }}
        variants={containerVariants} initial="hidden" animate="visible"
      >
        {/* ══ PAGE HEADER ══════════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants}>
          <div
            className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: "0 8px 32px rgba(13,59,102,0.25)" }}
          >
            <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
              style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">Integrations</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Email Integration</h1>
                <p className="text-white/60 text-sm mt-1">
                  Connect accounts · auto-classify hearings, deadlines &amp; meetings
                </p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {/* Auto-save status badge in header */}
                <AutoSaveStatusBadge prefs={autoSavePrefs} onEdit={() => setShowAutoDialog(true)} isDark={isDark} />
                {connections.length > 0 && (
                  <>
                    <button onClick={handleClearAll} disabled={clearing}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95"
                      style={{ backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.22)", color: "#ffffff" }}>
                      {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />} Reset Cache
                    </button>
                    <button onClick={handleScanAll} disabled={scanning}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-95"
                      style={{ backgroundColor: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.25)", color: "#ffffff" }}>
                      {scanning
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scanning…</>
                        : <><RefreshCw className="w-3.5 h-3.5" />Scan All</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══ STAT CARDS ═══════════════════════════════════════════════════════ */}
        <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={itemVariants}>
          <StatCard icon={Mail}     label="Connected" value={connections.length}         unit="accounts"   color={COLORS.deepBlue}     trend={connections.length > 0 ? "IMAP active" : "Add an account"} />
          <StatCard icon={Bell}     label="Extracted" value={extractedEvents.length}     unit="events"     color={COLORS.purple}       trend={`${reminderEvents.length} reminders · ${todoEvents.length} todos`} />
          <StatCard icon={Filter}   label="Whitelist" value={0}                          unit="senders"    color={COLORS.emeraldGreen} trend="Manage in Whitelist tab" />
          <StatCard icon={Activity} label="Auto-Save" value={autoSaveActive ? "ON" : "OFF"} unit="daily scan" color={autoSaveActive ? COLORS.emeraldGreen : COLORS.orange} trend={autoSaveActive ? `Daily at ${autoSavePrefs?.scan_time_hour || 12}:00` : "Click badge to enable"} />
        </motion.div>

        {/* ══ TAB BAR ══════════════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-1 p-1 rounded-2xl border"
            style={{ backgroundColor: isDark ? D.card : "#ffffff", borderColor: isDark ? D.border : "#e2e8f0" }}>
            {TAB_CONFIG.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={activeTab === tab.id
                  ? { backgroundColor: isDark ? D.raised : "#f1f5f9", color: isDark ? D.text : "#1e293b", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }
                  : { color: isDark ? D.muted : "#64748b" }}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ══ ACCOUNTS TAB ═════════════════════════════════════════════════════ */}
        {activeTab === "accounts" && (
          <div className="space-y-4">
            {/* Info banner */}
            <motion.div variants={itemVariants}>
              <div className="px-4 py-3.5 rounded-2xl border flex items-start gap-3"
                style={{ backgroundColor: isDark ? "rgba(59,130,246,0.08)" : "#eff6ff", borderColor: isDark ? "#1d4ed8" : "#bfdbfe" }}>
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs" style={{ color: isDark ? "#93c5fd" : "#1e40af" }}>
                  <span className="font-bold">Multiple accounts supported. </span>
                  Smart rules auto-classify: <strong>notices → Todos</strong>, <strong>hearings → Reminders</strong>, <strong>meetings → Visits</strong>.
                  {!autoSaveActive && (
                    <> <button onClick={() => setShowAutoDialog(true)} className="font-bold underline ml-1">Enable Auto-Save</button> to skip manual clicks.</>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Connected accounts list */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : connections.length === 0 && !showAddOptions && !activeForm ? (
              <motion.div variants={itemVariants}>
                <SectionCard>
                  <div className="py-14 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                      style={{ backgroundColor: isDark ? D.raised : "#f1f5f9" }}>
                      <Mail className="w-8 h-8" style={{ color: isDark ? D.muted : "#94a3b8" }} />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: isDark ? D.text : "#374151" }}>No email accounts connected yet</p>
                      <p className="text-sm mt-1" style={{ color: isDark ? D.muted : "#94a3b8" }}>Connect Gmail, Outlook, Yahoo or any IMAP email</p>
                    </div>
                    <button onClick={() => setShowAddOptions(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-all"
                      style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <Plus className="w-4 h-4" /> Connect Your First Account
                    </button>
                  </div>
                </SectionCard>
              </motion.div>
            ) : (
              <AnimatePresence>
                {connections.map(conn => (
                  <ConnectedAccountCard key={conn.email_address} conn={conn} isDark={isDark}
                    onDisconnect={handleDisconnect} onTest={handleTest} onToggle={handleToggle} onSync={handleSync} />
                ))}
              </AnimatePresence>
            )}

            {/* Add another dashed button */}
            {connections.length > 0 && !showAddOptions && !activeForm && (
              <motion.div variants={itemVariants}>
                <button
                  onClick={() => { setShowAddOptions(true); setActiveForm(null); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all"
                  style={{ borderColor: isDark ? D.border : "#e2e8f0", color: isDark ? D.muted : "#64748b" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.mediumBlue; e.currentTarget.style.color = COLORS.mediumBlue; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isDark ? D.border : "#e2e8f0"; e.currentTarget.style.color = isDark ? D.muted : "#64748b"; }}>
                  <Plus className="w-4 h-4" /> Add Another Account
                </button>
              </motion.div>
            )}

            {/* Provider picker grid */}
            <AnimatePresence>
              {(showAddOptions || connections.length === 0) && !activeForm && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionCard>
                    <CardHeaderRow
                      iconBg={isDark ? "bg-blue-900/40" : "bg-blue-50"}
                      icon={<Mail className="w-4 h-4 text-blue-500" />}
                      title={connections.length === 0 ? "Choose your email provider" : "Add another account"}
                      subtitle="Select the provider that matches your email"
                      action={showAddOptions && connections.length > 0 && (
                        <button onClick={() => setShowAddOptions(false)}
                          className="w-7 h-7 flex items-center justify-center rounded-xl transition-all"
                          style={{ color: isDark ? D.muted : "#94a3b8" }}>
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    />
                    <div className="p-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {QUICK_PROVIDERS.map(prov => (
                        <button key={prov.id}
                          onClick={() => { setActiveForm(prov.id); setShowAddOptions(false); }}
                          className="flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 border-transparent transition-all active:scale-95"
                          style={{ backgroundColor: isDark ? prov.color + "15" : prov.color + "08" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = prov.color + "60"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white"
                            style={{ backgroundColor: prov.color }}>{prov.icon}</div>
                          <span className="text-xs font-semibold text-center leading-tight"
                            style={{ color: isDark ? D.text : "#374151" }}>{prov.label}</span>
                        </button>
                      ))}
                    </div>
                  </SectionCard>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connect form */}
            <AnimatePresence>
              {activeForm && activeProvider && (
                <ConnectForm key={activeForm} provider={activeProvider} isDark={isDark}
                  onSuccess={handleConnectSuccess}
                  onCancel={() => { setActiveForm(null); if (connections.length === 0) setShowAddOptions(true); }} />
              )}
            </AnimatePresence>

            {/* Extracted events — grouped by category */}
            <AnimatePresence>
              {extractedEvents.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SectionCard>
                    <CardHeaderRow
                      iconBg={isDark ? "bg-purple-900/40" : "bg-purple-50"}
                      icon={<Sparkles className="w-4 h-4 text-purple-500" />}
                      title="Extracted Legal Events"
                      subtitle="AI-classified — review and save to the right place"
                      badge={extractedEvents.length}
                      action={
                        <button onClick={() => setExtractedEvents([])}
                          className="text-xs font-semibold transition-all"
                          style={{ color: isDark ? D.muted : "#94a3b8" }}>
                          Clear
                        </button>
                      }
                    />
                    <div className="p-4 space-y-4">
                      {todoEvents.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.purple }}>
                            <CheckSquare className="w-3.5 h-3.5" /> Save as Todos — Action Required ({todoEvents.length})
                          </p>
                          {todoEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="todo" isDark={isDark} />)}
                        </div>
                      )}
                      {reminderEvents.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.deepBlue }}>
                            <Bell className="w-3.5 h-3.5" /> Save as Reminders — Hearings &amp; Deadlines ({reminderEvents.length})
                          </p>
                          {reminderEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="reminder" isDark={isDark} />)}
                        </div>
                      )}
                      {visitEvents.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.emeraldGreen }}>
                            <Calendar className="w-3.5 h-3.5" /> Save as Visits — Meetings &amp; Consultations ({visitEvents.length})
                          </p>
                          {visitEvents.map((ev, i) => <EventRow key={i} event={ev} defaultType="visit" isDark={isDark} />)}
                        </div>
                      )}
                    </div>
                  </SectionCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ══ WHITELIST TAB ════════════════════════════════════════════════════ */}
        {activeTab === "whitelist" && (
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="px-4 py-3.5 rounded-2xl border flex items-start gap-3"
              style={{ backgroundColor: isDark ? "rgba(245,158,11,0.08)" : "#fffbeb", borderColor: isDark ? "#92400e" : "#fde68a" }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: COLORS.amber }} />
              <div className="text-xs" style={{ color: isDark ? "#fbbf24" : "#92400e" }}>
                <p className="font-bold mb-0.5">What is the Sender Whitelist?</p>
                <p>By default, all emails from all senders are scanned. Once you add any sender here, <strong>ONLY emails from those approved senders</strong> will be processed. This prevents irrelevant emails from cluttering your todos, reminders, and visits.</p>
                <p className="mt-1.5 font-semibold">Recommended for CA/CS firms: add IP India, GST Portal, Income Tax, MCA, and your client domains.</p>
              </div>
            </div>
            <SenderWhitelistManager isDark={isDark} />
          </motion.div>
        )}

        {/* ══ SMART RULES TAB ══════════════════════════════════════════════════ */}
        {activeTab === "rules" && (
          <motion.div variants={itemVariants} className="space-y-4">
            {/* Explanation */}
            <div className="px-4 py-3.5 rounded-2xl border flex items-start gap-3"
              style={{ backgroundColor: isDark ? D.raised : "#f8fafc", borderColor: isDark ? D.border : "#e2e8f0" }}>
              <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs" style={{ color: isDark ? D.muted : "#64748b" }}>
                <p className="font-bold mb-0.5" style={{ color: isDark ? D.text : "#374151" }}>How Smart Categorization Works</p>
                <p>When an email is scanned, Taskosphere uses AI + keyword rules to decide where to save it. You can always override the suggested category before clicking Save.</p>
              </div>
            </div>

            {/* Collapsible category rules panel (restored from v4) */}
            <CategoryRulesPanel isDark={isDark} />

            {/* Auto-save settings summary */}
            {autoSavePrefs && (
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? "bg-blue-900/40" : "bg-blue-50"}
                  icon={<Zap className="w-4 h-4 text-blue-500" />}
                  title="Current Auto-Save Settings"
                  subtitle="Emails saved automatically every day at the configured time"
                  action={
                    <button onClick={() => setShowAutoDialog(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold transition-all"
                      style={{ color: isDark ? "#93c5fd" : COLORS.mediumBlue }}>
                      <Settings2 className="w-3.5 h-3.5" /> Edit
                    </button>
                  }
                />
                <div className="p-4 space-y-2.5">
                  {[
                    { label: "Notices → Todo",      active: autoSavePrefs.auto_save_todos,     color: COLORS.purple       },
                    { label: "Hearings → Reminder", active: autoSavePrefs.auto_save_reminders, color: COLORS.deepBlue     },
                    { label: "Meetings → Visit",    active: autoSavePrefs.auto_save_visits,    color: COLORS.emeraldGreen },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: isDark ? D.text : "#374151" }}>{item.label}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={item.active
                          ? { backgroundColor: isDark ? `${item.color}20` : `${item.color}15`, color: item.color }
                          : { backgroundColor: isDark ? D.raised : "#f1f5f9", color: isDark ? D.muted : "#94a3b8" }}>
                        {item.active ? "ON" : "OFF"}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t"
                    style={{ borderColor: isDark ? D.border : "#f1f5f9" }}>
                    <span className="text-sm font-medium" style={{ color: isDark ? D.text : "#374151" }}>Daily scan time</span>
                    <span className="text-xs font-bold" style={{ color: isDark ? D.muted : "#64748b" }}>
                      {autoSavePrefs.scan_time_hour < 12
                        ? `${autoSavePrefs.scan_time_hour}:00 AM`
                        : autoSavePrefs.scan_time_hour === 12
                          ? "12:00 PM"
                          : `${autoSavePrefs.scan_time_hour - 12}:00 PM`} IST
                    </span>
                  </div>
                </div>
              </SectionCard>
            )}
          </motion.div>
        )}

        {/* ══ TIPS — always visible ═════════════════════════════════════════════ */}
        <motion.div variants={itemVariants}>
          <SectionCard>
            <CardHeaderRow
              iconBg={isDark ? "bg-slate-700" : "bg-slate-100"}
              icon={<Info className="w-4 h-4 text-slate-400" />}
              title="Tips & Troubleshooting"
              subtitle="Common setup issues and fixes"
            />
            <div className="p-4">
              <ul className="space-y-2">
                {[
                  "Gmail requires: (1) IMAP enabled, (2) 2-Step Verification ON, (3) App Password generated — all 3 are mandatory",
                  "Add @ipindia.gov.in to whitelist to auto-import all trademark hearings and notices without filtering",
                  "Examination Reports are saved as Todos (action required), Hearings as Reminders, Zoom/Meet as Visits",
                  "Use 'Reset Cache' if you see wrong or stale results, then 'Scan All' for a completely fresh extraction",
                  "FIX: Deleting one reminder or visit from Attendance will NOT delete other auto-synced items",
                  "If GEMINI_API_KEY is not set on the server, keyword-based fallback classification is used instead of AI",
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs" style={{ color: isDark ? D.muted : "#64748b" }}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </SectionCard>
        </motion.div>

      </motion.div>
    </TooltipProvider>
  );
}
