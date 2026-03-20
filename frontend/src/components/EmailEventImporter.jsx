import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isPast } from "date-fns";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Mail, X, RefreshCw, Loader2, CheckCircle2,
  Clock, MapPin, User, Calendar, ChevronRight, Zap,
  Link2, Unlink, Plus, Shield, Eye, EyeOff, Inbox,
} from "lucide-react";

// ── Brand palette ─────────────────────────────────────────────────────────────
const C = {
  deepBlue:   "#0D3B66",
  mediumBlue: "#1F6FB2",
  emerald:    "#1FAF5A",
  amber:      "#F59E0B",
  red:        "#EF4444",
};

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: "google",
    label: "Gmail",
    icon: "G",
    color: "#EA4335",
    bg: "#FEF2F2",
    method: "oauth",
    description: "Sign in with Google",
  },
  {
    id: "microsoft",
    label: "Outlook / Hotmail",
    icon: "M",
    color: "#0078D4",
    bg: "#EFF6FF",
    method: "oauth",
    description: "Sign in with Microsoft",
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    icon: "Y",
    color: "#720E9E",
    bg: "#F5F3FF",
    method: "imap",
    imap_host: "imap.mail.yahoo.com",
    description: "Use App Password",
  },
  {
    id: "other",
    label: "Other / Custom IMAP",
    icon: "@",
    color: "#374151",
    bg: "#F9FAFB",
    method: "imap",
    description: "Any IMAP email server",
  },
];

