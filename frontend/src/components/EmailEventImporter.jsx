// ═══════════════════════════════════════════════════════════════════════════════
// EmailEventImporter.jsx
// Supports connecting MULTIPLE Gmail / Outlook / IMAP accounts per user.
//
// Usage:
//   <EmailEventImporter
//     mode="reminder"   // "reminder" | "visit"
//     onSelectEvent={(event) => { /* auto-fill form */ }}
//     onClose={() => setShowImporter(false)}
//   />
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isPast } from "date-fns";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Mail, X, RefreshCw, Loader2, CheckCircle2,
  Clock, MapPin, User, Calendar, ChevronRight, Zap,
  Link2, Plus, Shield, Eye, EyeOff, Inbox, Trash2,
  PlusCircle,
} from "lucide-react";

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  deepBlue:   "#0D3B66",
  mediumBlue: "#1F6FB2",
  emerald:    "#1FAF5A",
  amber:      "#F59E0B",
  red:        "#EF4444",
};

const PROVIDER_META = {
  google:    { label: "Gmail",            icon: "G", color: "#EA4335", bg: "#FEF2F2" },
  microsoft: { label: "Outlook",          icon: "M", color: "#0078D4", bg: "#EFF6FF" },
  yahoo:     { label: "Yahoo Mail",       icon: "Y", color: "#720E9E", bg: "#F5F3FF" },
  other:     { label: "Custom IMAP",      icon: "@", color: "#374151", bg: "#F9FAFB" },
};

const URGENCY_COLORS = {
  urgent: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  high:   { bg: "#FFF7ED", text: "#9A3412", border: "#FED7AA" },
  medium: { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  low:    { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" },
};

const TYPE_ICONS = {
  meeting: "📅", hearing: "⚖️", visit: "🏢",
  deadline: "⏰", court: "🏛️", other: "📌",
};

const spring  = { type: "spring", stiffness: 280, damping: 24 };
const fadeUp  = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

// ── Get stored JWT token ──────────────────────────────────────────────────────
function getStoredToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    sessionStorage.getItem("access_token") ||
    sessionStorage.getItem("token") ||
    ""
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMAP CONNECT FORM
// ═══════════════════════════════════════════════════════════════════════════════

function IMAPConnectForm({ providerId, onSuccess, onCancel }) {
  const meta = PROVIDER_META[providerId] || PROVIDER_META.other;
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost]         = useState(
    providerId === "yahoo" ? "imap.mail.yahoo.com" : ""
  );
  const [port, setPort]         = useState(993);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleConnect = async () => {
    if (!email || !password) { toast.error("Email and app password are required"); return; }
    setLoading(true);
    try {
      await api.post("/email/connect/imap", {
        provider: providerId,
        email_address: email,
        app_password: password,
        imap_host: host || undefined,
        imap_port: port,
      });
      toast.success(`✓ ${email} connected`);
      onSuccess();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Connection failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-2 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
    >
      {providerId === "yahoo" && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>Yahoo:</strong> Yahoo Security → Generate App Password → paste here (not your login password).
        </div>
      )}
      {providerId === "other" && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          Enter your IMAP server details. Most use port 993 with SSL.
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Email Address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">App Password</label>
        <div className="relative">
          <input type={showPass ? "text" : "password"} value={password}
            onChange={e => setPassword(e.target.value)} placeholder="App password"
            className="w-full px-3 py-2 pr-9 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button onClick={() => setShowPass(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {providerId === "other" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">IMAP Host</label>
            <input type="text" value={host} onChange={e => setHost(e.target.value)}
              placeholder="imap.example.com"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Port</label>
            <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl text-sm h-9">Cancel</Button>
        <Button onClick={handleConnect} disabled={loading}
          className="flex-1 rounded-xl text-sm h-9 text-white font-semibold"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
          {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Connecting…</> : "Connect"}
        </Button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT CARD
// ═══════════════════════════════════════════════════════════════════════════════

function EventCard({ event, mode, onSelect }) {
  const urgencyStyle = URGENCY_COLORS[event.urgency] || URGENCY_COLORS.medium;
  const isPastDate   = event.date && isPast(parseISO(event.date + "T23:59:59"));

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -1, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
      whileTap={{ scale: 0.99 }}
      transition={spring}
      className="border rounded-xl p-3.5 cursor-pointer transition-all group relative"
      style={{ borderColor: urgencyStyle.border, backgroundColor: urgencyStyle.bg, opacity: isPastDate ? 0.65 : 1 }}
      onClick={() => onSelect(event)}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 15 }}>{TYPE_ICONS[event.event_type] || "📌"}</span>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ color: urgencyStyle.text, backgroundColor: urgencyStyle.border }}>
            {event.urgency}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
            style={{ color: "#374151", borderColor: "#D1D5DB", backgroundColor: "#F9FAFB" }}>
            {event.event_type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {event.source_account && (
            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
              {event.source_account}
            </span>
          )}
          {isPastDate && <span className="text-[10px] font-bold text-red-500">past</span>}
        </div>
      </div>

      <p className="font-bold text-sm text-slate-800 leading-snug mb-2 pr-6">{event.title}</p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {event.date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 font-medium">
              {format(parseISO(event.date), "MMM d, yyyy")}
              {event.time && ` · ${event.time}`}
            </span>
          </div>
        )}
        {event.location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 truncate max-w-[140px]">{event.location}</span>
          </div>
        )}
        {event.organizer && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 truncate max-w-[140px]">{event.organizer}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-400 truncate max-w-[140px]">{event.source_from}</span>
        </div>
      </div>

      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: C.deepBlue }}>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTED ACCOUNT ROW
