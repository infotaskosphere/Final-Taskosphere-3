// ═══════════════════════════════════════════════════════════════════════════════
// EmailSettings.jsx  v3
// Connect MULTIPLE email accounts via App Passwords — NO OAuth needed.
// NEW IN V3:
//  - Gmail pre-flight checklist (IMAP enable + App Password guide)
//  - Multi-account UI made explicit — "Add Another Account" always visible
//  - Better error messages with direct fix links
//  - All v2 features retained (auto-save dialog, daily scan, junk filter)
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
  ExternalLink as Link,
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

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL PREFLIGHT CHECKLIST (shown when auth fails)
// ═══════════════════════════════════════════════════════════════════════════════
function GmailChecklistBanner({ onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border-2 border-red-200 bg-red-50 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-red-100 border-b border-red-200">
        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-sm font-bold text-red-800 flex-1">
          Authentication Failed — Complete these 3 steps for Gmail
        </p>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {[
          {
            num: 1,
            title: "Enable IMAP in Gmail",
            desc: "Gmail has IMAP disabled by default.",
            link: "https://mail.google.com/mail/u/0/#settings/fwdandpop",
            linkText: "Open Gmail IMAP Settings →",
            detail: "Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save Changes",
          },
          {
            num: 2,
            title: "Turn on 2-Step Verification",
            desc: "Required before App Passwords work.",
            link: "https://myaccount.google.com/security",
            linkText: "Open Google Security →",
            detail: "Security → 2-Step Verification → Turn On",
          },
          {
            num: 3,
            title: "Generate a fresh App Password",
            desc: "Use App Password, NOT your Gmail login password.",
            link: "https://myaccount.google.com/apppasswords",
            linkText: "Create App Password →",
            detail: "App: Mail · Device: Other (Taskosphere) → Generate → Copy 16 chars",
          },
        ].map(step => (
          <div key={step.num} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px] font-black text-white">{step.num}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-800">{step.title}</p>
              <p className="text-xs text-red-600 mt-0.5">{step.detail}</p>
              <a
                href={step.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-red-700 underline hover:text-red-900"
              >
                {step.linkText}
                <ExternalLink className="w-3 h-3" />
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

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-SAVE FIRST-TIME DIALOG
// ═══════════════════════════════════════════════════════════════════════════════
function AutoSaveDialog({ onSave, onSkip }) {
  const [autoReminders, setAutoReminders] = useState(true);
  const [autoVisits,    setAutoVisits]    = useState(true);
  const [scanHour,      setScanHour]      = useState(12);
  const [saving,        setSaving]        = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/email/auto-save-prefs", {
        auto_save_reminders: autoReminders,
        auto_save_visits:    autoVisits,
        scan_time_hour:      scanHour,
        scan_time_minute:    0,
      });
      toast.success("✓ Auto-save preferences saved! Daily scan scheduled.");
      onSave({ auto_save_reminders: autoReminders, auto_save_visits: autoVisits, scan_time_hour: scanHour });
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-blue-50 to-purple-50 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Smart Auto-Save</h2>
              <p className="text-xs text-slate-500">Set it once — never miss a hearing</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mt-3">
            Taskosphere can <strong>automatically</strong> scan your inbox every day and save
            court hearings, GST deadlines, and client visits — without you lifting a finger.
          </p>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between p-4 rounded-2xl border border-purple-100 bg-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                <Bell className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Auto-Save as Reminders</p>
                <p className="text-xs text-slate-500">Hearings, GST dates, deadlines</p>
              </div>
            </div>
            <button onClick={() => setAutoReminders(s => !s)} className="transition-transform active:scale-95">
              {autoReminders
                ? <ToggleRight className="w-8 h-8 text-purple-600" />
                : <ToggleLeft className="w-8 h-8 text-slate-300" />}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl border border-blue-100 bg-blue-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Auto-Save as Client Visits</p>
                <p className="text-xs text-slate-500">Meetings, consultations, conferences</p>
              </div>
            </div>
            <button onClick={() => setAutoVisits(s => !s)} className="transition-transform active:scale-95">
              {autoVisits
                ? <ToggleRight className="w-8 h-8 text-blue-600" />
                : <ToggleLeft className="w-8 h-8 text-slate-300" />}
            </button>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50">
            <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">Daily Scan Time (IST)</p>
              <p className="text-xs text-slate-500">Inbox scanned automatically every day</p>
            </div>
            <select
              value={scanHour}
              onChange={e => setScanHour(Number(e.target.value))}
              className="px-3 py-1.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(h => (
                <option key={h} value={h}>
                  {h === 12 ? "12:00 PM (Noon)" : h < 12 ? `${h}:00 AM` : `${h-12}:00 PM`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onSkip} className="flex-1 rounded-xl h-11 text-sm font-semibold text-slate-500">
              Not now
            </Button>
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

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-SAVE STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════════
function AutoSaveStatusBadge({ prefs, onEdit }) {
  if (!prefs) return null;
  const isActive = prefs.auto_save_reminders || prefs.auto_save_visits;
  return (
    <button
      onClick={onEdit}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:opacity-80 ${
        isActive
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-slate-50 border-slate-200 text-slate-500"
      }`}
    >
      <Zap className="w-3 h-3" />
      {isActive
        ? `Auto-Save ON · ${prefs.scan_time_hour < 12 ? prefs.scan_time_hour + " AM" : prefs.scan_time_hour === 12 ? "12 PM" : (prefs.scan_time_hour - 12) + " PM"}`
        : "Auto-Save OFF"}
      <Settings2 className="w-3 h-3 ml-0.5 opacity-60" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECT FORM
// ═══════════════════════════════════════════════════════════════════════════════
function ConnectForm({ provider, onSuccess, onCancel }) {
  const [emailVal,   setEmailVal]   = useState(provider.domain ? `@${provider.domain}` : "");
  const [password,   setPassword]   = useState("");
  const [host,       setHost]       = useState(provider.imap_host);
  const [port,       setPort]       = useState(provider.imap_port);
  const [label,      setLabel]      = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [showSteps,  setShowSteps]  = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [authError,  setAuthError]  = useState(false);

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border rounded-2xl overflow-hidden"
      style={{ borderColor: provider.color + "30" }}
    >
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
        {/* Gmail auth error checklist */}
        <AnimatePresence>
          {authError && provider.id === "gmail" && (
            <GmailChecklistBanner onDismiss={() => setAuthError(false)} />
          )}
        </AnimatePresence>

        {/* Steps accordion */}
        {provider.steps.length > 0 && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <button onClick={() => setShowSteps(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                How to get your App Password
              </span>
              {showSteps ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <AnimatePresence>
              {showSteps && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  <div className="px-4 py-3 space-y-2.5 bg-white">
                    {provider.steps.map(step => (
                      <div key={step.num} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: provider.color }}>
                          {step.num}
                        </span>
                        <p className="text-sm text-slate-600">
                          {step.text}
                          {step.link && (
                            <> <a href={step.link} target="_blank" rel="noopener noreferrer"
                              className="font-semibold underline" style={{ color: provider.color }}>
                              {step.linkText}
                            </a></>
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
            <input
              ref={emailRef}
              type="text" inputMode="email" autoComplete="email"
              value={emailVal} onChange={e => setEmailVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              placeholder={`you@${provider.domain || "example.com"}`}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              App Password <span className="font-normal text-slate-400 normal-case">(NOT your Gmail login password)</span>
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConnect()}
                placeholder={provider.placeholder || "app password"}
                className="w-full px-4 py-2.5 pr-11 text-sm rounded-xl border border-slate-200 bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 font-mono transition-all"
              />
              <button onClick={() => setShowPass(s => !s)} type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Friendly Name <span className="font-normal text-slate-400 normal-case">(optional — e.g. "Trademark Gmail")</span>
            </label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Trademark Gmail, Personal Yahoo"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all" />
          </div>

          {provider.id === "other" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">IMAP Host</label>
                <input type="text" value={host} onChange={e => setHost(e.target.value)}
                  placeholder="imap.yourdomain.com"
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTED ACCOUNT CARD
// ═══════════════════════════════════════════════════════════════════════════════
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
    try { await onTest(conn.email_address); }
    finally { setTesting(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(conn.email_address); }
    finally { setSyncing(false); }
  };

  const hasError = !!conn.sync_error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="border rounded-2xl overflow-hidden transition-all"
      style={{ borderColor: hasError ? "#FECACA" : conn.is_active ? color + "30" : "#E5E7EB" }}
    >
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
              <button onClick={() => setEditingLabel(true)}
                className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
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

      <div className="mx-5 my-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-100 text-xs font-semibold text-purple-700">
          <Bell className="w-3 h-3" /> Reminders
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-700">
          <Calendar className="w-3 h-3" /> Visit Schedules
        </div>
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
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync
          </button>
          <button onClick={handleTest} disabled={testing} title="Test connection"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all">
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            Test
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

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT ROW — fixed save logic
// ═══════════════════════════════════════════════════════════════════════════════
function EventRow({ event, type }) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (type === "reminder") {
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

  const colors = type === "reminder"
    ? { bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-700", btn: "#8B5CF6" }
    : { bg: "bg-blue-50",   border: "border-blue-100",   text: "text-blue-700",   btn: "#3B82F6" };

  return (
    <div className={`flex flex-col gap-1 p-3 rounded-xl border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{event.title}</p>
          <p className={`text-xs ${colors.text} font-mono mt-0.5`}>
            {event.date ? `📅 ${event.date}${event.time ? ` · ${event.time}` : ""}` : "Date not found"}
            {event.email_account && <span className="ml-2 text-slate-400">· {event.email_account}</span>}
          </p>
          {event.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{event.description}</p>}
        </div>
        <button
          onClick={handleSave} disabled={saving || saved}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
          style={{ background: saved ? "#1FAF5A" : colors.btn }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved</>
            : type === "reminder" ? <><Bell className="w-3.5 h-3.5" />Save</>
            : <><Calendar className="w-3.5 h-3.5" />Save</>}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1 border border-red-100">{error}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EmailSettings COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
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
    if (!window.confirm("Clear all extracted events cache? Forces a completely fresh scan next time.")) return;
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
    if (prefsChecked && !autoSavePrefs?.auto_save_reminders && !autoSavePrefs?.auto_save_visits) {
      setTimeout(() => setShowAutoDialog(true), 600);
    }
  };

  const handleAutoSaveSaved = (prefs) => {
    setAutoSavePrefs(prev => ({ ...prev, ...prefs }));
    setShowAutoDialog(false);
  };

  const activeProvider = QUICK_PROVIDERS.find(p => p.id === activeForm);

  const reminderEvents = extractedEvents.filter(e =>
    ["Trademark Hearing", "Court Hearing", "Deadline", "Appointment", "Other"].includes(e.event_type)
  );
  const visitEvents = extractedEvents.filter(e =>
    ["Visit", "Online Meeting", "Conference", "Interview", "Meeting"].includes(e.event_type)
  );

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
                scan_time_hour: 12, scan_time_minute: 0,
              }).catch(() => {});
            }}
          />
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Email Accounts</h1>
            <p className="text-sm text-slate-500 mt-1">
              Connect <strong>multiple</strong> email accounts — all inboxes are scanned together.
            </p>
          </div>
          <AutoSaveStatusBadge prefs={autoSavePrefs} onEdit={() => setShowAutoDialog(true)} />
        </div>

        {/* How it works */}
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">Multiple accounts supported</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              You can connect as many Gmail, Outlook, or Yahoo accounts as you need.
              After connecting the first account, click <strong>+ Add Another Account</strong> to add more.
              All inboxes are scanned together for <strong>hearings, GST deadlines, and client visits</strong>.
              {autoSavePrefs?.auto_save_reminders || autoSavePrefs?.auto_save_visits
                ? <> Auto-save is <strong>ON</strong> — events save automatically at <strong>
                    {autoSavePrefs.scan_time_hour < 12 ? autoSavePrefs.scan_time_hour + ":00 AM"
                      : autoSavePrefs.scan_time_hour === 12 ? "12:00 PM"
                      : (autoSavePrefs.scan_time_hour - 12) + ":00 PM"} IST</strong>.</>
                : <> <a href="#" onClick={e => { e.preventDefault(); setShowAutoDialog(true); }}
                    className="font-semibold underline">Enable Auto-Save</a> to skip manual clicks entirely.</>}
            </p>
          </div>
        </div>

        {/* Connected Accounts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-700">
              Connected Accounts
              {connections.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-400">({connections.length})</span>
              )}
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
                </>
              )}
              {/* Always visible Add Account button once any account exists */}
              {connections.length > 0 && (
                <button
                  onClick={() => { setShowAddOptions(s => !s); setActiveForm(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all"
                  style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
                  <Plus className="w-4 h-4" /> Add Another Account
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : connections.length === 0 && !showAddOptions && !activeForm ? (
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-700">No email accounts connected yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  Connect Gmail, Outlook, Yahoo or any IMAP email — you can add multiple accounts.
                </p>
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
                <ConnectedAccountCard
                  key={conn.email_address}
                  conn={conn}
                  onDisconnect={handleDisconnect}
                  onTest={handleTest}
                  onToggle={handleToggle}
                  onSync={handleSync}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Extracted Events */}
        <AnimatePresence>
          {extractedEvents.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-700">
                  Extracted Legal Events
                  <span className="ml-2 text-sm font-normal text-slate-400">({extractedEvents.length} total)</span>
                </h2>
                <button onClick={() => setExtractedEvents([])}
                  className="text-xs text-slate-400 hover:text-slate-600 font-semibold">Clear</button>
              </div>
              {reminderEvents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" /> Save as Reminders ({reminderEvents.length})
                  </p>
                  {reminderEvents.map((ev, i) => <EventRow key={i} event={ev} type="reminder" />)}
                </div>
              )}
              {visitEvents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Save as Visits ({visitEvents.length})
                  </p>
                  {visitEvents.map((ev, i) => <EventRow key={i} event={ev} type="visit" />)}
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
                {connections.length === 0 ? "Choose your email provider" : "Add another account — choose provider"}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {QUICK_PROVIDERS.map(prov => (
                  <button key={prov.id}
                    onClick={() => { setActiveForm(prov.id); setShowAddOptions(false); }}
                    className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-transparent hover:border-current transition-all active:scale-95"
                    style={{ backgroundColor: prov.color + "08" }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white"
                      style={{ backgroundColor: prov.color }}>
                      {prov.icon}
                    </div>
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
            <ConnectForm
              key={activeForm}
              provider={activeProvider}
              onSuccess={handleConnectSuccess}
              onCancel={() => {
                setActiveForm(null);
                if (connections.length === 0) setShowAddOptions(true);
              }}
            />
          )}
        </AnimatePresence>

        {/* Tips */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tips</p>
          <ul className="space-y-1.5">
            {[
              "You can connect multiple Gmail, Outlook, Yahoo accounts — click '+ Add Another Account' after the first one",
              "Gmail requires: (1) IMAP enabled, (2) 2-Step Verification ON, (3) App Password generated",
              "Use the App Password from Google — NOT your regular Gmail login password",
              "AI filters out Jio bills, bank OTPs, Adobe ads — only legal/compliance emails are extracted",
              "Enable Auto-Save (top badge) to have events silently added to Reminders & Visits every day",
              "Use 'Reset Cache' if you see wrong results, then Scan All for a fresh extraction",
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
