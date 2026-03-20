// ═══════════════════════════════════════════════════════════════════════════════
// EmailSettings.jsx
// A full settings page where users can connect multiple email accounts
// using App Passwords — NO OAuth, NO Google Cloud Console needed.
//
// Drop into your settings route:
//   <Route path="/settings/email" element={<EmailSettings />} />
//
// Or embed inside your existing Settings page:
//   import EmailSettings from "@/components/EmailSettings";
//   <EmailSettings />
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Mail, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw,
  Loader2, Eye, EyeOff, ExternalLink, ChevronDown, ChevronUp,
  Wifi, WifiOff, Edit2, Check, X, Info, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";

// ── Colours ───────────────────────────────────────────────────────────────────
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

// ── Quick provider buttons ────────────────────────────────────────────────────
const QUICK_PROVIDERS = [
  {
    id: "gmail",
    label: "Gmail",
    color: "#EA4335",
    icon: "G",
    domain: "gmail.com",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    app_password_url: "https://myaccount.google.com/apppasswords",
    steps: [
      { num: 1, text: "Open", link: "https://myaccount.google.com", linkText: "myaccount.google.com" },
      { num: 2, text: "Go to Security → 2-Step Verification → Enable it" },
      { num: 3, text: "Search 'App passwords' in your Google Account" },
      { num: 4, text: "App: Mail · Device: Other (name it Taskosphere) → Generate" },
      { num: 5, text: "Copy the 16-character password and paste below" },
    ],
    note: "⚠️ 2-Step Verification must be enabled first.",
    placeholder: "abcd efgh ijkl mnop",
  },
  {
    id: "outlook",
    label: "Outlook / Hotmail",
    color: "#0078D4",
    icon: "M",
    domain: "outlook.com",
    imap_host: "outlook.office365.com",
    imap_port: 993,
    app_password_url: "https://account.microsoft.com/security",
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
    id: "yahoo",
    label: "Yahoo Mail",
    color: "#720E9E",
    icon: "Y",
    domain: "yahoo.com",
    imap_host: "imap.mail.yahoo.com",
    imap_port: 993,
    app_password_url: "https://login.yahoo.com/myaccount/security/",
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
    id: "icloud",
    label: "iCloud Mail",
    color: "#3B82F6",
    icon: "iC",
    domain: "icloud.com",
    imap_host: "imap.mail.me.com",
    imap_port: 993,
    app_password_url: "https://appleid.apple.com",
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
    id: "other",
    label: "Other Email",
    color: "#374151",
    icon: "@",
    domain: "",
    imap_host: "",
    imap_port: 993,
    app_password_url: "",
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
// CONNECT FORM  (shown per provider)
// ═══════════════════════════════════════════════════════════════════════════════

function ConnectForm({ provider, onSuccess, onCancel }) {
  const [email, setEmail]       = useState(provider.domain ? `@${provider.domain}` : "");
  const [password, setPassword] = useState("");
  const [host, setHost]         = useState(provider.imap_host);
  const [port, setPort]         = useState(provider.imap_port);
  const [label, setLabel]       = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [loading, setLoading]   = useState(false);

  // Auto-fill email cursor position
  const emailRef = React.useRef(null);
  useEffect(() => {
    if (provider.domain && emailRef.current) {
      emailRef.current.setSelectionRange(0, 0);
      emailRef.current.focus();
    }
  }, []);

  const handleConnect = async () => {
    const trimEmail = email.trim();
    if (!trimEmail || !trimEmail.includes("@")) { toast.error("Enter a valid email address"); return; }
    if (!password) { toast.error("App Password is required"); return; }

    setLoading(true);
    try {
      await api.post("/email/connections", {
        email_address: trimEmail,
        app_password: password,
        imap_host: host || undefined,
        imap_port: Number(port),
        label: label || undefined,
      });
      toast.success(`✓ ${trimEmail} connected successfully!`);
      onSuccess();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Connection failed. Check your credentials.";
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
      {/* Provider header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ backgroundColor: provider.color + "12" }}>
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
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:opacity-80"
            style={{ color: provider.color, borderColor: provider.color + "40", backgroundColor: provider.color + "10" }}>
            <ExternalLink className="w-3 h-3" />
            Get App Password
          </a>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Step-by-step guide */}
        {provider.steps.length > 0 && (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <button
              onClick={() => setShowSteps(s => !s)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                How to get your App Password
              </span>
              {showSteps ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            <AnimatePresence>
              {showSteps && (
                <motion.div
                  initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden"
                >
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

        {/* Form fields */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Email Address
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={`you@${provider.domain || "example.com"}`}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 transition-shadow"
              style={{ "--tw-ring-color": provider.color + "40" } as any}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              App Password <span className="font-normal text-slate-400 normal-case">(not your login password)</span>
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConnect()}
                placeholder={provider.placeholder || "app password"}
                className="w-full px-4 py-2.5 pr-11 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 font-mono transition-shadow"
              />
              <button
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Friendly Name <span className="font-normal text-slate-400 normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`e.g. Work Gmail, Personal Yahoo`}
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 transition-shadow"
            />
          </div>

          {/* Custom IMAP host (only for "other") */}
          {provider.id === "other" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">IMAP Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="imap.yourdomain.com"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2"
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel}
            className="flex-1 rounded-xl h-10 text-sm font-semibold">
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="flex-2 rounded-xl h-10 text-sm font-bold text-white px-6"
            style={{ background: loading ? "#9CA3AF" : `linear-gradient(135deg, ${provider.color}, ${provider.color}CC)` }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Testing & Connecting…</>
              : <><Wifi className="w-4 h-4 mr-2" />Connect Account</>
            }
          </Button>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-100">
          <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700">
            Your password is tested and stored securely. We only use it to read email subjects &amp; bodies for event extraction.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTED ACCOUNT CARD
// ═══════════════════════════════════════════════════════════════════════════════

function ConnectedAccountCard({ conn, onDisconnect, onTest, onToggle }) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal, setLabelVal]         = useState(conn.label || conn.email_address);
  const [testing, setTesting]           = useState(false);

  const color = PROVIDER_COLORS[conn.provider] || PROVIDER_COLORS.other;
  const icon  = PROVIDER_ICONS[conn.provider] || PROVIDER_ICONS.other;

  const handleSaveLabel = async () => {
    try {
      await api.patch(`/email/connections/${encodeURIComponent(conn.email_address)}`, { label: labelVal });
      toast.success("Label updated");
      setEditingLabel(false);
    } catch {
      toast.error("Failed to update label");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTest(conn.email_address);
    } finally {
      setTesting(false);
    }
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
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ backgroundColor: hasError ? "#FEF2F2" : conn.is_active ? color + "08" : "#F9FAFB" }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ backgroundColor: conn.is_active ? color : "#9CA3AF" }}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={labelVal}
                onChange={e => setLabelVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                className="flex-1 px-2 py-1 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button onClick={handleSaveLabel} className="p-1 text-emerald-600 hover:text-emerald-700">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingLabel(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
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

        {/* Status badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
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

      {/* Error message */}
      {hasError && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs text-red-700 font-medium">{conn.sync_error}</p>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
        <div className="text-xs text-slate-400">
          {conn.last_synced
            ? `Last synced ${format(parseISO(conn.last_synced), "MMM d, h:mm a")}`
            : `Connected ${conn.connected_at ? format(parseISO(conn.connected_at), "MMM d, yyyy") : ""}`}
          <span className="mx-1">·</span>
          <span className="font-medium">{conn.imap_host}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Test button */}
          <button
            onClick={handleTest}
            disabled={testing}
            title="Test connection"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            Test
          </button>

          {/* Pause/Resume toggle */}
          <button
            onClick={() => onToggle(conn.email_address, !conn.is_active)}
            title={conn.is_active ? "Pause syncing" : "Resume syncing"}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          >
            {conn.is_active ? "Pause" : "Resume"}
          </button>

          {/* Disconnect */}
          <button
            onClick={() => onDisconnect(conn.email_address)}
            title="Disconnect"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EmailSettings COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function EmailSettings() {
  const [connections, setConnections]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeForm, setActiveForm]     = useState(null);  // provider id or null
  const [showAddOptions, setShowAddOptions] = useState(false);

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

  useEffect(() => { loadConnections(); }, [loadConnections]);

  const handleDisconnect = async (emailAddress: string) => {
    if (!window.confirm(`Disconnect ${emailAddress}? Events already imported will remain.`)) return;
    try {
      await api.delete(`/email/connections/${encodeURIComponent(emailAddress)}`);
      setConnections(prev => prev.filter(c => c.email_address !== emailAddress));
      toast.success(`${emailAddress} disconnected`);
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleTest = async (emailAddress: string) => {
    try {
      await api.post(`/email/connections/${encodeURIComponent(emailAddress)}/test`);
      toast.success(`✓ ${emailAddress} is working`);
      loadConnections();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Connection test failed");
      loadConnections();
    }
  };

  const handleToggle = async (emailAddress: string, isActive: boolean) => {
    try {
      await api.patch(`/email/connections/${encodeURIComponent(emailAddress)}`, { is_active: isActive });
      setConnections(prev =>
        prev.map(c => c.email_address === emailAddress ? { ...c, is_active: isActive } : c)
      );
      toast.success(isActive ? "Account resumed" : "Account paused");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleConnectSuccess = () => {
    setActiveForm(null);
    setShowAddOptions(false);
    loadConnections();
  };

  const activeProvider = QUICK_PROVIDERS.find(p => p.id === activeForm);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Email Accounts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your email accounts to automatically extract meetings, hearings, and deadlines.
          Uses IMAP — no OAuth or API keys required.
        </p>
      </div>

      {/* ── How it works banner ── */}
      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Info className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-800 mb-1">How it works</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            We connect to your inbox using IMAP (the same standard used by email apps like Outlook Desktop, Thunderbird, Apple Mail).
            You generate a special <strong>App Password</strong> from your email provider — it's separate from your login password
            and can be revoked anytime. We only read emails to extract event data; we never send emails or modify anything.
          </p>
        </div>
      </div>

      {/* ── Connected accounts ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-700">
            Connected Accounts
            {connections.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">({connections.length})</span>
            )}
          </h2>
          {connections.length > 0 && (
            <button
              onClick={() => { setShowAddOptions(s => !s); setActiveForm(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
            >
              <Plus className="w-4 h-4" /> Add Account
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : connections.length === 0 && !showAddOptions && !activeForm ? (
          /* Empty state */
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-700">No email accounts connected</p>
              <p className="text-sm text-slate-400 mt-1">
                Connect Gmail, Outlook, Yahoo or any IMAP email to extract meetings and events automatically.
              </p>
            </div>
            <button
              onClick={() => setShowAddOptions(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-all"
              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
            >
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
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Add account section ── */}
      <AnimatePresence>
        {(showAddOptions || connections.length === 0) && !activeForm && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <h2 className="text-base font-bold text-slate-700">
              {connections.length === 0 ? "Choose your email provider" : "Add another account"}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {QUICK_PROVIDERS.map(prov => (
                <button
                  key={prov.id}
                  onClick={() => { setActiveForm(prov.id); setShowAddOptions(false); }}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-transparent hover:border-current transition-all active:scale-95 group"
                  style={{ backgroundColor: prov.color + "08" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white"
                    style={{ backgroundColor: prov.color }}
                  >
                    {prov.icon}
                  </div>
                  <span className="text-sm font-semibold text-slate-700 text-center leading-tight">
                    {prov.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Connect form ── */}
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

      {/* ── Tips ── */}
      {connections.length > 0 && !activeForm && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tips</p>
          <ul className="space-y-1.5">
            {[
              "You can connect multiple accounts — events from all accounts appear together",
              "If an account shows an error, click Test to diagnose or re-generate the App Password",
              "Pause an account temporarily to stop it from being scanned without losing the connection",
              "App Passwords can be revoked from your email provider anytime — your main password stays safe",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