const URGENCY_COLORS = {
  urgent: { bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" },
  high:   { bg: "#FFF7ED", text: "#9A3412", border: "#FED7AA" },
  medium: { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
  low:    { bg: "#F0FDF4", text: "#166534", border: "#BBF7D0" },
};

const TYPE_ICONS = {
  meeting:  "📅",
  hearing:  "⚖️",
  visit:    "🏢",
  deadline: "⏰",
  court:    "🏛️",
  other:    "📌",
};

const spring = { type: "spring", stiffness: 280, damping: 24 };
const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

// ── Helper: get stored JWT token ──────────────────────────────────────────────
function getStoredToken() {
  // Try common storage keys used by the app
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
// SUB-COMPONENTS
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
      style={{
        borderColor: urgencyStyle.border,
        backgroundColor: urgencyStyle.bg,
        opacity: isPastDate ? 0.65 : 1,
      }}
      onClick={() => onSelect(event)}
    >
      {/* Type + urgency row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 15 }}>{TYPE_ICONS[event.event_type] || "📌"}</span>
          <span
            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ color: urgencyStyle.text, backgroundColor: urgencyStyle.border }}
          >
            {event.urgency}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
            style={{ color: "#374151", borderColor: "#D1D5DB", backgroundColor: "#F9FAFB" }}
          >
            {event.event_type}
          </span>
        </div>
        {isPastDate && (
          <span className="text-[10px] font-bold text-red-500">past date</span>
        )}
      </div>

      {/* Title */}
      <p className="font-bold text-sm text-slate-800 leading-snug mb-2 pr-6">{event.title}</p>

      {/* Meta grid */}
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

      {/* CTA arrow */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white"
          style={{ backgroundColor: C.deepBlue }}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── IMAP Connect Form ────────────────────────────────────────────────────────
function IMAPConnectForm({ providerId, onSuccess, onCancel }) {
  const meta = PROVIDERS.find(p => p.id === providerId) || {};
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [host, setHost]           = useState(meta.imap_host || "");
  const [port, setPort]           = useState(993);
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);

  const handleConnect = async () => {
    if (!email || !password) {
      toast.error("Email and app password are required");
      return;
    }
    setLoading(true);
    try {
      await api.post("/email/connect/imap", {
        provider: providerId,
        email_address: email,
        app_password: password,
        imap_host: host || undefined,
        imap_port: port,
      });
      toast.success(`✓ ${meta.label || providerId} connected successfully`);
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
      className="mt-3 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
    >
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        Connect {meta.label}
      </p>

      {providerId === "yahoo" && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>Yahoo:</strong> Go to Yahoo Security → Generate App Password → use that here (not your Yahoo login password).
        </div>
      )}
      {providerId === "other" && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          Enter your IMAP server host. Most providers use port 993 with SSL.
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
          Email Address
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
          App Password
        </label>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="16-character app password"
            className="w-full px-3 py-2 pr-9 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => setShowPass(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {providerId === "other" && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
              IMAP Host
            </label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="imap.example.com"
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
              Port
            </label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 rounded-xl text-sm h-9"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConnect}
          disabled={loading}
          className="flex-1 rounded-xl text-sm h-9 text-white font-semibold"
          style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Connecting…</>
            : "Connect"
          }
        </Button>
      </div>
    </motion.div>
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
  const [connectingProvider, setConnectingProvider] = useState(null);
  const [errors, setErrors]               = useState([]);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await api.get("/email/connections");
      setConnections(res.data?.connections || []);
    } catch (err) {
      console.error("Failed to load email connections:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── KEY FIX: pass JWT token as query param so popup can authenticate ────────
  const handleOAuthConnect = (provider) => {
    const token = getStoredToken();
    if (!token) {
      toast.error("Session token not found. Please log in again.");
      return;
    }

    const backendBase =
      import.meta.env.VITE_API_URL?.replace("/api", "") ||
      "https://final-taskosphere-backend.onrender.com";

    // Pass token as query param — the backend reads it from Query(...) instead
    // of the Authorization header (which popups cannot send)
    const url = `${backendBase}/api/email/auth/${provider}?token=${encodeURIComponent(token)}`;

    const popup = window.open(url, "emailOAuth", "width=600,height=700,scrollbars=yes");

    if (!popup) {
      toast.error("Popup blocked! Please allow popups for this site and try again.");
      return;
    }

    // Poll every 2s — check if popup closed (OAuth done) or connection appeared
    const poll = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(poll);
          const res = await api.get("/email/connections");
          const conns = res.data?.connections || [];
          const found = conns.find(c => c.provider === provider);
          if (found) {
            setConnections(conns);
            toast.success(`✓ ${provider === "google" ? "Gmail" : "Outlook"} connected!`);
          } else {
            toast.error("OAuth cancelled or failed. Please try again.");
          }
          return;
        }
        // Also check while popup is still open (in case redirect closes it)
        const res = await api.get("/email/connections");
        const conns = res.data?.connections || [];
        const found = conns.find(c => c.provider === provider);
        if (found) {
          setConnections(conns);
          clearInterval(poll);
          popup.close();
          toast.success(`✓ ${provider === "google" ? "Gmail" : "Outlook"} connected!`);
        }
      } catch {
        // Ignore cross-origin popup access errors while redirecting
      }
    }, 2000);

    // Give up after 3 minutes
    setTimeout(() => {
      clearInterval(poll);
      if (!popup.closed) popup.close();
    }, 180000);
  };

  const handleDisconnect = async (provider) => {
    if (!window.confirm(`Disconnect ${provider}?`)) return;
    try {
      await api.delete(`/email/connections/${provider}`);
      setConnections(prev => prev.filter(c => c.provider !== provider));
      toast.success(`${provider} disconnected`);
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleFetchEvents = async () => {
    if (connections.length === 0) {
      toast.error("Connect at least one email account first");
      return;
    }
    setFetching(true);
    setErrors([]);
    try {
      const res = await api.get("/email/fetch-events", {
        params: { days_back: daysBack, max_emails: 100 },
      });
      setEvents(res.data?.events || []);
      setErrors(res.data?.errors || []);
      setStep("events");
      if ((res.data?.events || []).length === 0) {
        toast.info(`No event emails found in the last ${daysBack} days.`);
      } else {
        toast.success(`✓ Found ${res.data.events.length} event${res.data.events.length !== 1 ? "s" : ""}`);
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

  const filteredEvents = filterType === "all"
    ? events
    : events.filter(e => e.event_type === filterType);

  const eventTypes = [...new Set(events.map(e => e.event_type))];

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
              <h2 className="text-base font-bold text-white leading-none">
                Import from Email
              </h2>
              <p className="text-blue-200 text-xs mt-0.5">
                {mode === "reminder"
                  ? "Extract meetings & hearings → auto-fill reminder"
                  : "Extract visits & meetings → auto-fill visit form"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Step pills */}
            {["accounts", "events"].map((s, i) => (
              <button
                key={s}
                onClick={() => step === "events" && setStep(s)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  backgroundColor: step === s ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                  color: step === s ? "white" : "rgba(255,255,255,0.6)",
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{
                    backgroundColor: step === s ? "white" : "rgba(255,255,255,0.2)",
                    color: step === s ? C.deepBlue : "white",
                  }}
                >
                  {i + 1}
                </span>
                {s === "accounts" ? "Accounts" : "Events"}
              </button>
            ))}
            <button
              onClick={onClose}
              className="ml-2 w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center active:scale-90 transition-all"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* ─── STEP 1: Accounts ─────────────────────────────────────── */}
            {step === "accounts" && (
              <motion.div
                key="accounts"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="p-6 space-y-4"
              >
                {/* Privacy notice */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    <strong>Privacy:</strong> We only read email subjects and bodies to extract
                    event dates. No emails are stored — only extracted event data.
                  </p>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* OAuth providers */}
                    {PROVIDERS.filter(p => p.method === "oauth").map(prov => {
                      const conn = connections.find(c => c.provider === prov.id);
                      return (
                        <div
                          key={prov.id}
                          className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                          style={{
                            borderColor: conn ? C.emerald + "50" : "#E5E7EB",
                            backgroundColor: conn ? "#F0FDF4" : prov.bg,
                          }}
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ backgroundColor: prov.color }}
                          >
                            {prov.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{prov.label}</p>
                            <p className="text-xs text-slate-400">
                              {conn
                                ? `Connected ${conn.connected_at ? format(parseISO(conn.connected_at), "MMM d") : ""}`
                                : prov.description}
                            </p>
                          </div>
                          {conn ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                              </span>
                              <button
                                onClick={() => handleDisconnect(prov.id)}
                                className="text-xs text-red-500 hover:text-red-700 underline"
                              >
                                Disconnect
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleOAuthConnect(prov.id)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white active:scale-95 transition-all hover:opacity-90"
                              style={{ backgroundColor: prov.color }}
                            >
                              <Link2 className="w-3.5 h-3.5" /> Connect
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* IMAP providers */}
                    {PROVIDERS.filter(p => p.method === "imap").map(prov => {
                      const conn = connections.find(c => c.provider === prov.id);
                      const isExpanding = connectingProvider === prov.id;
                      return (
                        <div key={prov.id}>
                          <div
                            className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                            style={{
                              borderColor: conn ? C.emerald + "50" : "#E5E7EB",
                              backgroundColor: conn ? "#F0FDF4" : prov.bg,
                            }}
                          >
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                              style={{ backgroundColor: prov.color }}
                            >
                              {prov.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800">{prov.label}</p>
                              <p className="text-xs text-slate-400">
                                {conn
                                  ? `${conn.email_address || "Connected"} · IMAP`
                                  : prov.description}
                              </p>
                            </div>
                            {conn ? (
                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                                </span>
                                <button
                                  onClick={() => handleDisconnect(prov.id)}
                                  className="text-xs text-red-500 hover:text-red-700 underline"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConnectingProvider(isExpanding ? null : prov.id)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white active:scale-95 transition-all hover:opacity-90"
                                style={{ backgroundColor: prov.color }}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {isExpanding ? "Cancel" : "Add"}
                              </button>
                            )}
                          </div>
                          <AnimatePresence>
                            {isExpanding && (
                              <IMAPConnectForm
                                key={prov.id}
                                providerId={prov.id}
                                onSuccess={() => {
                                  setConnectingProvider(null);
                                  loadConnections();
                                }}
                                onCancel={() => setConnectingProvider(null)}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Scan settings */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-600">Scan last</span>
                  <select
                    value={daysBack}
                    onChange={e => setDaysBack(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
                  <span className="text-sm text-slate-600">of emails</span>
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
                  {fetching ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Scanning emails…</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" />Scan & Extract Events ({connections.length} account{connections.length !== 1 ? "s" : ""})</>
                  )}
                </Button>
                {connections.length === 0 && (
                  <p className="text-center text-xs text-slate-400">
                    Connect at least one email account above to scan
                  </p>
                )}
              </motion.div>
            )}

            {/* ─── STEP 2: Events ───────────────────────────────────────── */}
            {step === "events" && (
              <motion.div
                key="events"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="p-6 space-y-4"
              >
                {/* Provider errors */}
                {errors.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-800 mb-1">Some accounts had issues:</p>
                    {errors.map((e, i) => (
                      <p key={i} className="text-xs text-amber-700">{e}</p>
                    ))}
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-700 flex-1">
                    {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} found
                    {filterType !== "all" ? ` (${filterType})` : ""}
                  </p>

                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="all">All types</option>
                    {eventTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <button
                    onClick={handleFetchEvents}
                    disabled={fetching}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    {fetching
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />
                    }
                    Rescan
                  </button>

                  <button
                    onClick={() => setStep("accounts")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
                  >
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
                    initial="hidden"
                    animate="visible"
                  >
                    {filteredEvents.map((event, idx) => (
                      <EventCard
                        key={`${event.title}-${event.date}-${idx}`}
                        event={event}
                        mode={mode}
                        onSelect={handleSelectEvent}
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