// ═══════════════════════════════════════════════════════════════════════════════

function ConnectedAccountRow({ conn, onDisconnect }) {
  const meta = PROVIDER_META[conn.provider] || PROVIDER_META.other;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
      style={{ borderColor: C.emerald + "40", backgroundColor: "#F0FDF4" }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
        style={{ backgroundColor: meta.color }}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{conn.email_address}</p>
        <p className="text-xs text-slate-400">
          {meta.label} · Connected {conn.connected_at ? format(parseISO(conn.connected_at), "MMM d") : ""}
        </p>
      </div>
      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      <button onClick={() => onDisconnect(conn.provider, conn.email_address)}
        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function EmailEventImporter({ mode = "reminder", onSelectEvent, onClose }) {
  const [step, setStep]                   = useState("accounts");
  const [connections, setConnections]     = useState([]);
  const [events, setEvents]               = useState([]);
  const [loading, setLoading]             = useState(false);
  const [fetching, setFetching]           = useState(false);
  const [daysBack, setDaysBack]           = useState(30);
  const [filterType, setFilterType]       = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [showIMAPForm, setShowIMAPForm]   = useState(null); // provider id or null
  const [errors, setErrors]               = useState([]);
  // For "add another Gmail account" — let user type a hint email
  const [addGmailHint, setAddGmailHint]   = useState("");
  const [showGmailHintInput, setShowGmailHintInput] = useState(false);
  const [addOutlookHint, setAddOutlookHint]   = useState("");
  const [showOutlookHintInput, setShowOutlookHintInput] = useState(false);

  useEffect(() => { loadConnections(); }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await api.get("/email/connections");
      setConnections(res.data?.connections || []);
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Open OAuth popup ────────────────────────────────────────────────────────
  const handleOAuthConnect = useCallback((provider, accountHint = "") => {
    const token = getStoredToken();
    if (!token) { toast.error("Session expired. Please log in again."); return; }

    const backendBase =
      import.meta.env.VITE_API_URL?.replace("/api", "") ||
      "https://final-taskosphere-backend.onrender.com";

    let url = `${backendBase}/api/email/auth/${provider}?token=${encodeURIComponent(token)}`;
    if (accountHint) url += `&account_hint=${encodeURIComponent(accountHint)}`;

    const popup = window.open(url, `emailOAuth_${Date.now()}`, "width=600,height=700,scrollbars=yes");
    if (!popup) { toast.error("Popup blocked! Allow popups for this site."); return; }

    // Poll every 2s until popup closes or new connection appears
    const prevCount = connections.length;
    const poll = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(poll);
          const res  = await api.get("/email/connections");
          const conns = res.data?.connections || [];
          if (conns.length > prevCount) {
            setConnections(conns);
            const newest = conns[conns.length - 1];
            toast.success(`✓ ${newest?.email_address || provider} connected!`);
          } else {
            toast.error("OAuth cancelled or failed. Try again.");
          }
          return;
        }
        const res   = await api.get("/email/connections");
        const conns = res.data?.connections || [];
        if (conns.length > prevCount) {
          setConnections(conns);
          clearInterval(poll);
          popup.close();
          const newest = conns[conns.length - 1];
          toast.success(`✓ ${newest?.email_address || provider} connected!`);
        }
      } catch { /* ignore cross-origin errors during redirect */ }
    }, 2000);

    setTimeout(() => { clearInterval(poll); if (!popup.closed) popup.close(); }, 180000);
  }, [connections.length]);

  const handleDisconnect = async (provider, emailAddress) => {
    if (!window.confirm(`Disconnect ${emailAddress}?`)) return;
    try {
      await api.delete(`/email/connections/${provider}/${encodeURIComponent(emailAddress)}`);
      setConnections(prev =>
        prev.filter(c => !(c.provider === provider && c.email_address === emailAddress))
      );
      toast.success(`${emailAddress} disconnected`);
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleFetchEvents = async () => {
    if (connections.length === 0) { toast.error("Connect at least one email account first"); return; }
    setFetching(true);
    setErrors([]);
    try {
      const params: Record<string, any> = { days_back: daysBack, max_emails: 100 };
      if (filterAccount !== "all") params.account = filterAccount;

      const res = await api.get("/email/fetch-events", { params });
      setEvents(res.data?.events || []);
      setErrors(res.data?.errors || []);
      setStep("events");
      const count = res.data?.events?.length || 0;
      if (count === 0) {
        toast.info(`No event emails found in the last ${daysBack} days.`);
      } else {
        toast.success(`✓ Found ${count} event${count !== 1 ? "s" : ""} across ${res.data?.accounts_scanned?.length || 1} account(s)`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to fetch events");
    } finally {
      setFetching(false);
    }
  };

  const handleSelectEvent = (event) => {
    onSelectEvent(event);
    toast.success("✓ Event imported — form auto-filled");
    onClose();
  };

  // Group connections by provider for display
  const googleConns    = connections.filter(c => c.provider === "google");
  const microsoftConns = connections.filter(c => c.provider === "microsoft");
  const imapConns      = connections.filter(c => c.method === "imap");

  const filteredEvents = events
    .filter(e => filterType === "all" || e.event_type === filterType)
    .filter(e => filterAccount === "all" || e.source_account === filterAccount);

  const eventTypes    = [...new Set(events.map(e => e.event_type))];
  const eventAccounts = [...new Set(events.map(e => e.source_account).filter(Boolean))];

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(7,15,30,0.72)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
        initial={{ scale: 0.93, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.93, y: 24 }}
        transition={spring}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue} 0%, ${C.mediumBlue} 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
              <Inbox className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-none">Import from Email</h2>
              <p className="text-blue-200 text-xs mt-0.5">
                {connections.length > 0
                  ? `${connections.length} account${connections.length !== 1 ? "s" : ""} connected`
                  : mode === "reminder" ? "Extract meetings & hearings → auto-fill reminder" : "Extract visits → auto-fill visit form"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {["accounts", "events"].map((s, i) => (
              <button key={s}
                onClick={() => step === "events" && setStep(s)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  backgroundColor: step === s ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                  color: step === s ? "white" : "rgba(255,255,255,0.6)",
                }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ backgroundColor: step === s ? "white" : "rgba(255,255,255,0.2)", color: step === s ? C.deepBlue : "white" }}>
                  {i + 1}
                </span>
                {s === "accounts" ? "Accounts" : "Events"}
              </button>
            ))}
            <button onClick={onClose}
              className="ml-2 w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center active:scale-90 transition-all">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ─── STEP 1: Accounts ─────────────────────────────────── */}
            {step === "accounts" && (
              <motion.div key="accounts" variants={fadeUp} initial="hidden" animate="visible" exit="exit"
                className="p-6 space-y-5">

                {/* Privacy notice */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    <strong>Privacy:</strong> We only read subjects & bodies to extract event dates.
                    No emails are stored — only extracted event data.
                  </p>
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-4">

                    {/* ── GMAIL SECTION ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gmail</p>
                        <span className="text-xs text-slate-400">{googleConns.length} connected</span>
                      </div>

                      {/* Connected Gmail accounts */}
                      {googleConns.map(conn => (
                        <ConnectedAccountRow key={conn.email_address} conn={conn}
                          onDisconnect={handleDisconnect} />
                      ))}

                      {/* Add another Gmail account */}
                      {!showGmailHintInput ? (
                        <button
                          onClick={() => setShowGmailHintInput(true)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                          {googleConns.length === 0 ? "Connect Gmail account" : "Add another Gmail account"}
                        </button>
                      ) : (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className="p-3 rounded-xl border border-red-100 bg-red-50 space-y-2">
                          <p className="text-xs text-slate-600">
                            Enter the Gmail address you want to connect (optional — helps pre-select the account):
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={addGmailHint}
                              onChange={e => setAddGmailHint(e.target.value)}
                              placeholder="email@gmail.com (optional)"
                              className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                            <Button
                              onClick={() => {
                                setShowGmailHintInput(false);
                                handleOAuthConnect("google", addGmailHint);
                                setAddGmailHint("");
                              }}
                              className="h-9 px-4 rounded-xl text-sm font-bold text-white"
                              style={{ backgroundColor: "#EA4335" }}
                            >
                              Connect
                            </Button>
                            <Button variant="outline" onClick={() => setShowGmailHintInput(false)}
                              className="h-9 px-3 rounded-xl text-sm">
                              Cancel
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* ── OUTLOOK SECTION ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outlook / Hotmail</p>
                        <span className="text-xs text-slate-400">{microsoftConns.length} connected</span>
                      </div>

                      {microsoftConns.map(conn => (
                        <ConnectedAccountRow key={conn.email_address} conn={conn}
                          onDisconnect={handleDisconnect} />
                      ))}

                      {!showOutlookHintInput ? (
                        <button
                          onClick={() => setShowOutlookHintInput(true)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-blue-200 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                          {microsoftConns.length === 0 ? "Connect Outlook account" : "Add another Outlook account"}
                        </button>
                      ) : (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          className="p-3 rounded-xl border border-blue-100 bg-blue-50 space-y-2">
                          <p className="text-xs text-slate-600">
                            Enter the Outlook address (optional):
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={addOutlookHint}
                              onChange={e => setAddOutlookHint(e.target.value)}
                              placeholder="email@outlook.com (optional)"
                              className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                            <Button
                              onClick={() => {
                                setShowOutlookHintInput(false);
                                handleOAuthConnect("microsoft", addOutlookHint);
                                setAddOutlookHint("");
                              }}
                              className="h-9 px-4 rounded-xl text-sm font-bold text-white"
                              style={{ backgroundColor: "#0078D4" }}
                            >
                              Connect
                            </Button>
                            <Button variant="outline" onClick={() => setShowOutlookHintInput(false)}
                              className="h-9 px-3 rounded-xl text-sm">
                              Cancel
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {/* ── IMAP SECTION ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Yahoo / Custom IMAP</p>
                        <span className="text-xs text-slate-400">{imapConns.length} connected</span>
                      </div>

                      {imapConns.map(conn => (
                        <ConnectedAccountRow key={conn.email_address} conn={conn}
                          onDisconnect={handleDisconnect} />
                      ))}

                      {["yahoo", "other"].map(provId => {
                        const meta = PROVIDER_META[provId];
                        const isOpen = showIMAPForm === provId;
                        return (
                          <div key={provId}>
                            <button
                              onClick={() => setShowIMAPForm(isOpen ? null : provId)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm transition-colors"
                              style={{
                                borderColor: meta.color + "50",
                                color: meta.color,
                              }}
                            >
                              <PlusCircle className="w-4 h-4" />
                              Add {meta.label} account
                            </button>
                            <AnimatePresence>
                              {isOpen && (
                                <IMAPConnectForm
                                  key={provId}
                                  providerId={provId}
                                  onSuccess={() => { setShowIMAPForm(null); loadConnections(); }}
                                  onCancel={() => setShowIMAPForm(null)}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {/* Scan settings */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-600">Scan last</span>
                  <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>

                  {connections.length > 1 && (
                    <>
                      <span className="text-sm text-slate-600">from</span>
                      <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="all">All accounts</option>
                        {connections.map(c => (
                          <option key={c.email_address} value={c.email_address}>{c.email_address}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                {/* CTA */}
                <Button
                  onClick={handleFetchEvents}
                  disabled={fetching || connections.length === 0}
                  className="w-full h-11 text-sm font-bold text-white rounded-xl active:scale-[0.98] transition-all"
                  style={{
                    background: connections.length === 0
                      ? "#9CA3AF"
                      : `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})`,
                  }}
                >
                  {fetching
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Scanning {connections.length} account{connections.length !== 1 ? "s" : ""}…</>
                    : <><Zap className="w-4 h-4 mr-2" />Scan {connections.length} Account{connections.length !== 1 ? "s" : ""} for Events</>
                  }
                </Button>
                {connections.length === 0 && (
                  <p className="text-center text-xs text-slate-400">Connect at least one email account above</p>
                )}
              </motion.div>
            )}

            {/* ─── STEP 2: Events ───────────────────────────────────── */}
            {step === "events" && (
              <motion.div key="events" variants={fadeUp} initial="hidden" animate="visible" exit="exit"
                className="p-6 space-y-4">

                {errors.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-800 mb-1">Some accounts had issues:</p>
                    {errors.map((e, i) => <p key={i} className="text-xs text-amber-700">{e}</p>)}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-700 flex-1">
                    {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
                  </p>

                  <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    <option value="all">All types</option>
                    {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  {eventAccounts.length > 1 && (
                    <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="all">All accounts</option>
                      {eventAccounts.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  )}

                  <button onClick={handleFetchEvents} disabled={fetching}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 active:scale-95 transition-all">
                    {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Rescan
                  </button>

                  <button onClick={() => setStep("accounts")}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 active:scale-95 transition-all">
                    Accounts
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Click any event to auto-fill the {mode === "reminder" ? "reminder" : "visit"} form
                </p>

                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Mail className="w-10 h-10 text-slate-200" />
                    <div className="text-center">
                      <p className="font-semibold text-slate-600">No events detected</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Try increasing the scan window or check that emails mention dates explicitly.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setStep("accounts")} className="rounded-xl">
                      Adjust settings
                    </Button>
                  </div>
                ) : (
                  <motion.div
                    className="space-y-2 max-h-[420px] overflow-y-auto pr-1"
                    variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
                    initial="hidden" animate="visible"
                  >
                    {filteredEvents.map((event, idx) => (
                      <EventCard
                        key={`${event.title}-${event.date}-${event.source_account}-${idx}`}
                        event={event} mode={mode} onSelect={handleSelectEvent}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
