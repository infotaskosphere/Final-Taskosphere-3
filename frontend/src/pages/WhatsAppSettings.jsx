/**
 * WhatsAppSettings.jsx
 * 
 * WhatsApp integration page:
 *  - Admin: Connect via QR scan, manage user access requests, view message logs
 *  - Non-admin: Request access, view own message history
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext.jsx";
import {
  MessageCircle, QrCode, CheckCircle2, XCircle, AlertCircle,
  Loader2, RefreshCw, LogOut, Users, Clock, Send, Shield,
  ChevronDown, ChevronUp, Phone, Eye, BarChart3, Ban,
  UserCheck, UserX, Wifi, WifiOff, History, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

// ─── Design Tokens ───────────────────────────────────────────────────────────

const C = {
  bg:      "#0a0f1e",
  card:    "#111827",
  raised:  "#1a2236",
  border:  "#1e3a5f",
  accent:  "#25D366",   // WhatsApp green
  accentDark: "#128C7E",
  text:    "#f0f4f8",
  muted:   "#8fa3bf",
  dimmer:  "#546a82",
  danger:  "#ef4444",
  warn:    "#f59e0b",
  info:    "#3b82f6",
};

const fade = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4, ease: [0.23,1,0.32,1] } }),
};

const TYPE_COLORS = {
  dsc:        { bg: "#1e3a5f", text: "#60a5fa", label: "DSC" },
  compliance: { bg: "#2d1b69", text: "#a78bfa", label: "Compliance" },
  birthday:   { bg: "#1f3a2b", text: "#34d399", label: "Birthday" },
  general:    { bg: "#1f2937", text: "#9ca3af", label: "General" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (s) => {
  try { return format(parseISO(s), "dd MMM yyyy, hh:mm a"); }
  catch { return s || "—"; }
};

const StatusBadge = ({ connected }) =>
  connected ? (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      background:"rgba(37,211,102,0.15)", color:C.accent, borderRadius:20,
      padding:"3px 12px", fontSize:13, fontWeight:600, border:`1px solid rgba(37,211,102,0.3)` }}>
      <Wifi size={12}/> Connected
    </span>
  ) : (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      background:"rgba(239,68,68,0.12)", color:"#ef4444", borderRadius:20,
      padding:"3px 12px", fontSize:13, fontWeight:600, border:`1px solid rgba(239,68,68,0.25)` }}>
      <WifiOff size={12}/> Disconnected
    </span>
  );

// ─── QR Panel ─────────────────────────────────────────────────────────────────

function QRPanel({ onConnected }) {
  const [qr, setQr] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const startConnection = async () => {
    setLoading(true);
    try {
      await api.post("/whatsapp/connect");
      pollForQR();
    } catch {
      toast.error("Failed to start WhatsApp connection");
      setLoading(false);
    }
  };

  const pollForQR = useCallback(() => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { data } = await api.get("/whatsapp/qr");
        if (data.status === "already_connected") {
          clearInterval(pollRef.current);
          setQr(null);
          setLoading(false);
          onConnected?.();
          return;
        }
        if (data.qr) {
          setQr(data.qr);
          setLoading(false);
        }
      } catch { /* ignore */ }
      if (attempts > 60) {
        clearInterval(pollRef.current);
        setLoading(false);
        toast.error("QR code timed out. Try again.");
      }
    }, 2000);
  }, [onConnected]);

  // Poll for connection status after QR appears
  useEffect(() => {
    if (!qr) return;
    const statusPoll = setInterval(async () => {
      try {
        const { data } = await api.get("/whatsapp/status");
        if (data.connected) {
          clearInterval(statusPoll);
          setQr(null);
          onConnected?.();
          toast.success("WhatsApp connected successfully!");
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(statusPoll);
  }, [qr, onConnected]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:24, padding:"32px 0" }}>
      {!qr && !loading && (
        <Button
          onClick={startConnection}
          style={{ background:C.accent, color:"#000", fontWeight:700, fontSize:15,
            padding:"12px 32px", borderRadius:12, border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", gap:8 }}
        >
          <QrCode size={18}/> Generate QR Code
        </Button>
      )}

      {loading && !qr && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
          <Loader2 size={32} color={C.accent} style={{ animation:"spin 1s linear infinite" }}/>
          <p style={{ color:C.muted, fontSize:14 }}>Starting WhatsApp session…</p>
        </div>
      )}

      {qr && (
        <motion.div initial={{scale:0.85,opacity:0}} animate={{scale:1,opacity:1}}
          style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          <div style={{ background:"#fff", padding:16, borderRadius:16,
            boxShadow:"0 0 40px rgba(37,211,102,0.3)" }}>
            <img src={qr} alt="WhatsApp QR" style={{ width:240, height:240, display:"block" }}/>
          </div>
          <p style={{ color:C.muted, fontSize:13, textAlign:"center", maxWidth:280 }}>
            Open WhatsApp on your phone → Linked Devices → Link a Device → scan this QR code
          </p>
          <p style={{ color:C.accent, fontSize:12, animation:"pulse 2s infinite" }}>
            Waiting for scan…
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ─── Access Requests Panel (Admin) ───────────────────────────────────────────

function AccessRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/whatsapp/access/requests?status_filter=${filter}`);
      setRequests(data);
    } catch { toast.error("Failed to load requests"); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (userId, approved) => {
    try {
      await api.post("/whatsapp/access/decide", { user_id: userId, approved });
      toast.success(approved ? "Access approved!" : "Request rejected");
      load();
    } catch { toast.error("Failed to process request"); }
  };

  const revoke = async (userId) => {
    try {
      await api.delete(`/whatsapp/access/revoke/${userId}`);
      toast.success("Access revoked");
      load();
    } catch { toast.error("Failed to revoke access"); }
  };

  const FILTERS = ["pending", "approved", "rejected", "revoked"];

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:"5px 14px", borderRadius:20, border:"1px solid",
              borderColor: filter===f ? C.accent : C.border,
              background: filter===f ? "rgba(37,211,102,0.15)" : "transparent",
              color: filter===f ? C.accent : C.muted, cursor:"pointer", fontSize:12,
              textTransform:"capitalize", fontWeight: filter===f ? 600 : 400 }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:32 }}>
          <Loader2 size={24} color={C.muted} style={{ animation:"spin 1s linear infinite" }}/>
        </div>
      ) : requests.length === 0 ? (
        <p style={{ color:C.dimmer, textAlign:"center", padding:32, fontSize:14 }}>
          No {filter} requests
        </p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {requests.map((r, i) => (
            <motion.div key={r.id} custom={i} variants={fade} initial="hidden" animate="visible"
              style={{ background:C.raised, borderRadius:12, padding:"14px 18px",
                border:`1px solid ${C.border}`, display:"flex", alignItems:"flex-start",
                justifyContent:"space-between", gap:12 }}>
              <div>
                <p style={{ color:C.text, fontWeight:600, fontSize:14, margin:0 }}>{r.user_name}</p>
                <p style={{ color:C.muted, fontSize:12, margin:"3px 0" }}>{r.user_email}</p>
                <p style={{ color:C.dimmer, fontSize:12, margin:"4px 0",
                  fontStyle:"italic", maxWidth:360 }}>"{r.reason}"</p>
                <p style={{ color:C.dimmer, fontSize:11, margin:0 }}>
                  Requested: {fmtDate(r.requested_at)}
                  {r.decided_by && ` · Decided by ${r.decided_by}`}
                </p>
                {r.admin_note && (
                  <p style={{ color:C.warn, fontSize:12, marginTop:4 }}>Note: {r.admin_note}</p>
                )}
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                {r.status === "pending" && (
                  <>
                    <button onClick={() => decide(r.user_id, true)}
                      style={{ background:"rgba(37,211,102,0.15)", color:C.accent,
                        border:`1px solid rgba(37,211,102,0.3)`, borderRadius:8,
                        padding:"6px 12px", cursor:"pointer", fontSize:12,
                        display:"flex", alignItems:"center", gap:4, fontWeight:600 }}>
                      <UserCheck size={13}/> Approve
                    </button>
                    <button onClick={() => decide(r.user_id, false)}
                      style={{ background:"rgba(239,68,68,0.1)", color:"#ef4444",
                        border:`1px solid rgba(239,68,68,0.25)`, borderRadius:8,
                        padding:"6px 12px", cursor:"pointer", fontSize:12,
                        display:"flex", alignItems:"center", gap:4, fontWeight:600 }}>
                      <UserX size={13}/> Reject
                    </button>
                  </>
                )}
                {r.status === "approved" && (
                  <button onClick={() => revoke(r.user_id)}
                    style={{ background:"rgba(245,158,11,0.1)", color:C.warn,
                      border:`1px solid rgba(245,158,11,0.25)`, borderRadius:8,
                      padding:"6px 12px", cursor:"pointer", fontSize:12,
                      display:"flex", alignItems:"center", gap:4, fontWeight:600 }}>
                    <Ban size={13}/> Revoke
                  </button>
                )}
                {(r.status === "rejected" || r.status === "revoked") && (
                  <span style={{ color:C.dimmer, fontSize:12, padding:"6px 0", textTransform:"capitalize" }}>
                    {r.status}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Message History ─────────────────────────────────────────────────────────

function MessageHistory({ isAdmin }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = typeFilter ? `?message_type=${typeFilter}` : "";
      const { data } = await api.get(`/whatsapp/messages${q}`);
      setMessages(data);
    } catch { toast.error("Failed to load messages"); }
    finally { setLoading(false); }
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const TYPES = ["", "dsc", "compliance", "birthday", "general"];

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{ padding:"5px 14px", borderRadius:20, border:"1px solid",
              borderColor: typeFilter===t ? C.info : C.border,
              background: typeFilter===t ? "rgba(59,130,246,0.15)" : "transparent",
              color: typeFilter===t ? C.info : C.muted,
              cursor:"pointer", fontSize:12, fontWeight: typeFilter===t ? 600 : 400 }}>
            {t || "All"}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft:"auto", background:"transparent",
          border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px",
          color:C.muted, cursor:"pointer", fontSize:12,
          display:"flex", alignItems:"center", gap:4 }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:32 }}>
          <Loader2 size={24} color={C.muted} style={{ animation:"spin 1s linear infinite" }}/>
        </div>
      ) : messages.length === 0 ? (
        <p style={{ color:C.dimmer, textAlign:"center", padding:32, fontSize:14 }}>
          No messages found
        </p>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {messages.map((m, i) => {
            const typeConf = TYPE_COLORS[m.message_type] || TYPE_COLORS.general;
            return (
              <motion.div key={m.id} custom={i} variants={fade} initial="hidden" animate="visible"
                style={{ background:C.raised, borderRadius:10, padding:"12px 16px",
                  border:`1px solid ${C.border}`, display:"grid",
                  gridTemplateColumns:"1fr auto", gap:8 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ background:typeConf.bg, color:typeConf.text,
                      borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                      {typeConf.label}
                    </span>
                    <span style={{ color:C.muted, fontSize:12 }}>
                      <Phone size={10} style={{ marginRight:3 }}/>{m.to}
                    </span>
                    {isAdmin && m.sent_by && m.sent_by !== "system" && (
                      <span style={{ color:C.dimmer, fontSize:11 }}>via {m.sent_by}</span>
                    )}
                  </div>
                  <p style={{ color:C.text, fontSize:13, margin:0,
                    whiteSpace:"pre-wrap", wordBreak:"break-word",
                    maxHeight:60, overflow:"hidden" }}>
                    {m.message.length > 120 ? m.message.slice(0,120)+"…" : m.message}
                  </p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", marginBottom:4 }}>
                    {m.status === "sent"
                      ? <CheckCircle2 size={13} color={C.accent}/>
                      : <XCircle size={13} color={C.danger}/>}
                    <span style={{ color: m.status==="sent" ? C.accent : C.danger, fontSize:11, fontWeight:600 }}>
                      {m.status}
                    </span>
                  </div>
                  <p style={{ color:C.dimmer, fontSize:11, margin:0 }}>{fmtDate(m.sent_at)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Access Request Form (Non-admin) ─────────────────────────────────────────

function AccessRequestForm({ myStatus, onRefresh }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return toast.error("Please explain why you need WhatsApp access");
    setLoading(true);
    try {
      const { data } = await api.post("/whatsapp/access/request", { reason });
      toast.success(data.message || "Request submitted");
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to submit request");
    } finally { setLoading(false); }
  };

  if (myStatus?.status === "pending") return (
    <div style={{ background:"rgba(245,158,11,0.08)", border:`1px solid rgba(245,158,11,0.25)`,
      borderRadius:12, padding:"20px 24px", display:"flex", alignItems:"center", gap:12 }}>
      <Clock size={20} color={C.warn}/>
      <div>
        <p style={{ color:C.warn, fontWeight:600, margin:0, fontSize:14 }}>Request Pending</p>
        <p style={{ color:C.muted, margin:"3px 0 0", fontSize:13 }}>
          Your access request is waiting for admin approval.
        </p>
      </div>
    </div>
  );

  if (myStatus?.status === "approved") return (
    <div style={{ background:"rgba(37,211,102,0.08)", border:`1px solid rgba(37,211,102,0.25)`,
      borderRadius:12, padding:"20px 24px", display:"flex", alignItems:"center", gap:12 }}>
      <CheckCircle2 size={20} color={C.accent}/>
      <div>
        <p style={{ color:C.accent, fontWeight:600, margin:0, fontSize:14 }}>Access Approved</p>
        <p style={{ color:C.muted, margin:"3px 0 0", fontSize:13 }}>
          You can send WhatsApp messages via the app.
        </p>
      </div>
    </div>
  );

  if (myStatus?.status === "rejected") return (
    <div style={{ background:"rgba(239,68,68,0.08)", border:`1px solid rgba(239,68,68,0.2)`,
      borderRadius:12, padding:"20px 24px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <XCircle size={18} color={C.danger}/>
        <p style={{ color:C.danger, fontWeight:600, margin:0, fontSize:14 }}>Request Rejected</p>
      </div>
      {myStatus?.admin_note && (
        <p style={{ color:C.muted, fontSize:13, margin:"0 0 12px" }}>
          Admin note: {myStatus.admin_note}
        </p>
      )}
      <p style={{ color:C.dimmer, fontSize:13, margin:0 }}>
        Contact your admin if you believe this is a mistake.
      </p>
    </div>
  );

  return (
    <div style={{ background:C.raised, borderRadius:12, padding:"24px",
      border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <Lock size={18} color={C.info}/>
        <h3 style={{ color:C.text, margin:0, fontSize:15, fontWeight:600 }}>
          Request WhatsApp Access
        </h3>
      </div>
      <p style={{ color:C.muted, fontSize:13, marginBottom:16 }}>
        WhatsApp sending is restricted. Explain why you need access and an admin will review your request.
      </p>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. I manage client compliance reminders and need to send birthday wishes directly…"
        style={{ width:"100%", minHeight:90, background:C.card, border:`1px solid ${C.border}`,
          borderRadius:8, padding:"10px 12px", color:C.text, fontSize:13, resize:"vertical",
          outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
      />
      <button onClick={submit} disabled={loading}
        style={{ marginTop:12, background:C.info, color:"#fff", border:"none",
          borderRadius:8, padding:"9px 20px", cursor:loading?"not-allowed":"pointer",
          fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6,
          opacity:loading?0.7:1 }}>
        {loading ? <Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> : <Send size={14}/>}
        Submit Request
      </button>
    </div>
  );
}

// ─── Scheduler Panel (Admin) ─────────────────────────────────────────────────

function SchedulerPanel() {
  const [jobs, setJobs] = useState([]);
  const [running, setRunning] = useState({});
  const [loadingJobs, setLoadingJobs] = useState(true);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const { data } = await api.get("/whatsapp/jobs/schedule");
      setJobs(data);
    } catch { /* bridge may be offline */ }
    finally { setLoadingJobs(false); }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const runJob = async (jobName) => {
    setRunning(r => ({ ...r, [jobName]: true }));
    try {
      await api.post(`/whatsapp/jobs/run/${jobName}`);
      toast.success(`Job '${jobName}' completed`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Job '${jobName}' failed`);
    } finally {
      setRunning(r => ({ ...r, [jobName]: false }));
    }
  };

  const JOB_META = [
    {
      key: "birthday",
      label: "Birthday Wishes",
      desc: "Sends WhatsApp birthday greetings to clients & contacts whose birthday is today.",
      scheduled: "Daily 9:00 AM IST",
      icon: "🎂",
    },
    {
      key: "dsc_expiry",
      label: "DSC Expiry Alerts",
      desc: "Alerts clients about DSC certificates expiring in 7 days or 1 day.",
      scheduled: "Daily 9:30 AM IST",
      icon: "🔑",
    },
    {
      key: "compliance",
      label: "Compliance Reminders",
      desc: "Reminds clients about compliance tasks due in 7 days or 1 day.",
      scheduled: "Daily 10:00 AM IST",
      icon: "📋",
    },
  ];

  return (
    <div style={{ background:C.card, borderRadius:14, padding:"24px 28px",
      border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <BarChart3 size={18} color={C.info}/>
          <h2 style={{ color:C.text, margin:0, fontSize:17, fontWeight:600 }}>
            Scheduled Notifications
          </h2>
        </div>
        <button onClick={loadJobs} style={{ background:"transparent",
          border:`1px solid ${C.border}`, borderRadius:8, padding:"5px 10px",
          color:C.muted, cursor:"pointer", display:"flex", alignItems:"center", gap:4, fontSize:12 }}>
          <RefreshCw size={11}/> Refresh
        </button>
      </div>
      <p style={{ color:C.muted, fontSize:13, marginBottom:24 }}>
        These jobs run automatically every day. Use "Run Now" to trigger a job manually for testing.
      </p>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {JOB_META.map((job, i) => {
          const scheduled = jobs.find(j => j.id === `wa_${job.key === "birthday" ? "birthday_wishes" : job.key === "dsc_expiry" ? "dsc_expiry_alerts" : "compliance_reminders"}`);
          const isRunning = running[job.key];
          return (
            <motion.div key={job.key} custom={i} variants={fade} initial="hidden" animate="visible"
              style={{ background:C.raised, borderRadius:12, padding:"16px 20px",
                border:`1px solid ${C.border}`, display:"flex",
                alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <span style={{ fontSize:20 }}>{job.icon}</span>
                  <p style={{ color:C.text, fontWeight:600, fontSize:14, margin:0 }}>{job.label}</p>
                  <span style={{ background:"rgba(37,211,102,0.12)", color:C.accent,
                    borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:500 }}>
                    Auto
                  </span>
                </div>
                <p style={{ color:C.muted, fontSize:12, margin:"0 0 6px" }}>{job.desc}</p>
                <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                  <span style={{ color:C.dimmer, fontSize:11, display:"flex", alignItems:"center", gap:4 }}>
                    <Clock size={10}/> {job.scheduled}
                  </span>
                  {scheduled?.next_run && (
                    <span style={{ color:C.dimmer, fontSize:11 }}>
                      Next: {fmtDate(scheduled.next_run)}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => runJob(job.key)} disabled={isRunning}
                style={{ background:"rgba(59,130,246,0.12)", color:C.info,
                  border:`1px solid rgba(59,130,246,0.25)`, borderRadius:8,
                  padding:"8px 16px", cursor:isRunning?"not-allowed":"pointer",
                  fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6,
                  opacity:isRunning?0.6:1, flexShrink:0, whiteSpace:"nowrap" }}>
                {isRunning
                  ? <><Loader2 size={12} style={{ animation:"spin 1s linear infinite" }}/> Running…</>
                  : <><Send size={12}/> Run Now</>}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function WhatsAppSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [status, setStatus] = useState(null);
  const [myAccess, setMyAccess] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [activeTab, setActiveTab] = useState(isAdmin ? "connection" : "access");
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [statusRes, accessRes] = await Promise.all([
        api.get("/whatsapp/status"),
        api.get("/whatsapp/access/my-status"),
      ]);
      setStatus(statusRes.data);
      setMyAccess(accessRes.data);
    } catch { /* ignore */ }
    finally { setLoadingStatus(false); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post("/whatsapp/disconnect");
      toast.success("WhatsApp disconnected");
      loadStatus();
    } catch { toast.error("Failed to disconnect"); }
    finally { setDisconnecting(false); }
  };

  const TABS = isAdmin
    ? [
        { id: "connection", label: "Connection", icon: QrCode },
        { id: "access",     label: "User Access", icon: Users },
        { id: "scheduler",  label: "Scheduler",   icon: BarChart3 },
        { id: "history",    label: "Message Log",  icon: History },
      ]
    : [
        { id: "access",  label: "My Access",      icon: Shield },
        { id: "history", label: "My Messages",    icon: History },
      ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, padding:"32px 24px",
      fontFamily:"'DM Sans', system-ui, sans-serif", color:C.text }}>

      {/* Header */}
      <motion.div initial={{opacity:0,y:-12}} animate={{opacity:1,y:0}} transition={{duration:0.4}}
        style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:6 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:"rgba(37,211,102,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center",
            border:`1.5px solid rgba(37,211,102,0.3)` }}>
            <MessageCircle size={22} color={C.accent}/>
          </div>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:C.text }}>
              WhatsApp Integration
            </h1>
            <p style={{ margin:0, color:C.muted, fontSize:13 }}>
              QR-based connection · No Meta API required
            </p>
          </div>
          {!loadingStatus && status && (
            <div style={{ marginLeft:"auto" }}>
              <StatusBadge connected={status.connected}/>
            </div>
          )}
        </div>
      </motion.div>

      {/* Status Card (admin only) */}
      {isAdmin && !loadingStatus && status && (
        <motion.div custom={0} variants={fade} initial="hidden" animate="visible"
          style={{ background:C.card, borderRadius:14, padding:"20px 24px",
            border:`1px solid ${C.border}`, marginBottom:24,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
            {status.connected ? (
              <>
                <div>
                  <p style={{ color:C.muted, fontSize:11, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:1 }}>Connected Number</p>
                  <p style={{ color:C.text, fontSize:15, fontWeight:600, margin:0 }}>
                    +{status.phone_number || "Unknown"}
                  </p>
                </div>
                <div>
                  <p style={{ color:C.muted, fontSize:11, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:1 }}>Display Name</p>
                  <p style={{ color:C.text, fontSize:15, fontWeight:600, margin:0 }}>{status.display_name || "—"}</p>
                </div>
                <div>
                  <p style={{ color:C.muted, fontSize:11, margin:"0 0 2px", textTransform:"uppercase", letterSpacing:1 }}>Connected At</p>
                  <p style={{ color:C.dimmer, fontSize:13, margin:0 }}>{fmtDate(status.connected_at)}</p>
                </div>
              </>
            ) : (
              <p style={{ color:C.dimmer, fontSize:14, margin:0 }}>
                No WhatsApp number connected. Scan QR to link a WhatsApp account.
              </p>
            )}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            {status.connected && (
              <button onClick={disconnect} disabled={disconnecting}
                style={{ background:"rgba(239,68,68,0.1)", color:C.danger,
                  border:`1px solid rgba(239,68,68,0.25)`, borderRadius:8,
                  padding:"8px 16px", cursor:"pointer", fontSize:13,
                  display:"flex", alignItems:"center", gap:6, fontWeight:600,
                  opacity:disconnecting?0.6:1 }}>
                {disconnecting ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }}/> : <LogOut size={13}/>}
                Disconnect
              </button>
            )}
            <button onClick={loadStatus}
              style={{ background:"transparent", color:C.muted,
                border:`1px solid ${C.border}`, borderRadius:8,
                padding:"8px 12px", cursor:"pointer", fontSize:13,
                display:"flex", alignItems:"center", gap:5 }}>
              <RefreshCw size={13}/> Refresh
            </button>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:`1px solid ${C.border}`,
        paddingBottom:0 }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding:"10px 18px", background:"transparent", border:"none",
                borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                color: active ? C.accent : C.muted, cursor:"pointer", fontSize:13,
                fontWeight: active ? 600 : 400, display:"flex", alignItems:"center", gap:6,
                transition:"all 0.2s", marginBottom:-1 }}>
              <Icon size={14}/> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
          exit={{opacity:0,y:-6}} transition={{duration:0.25}}>

          {/* CONNECTION TAB (Admin) */}
          {activeTab === "connection" && isAdmin && (
            <div style={{ background:C.card, borderRadius:14, padding:"28px 32px",
              border:`1px solid ${C.border}`, maxWidth:580 }}>
              <h2 style={{ color:C.text, margin:"0 0 6px", fontSize:17, fontWeight:600 }}>
                {status?.connected ? "Re-connect WhatsApp" : "Connect WhatsApp"}
              </h2>
              <p style={{ color:C.muted, fontSize:13, marginBottom:24 }}>
                Scan the QR code with your phone's WhatsApp app to link the account.
                The session persists across restarts via local storage.
              </p>
              <QRPanel onConnected={loadStatus}/>
            </div>
          )}

          {/* ACCESS TAB */}
          {activeTab === "access" && (
            <div>
              {isAdmin ? (
                <div style={{ background:C.card, borderRadius:14, padding:"24px 28px",
                  border:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                    <Shield size={18} color={C.info}/>
                    <h2 style={{ color:C.text, margin:0, fontSize:17, fontWeight:600 }}>
                      User Access Requests
                    </h2>
                  </div>
                  <p style={{ color:C.muted, fontSize:13, marginBottom:20 }}>
                    Non-admin users must request access to send WhatsApp messages.
                    Review and approve or reject requests below.
                  </p>
                  <AccessRequestsPanel/>
                </div>
              ) : (
                <div style={{ maxWidth:560 }}>
                  <AccessRequestForm myStatus={myAccess} onRefresh={loadStatus}/>
                </div>
              )}
            </div>
          )}

          {/* SCHEDULER TAB (Admin) */}
          {activeTab === "scheduler" && isAdmin && (
            <SchedulerPanel />
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div style={{ background:C.card, borderRadius:14, padding:"24px 28px",
              border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <History size={18} color={C.info}/>
                <h2 style={{ color:C.text, margin:0, fontSize:17, fontWeight:600 }}>
                  {isAdmin ? "All Message History" : "My WhatsApp Messages"}
                </h2>
              </div>
              <MessageHistory isAdmin={isAdmin}/>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      <style>{`
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        * { scrollbar-width:thin; scrollbar-color:${C.border} transparent; }
      `}</style>
    </div>
  );
}
