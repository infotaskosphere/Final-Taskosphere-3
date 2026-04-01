/**
 * IdentixAttendance.jsx  — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from previous version:
 *  1. Fixed modal — full-height scrollable, all form fields visible
 *  2. NEW: "Scan LAN" button — auto-discovers ZKTeco/Identix devices on the
 *     local network by querying the backend /identix/devices/scan endpoint.
 *  3. Discovered devices can be added with one click (pre-fills the form).
 *  4. Real-time scan progress bar with device count as they are found.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  LayoutDashboard, Users, Monitor, ClipboardList,
  RefreshCw, Plus, Trash2, Edit2, Wifi, WifiOff,
  CheckCircle, AlertTriangle, Clock, UserCheck,
  Fingerprint, Building2, Calendar, Search, X, Save,
  ChevronLeft, ChevronRight, Activity, Shield, Radar,
  Loader2, Zap, Network,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ─── Brand colours (match DashboardLayout) ──────────────────────────────────
const C = {
  deepBlue:   "#0D3B66",
  medBlue:    "#1F6FB2",
  green:      "#059669",
  red:        "#ef4444",
  amber:      "#d97706",
  purple:     "#7c3aed",
  slate:      "#64748b",
  bg:         "#f8fafc",
  border:     "#e2e8f0",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  try { return format(parseISO(iso), "MMM dd, yyyy  hh:mm a"); }
  catch { return iso || "—"; }
};

const pill = (bg, color, text) => (
  <span style={{
    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: bg, color,
  }}>{text}</span>
);

const StatusBadge = ({ ok, labels = ["Active", "Inactive"] }) =>
  pill(ok ? "#d1fae5" : "#fee2e2", ok ? "#065f46" : "#991b1b", ok ? labels[0] : labels[1]);

const ThumbBadge = ({ enrolled }) =>
  pill(enrolled ? "#dbeafe" : "#fef9c3", enrolled ? "#1e40af" : "#92400e",
    enrolled ? "✓ Enrolled" : "⚠ Pending Thumb");

const StatCard = ({ label, value, color, icon: Icon }) => (
  <div style={{
    background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
    padding: "20px 24px", flex: 1, minWidth: 150,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{
        width: 36, height: 36, borderRadius: 8,
        background: color + "1a", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={18} color={color} />
      </span>
      <span style={{ fontSize: 13, color: C.slate }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}>{value ?? "—"}</div>
  </div>
);

// ─── Input style ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", padding: "9px 12px", border: `1.5px solid ${C.border}`,
  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", background: "#fff", transition: "border-color 0.15s",
};

// ─── Button ──────────────────────────────────────────────────────────────────
function Btn({ onClick, disabled, loading, color = C.deepBlue, children, variant = "solid", small, fullWidth }) {
  const bg        = variant === "solid" ? color : "transparent";
  const textColor = variant === "solid" ? "#fff" : color;
  const border    = variant === "outline" ? `1.5px solid ${color}` : "none";
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      background:  disabled ? "#e2e8f0" : bg,
      color:       disabled ? "#94a3b8" : textColor,
      border:      disabled ? "none" : border,
      borderRadius: 8,
      padding:     small ? "6px 12px" : "9px 18px",
      fontSize:    small ? 13 : 14,
      fontWeight:  600,
      cursor:      disabled ? "not-allowed" : "pointer",
      display:     "inline-flex", alignItems: "center", gap: 6,
      opacity:     loading ? 0.72 : 1,
      width:       fullWidth ? "100%" : undefined,
      justifyContent: fullWidth ? "center" : undefined,
      transition:  "all 0.15s",
    }}>
      {loading && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
      {children}
    </button>
  );
}

// ─── Modal (fixed — no longer cuts off content) ───────────────────────────────
function Modal({ open, onClose, title, children, width = 520 }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 9900, display: "flex", alignItems: "flex-start",
      justifyContent: "center", overflowY: "auto", padding: "40px 16px",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: width,
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        position: "relative",
      }} onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`,
          position: "sticky", top: 0, background: "#fff", borderRadius: "16px 16px 0 0", zIndex: 1,
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{title}</h3>
          <button onClick={onClose} style={{
            background: "#f1f5f9", border: "none", cursor: "pointer",
            width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={16} color={C.slate} />
          </button>
        </div>
        {/* Scrollable body */}
        <div style={{ padding: "20px 24px 24px", overflowY: "auto", maxHeight: "calc(90vh - 80px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: C.slate, marginLeft: 6 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LAN SCANNER PANEL
// ═════════════════════════════════════════════════════════════════════════════
function LanScanner({ onAddDevice }) {
  const [scanning,   setScanning]   = useState(false);
  const [progress,   setProgress]   = useState(0);       // 0-100
  const [found,      setFound]      = useState([]);       // discovered devices
  const [scanStatus, setScanStatus] = useState("");
  const [subnet,     setSubnet]     = useState("");       // e.g. 192.168.1
  const [port,       setPort]       = useState(4370);
  const pollRef = useRef(null);

  const startScan = async () => {
    setScanning(true);
    setFound([]);
    setProgress(0);
    setScanStatus("Starting scan…");

    try {
      // POST to backend — backend scans asynchronously and returns a scan_id
      const { data } = await api.post("/identix/devices/scan", {
        subnet: subnet || null,
        port,
      });

      const scanId = data.scan_id;
      setScanStatus(data.message || "Scanning…");

      // Poll for results every 1.5 s
      pollRef.current = setInterval(async () => {
        try {
          const { data: status } = await api.get(`/identix/devices/scan/${scanId}`);
          setProgress(status.progress ?? 0);
          setFound(status.found ?? []);
          setScanStatus(status.message ?? "Scanning…");

          if (status.done) {
            clearInterval(pollRef.current);
            setScanning(false);
            if (!status.found?.length) {
              setScanStatus("Scan complete — no ZKTeco devices found on this subnet.");
            } else {
              setScanStatus(`Scan complete — ${status.found.length} device(s) found!`);
            }
          }
        } catch {
          clearInterval(pollRef.current);
          setScanning(false);
          setScanStatus("Scan polling failed.");
        }
      }, 1500);
    } catch (e) {
      setScanning(false);
      setScanStatus(e?.response?.data?.detail || "Scan failed. Check backend connection.");
      toast.error("LAN scan failed");
    }
  };

  // Cleanup on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{
      background: "linear-gradient(135deg, #eff6ff, #f0fdf4)",
      border: `1.5px solid #bfdbfe`,
      borderRadius: 14, padding: 22, marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: C.deepBlue,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Radar size={18} color="#fff" />
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Auto-Discover Devices</p>
          <p style={{ margin: 0, fontSize: 12, color: C.slate }}>
            Scans your LAN for ZKTeco / Identix machines on port {port}
          </p>
        </div>
      </div>

      {/* Config row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 180px", minWidth: 160 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 4 }}>
            SUBNET (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. 192.168.1  (auto-detected if empty)"
            value={subnet}
            onChange={e => setSubnet(e.target.value)}
            disabled={scanning}
            style={{ ...inputStyle, fontSize: 13 }}
          />
        </div>
        <div style={{ width: 100 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 4 }}>
            PORT
          </label>
          <input
            type="number"
            value={port}
            onChange={e => setPort(Number(e.target.value))}
            disabled={scanning}
            style={{ ...inputStyle, fontSize: 13 }}
          />
        </div>
        <Btn onClick={startScan} disabled={scanning} loading={scanning} color={C.deepBlue}>
          {scanning ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Scanning…</> : <><Radar size={14} /> Scan LAN</>}
        </Btn>
      </div>

      {/* Progress bar */}
      {(scanning || progress > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.slate }}>{scanStatus}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.deepBlue }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: "#dbeafe", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progress}%`, borderRadius: 99,
              background: `linear-gradient(90deg, ${C.deepBlue}, ${C.medBlue})`,
              transition: "width 0.4s ease",
            }} />
          </div>
          {found.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: C.green, fontWeight: 600 }}>
              ✓ {found.length} device(s) discovered so far…
            </p>
          )}
        </div>
      )}

      {!scanning && scanStatus && progress === 0 && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.slate }}>{scanStatus}</p>
      )}

      {/* Discovered device cards */}
      {found.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            Discovered Devices
          </p>
          {found.map((d, i) => (
            <div key={i} style={{
              background: "#fff", border: `1px solid #bbf7d0`,
              borderRadius: 10, padding: "12px 16px",
              display: "flex", justifyContent: "space-between",
              alignItems: "center", flexWrap: "wrap", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: "#d1fae5",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Wifi size={15} color={C.green} />
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                    {d.ip_address}:{d.port}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: C.slate }}>
                    {d.device_info
                      ? `S/N: ${d.device_info.serialNumber} · FW: ${d.device_info.firmware} · Users: ${d.device_info.userCount}`
                      : "ZKTeco device detected"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {d.already_registered ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, padding: "6px 12px", background: "#f1f5f9", borderRadius: 8 }}>
                    Already Registered
                  </span>
                ) : (
                  <Btn
                    onClick={() => onAddDevice(d)}
                    color={C.green} small
                  >
                    <Plus size={13} /> Add This Device
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!scanning && progress === 100 && found.length === 0 && (
        <div style={{
          background: "#fff7ed", border: "1px solid #fed7aa",
          borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e",
        }}>
          <AlertTriangle size={14} style={{ marginRight: 6 }} />
          No ZKTeco devices found. Make sure the machine is powered on, connected to the same
          network, and port {port} is not blocked by a firewall.
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
function DashboardTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/attendance/summary");
      setSummary(data);
    } catch {
      toast.error("Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
          Today's Attendance — {summary?.date || "Loading…"}
        </h2>
        <Btn onClick={load} loading={loading} variant="outline" color={C.medBlue} small>
          <RefreshCw size={14} /> Refresh
        </Btn>
      </div>

      {loading && !summary ? (
        <div style={{ color: "#94a3b8", padding: 48, textAlign: "center" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
          <p>Loading stats…</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
            <StatCard label="Total Employees"   value={summary?.totalEmployees}          color={C.medBlue}  icon={Users}         />
            <StatCard label="Present Today"     value={summary?.totalPresent}            color={C.green}    icon={CheckCircle}   />
            <StatCard label="Absent"            value={summary?.totalAbsent}             color={C.red}      icon={AlertTriangle} />
            <StatCard label="Pending Thumb"     value={summary?.pendingThumbEnrollment}  color={C.amber}    icon={Fingerprint}   />
          </div>

          {summary?.byDepartment?.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>By Department</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {summary.byDepartment.map(d => (
                  <div key={d.department || "—"} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#374151", minWidth: 140 }}>{d.department || "Unassigned"}</span>
                    <div style={{ flex: 1, height: 10, background: "#f1f5f9", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 10, background: "#3b82f6", transition: "width 0.5s",
                        width: `${Math.min(100, (d.present / (summary.totalEmployees || 1)) * 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.green, minWidth: 72 }}>
                      {d.present} present
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Recent Punches</h3>
            {!summary?.recentActivity?.length ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 24 }}>No punches recorded yet</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.bg}` }}>
                      {["Employee", "Department", "Punch Time", "Type", "Device"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: C.slate, fontWeight: 600, fontSize: 13 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentActivity.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${C.bg}` }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.user_name || "—"}</td>
                        <td style={{ padding: "10px 12px", color: C.slate }}>{r.department || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>{fmtTime(r.punch_time)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          {pill(r.punch_type === "in" ? "#d1fae5" : "#fee2e2",
                                r.punch_type === "in" ? "#065f46" : "#991b1b",
                                r.punch_type === "in" ? "Punch In" : "Punch Out")}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.slate }}>{r.device_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: ATTENDANCE LOGS
// ═════════════════════════════════════════════════════════════════════════════
function AttendanceTab() {
  const [records, setRecords] = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({ from_date: "", to_date: "", department: "" });
  const LIMIT = 50;

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = { page: p, limit: LIMIT };
      if (filters.from_date)  params.from_date  = filters.from_date;
      if (filters.to_date)    params.to_date    = filters.to_date;
      if (filters.department) params.department = filters.department;
      const { data } = await api.get("/identix/attendance", { params });
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch {
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(1); }, [filters]);
  useEffect(() => { load(page); }, [page]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/identix/attendance/sync", {});
      toast.success(`${data.message} (${data.newRecords} new records)`);
      load(1);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed. Check device connection.");
    } finally {
      setSyncing(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
          Attendance Records
          <span style={{ fontSize: 14, color: C.slate, fontWeight: 400, marginLeft: 8 }}>({total} total)</span>
        </h2>
        <Btn onClick={handleSync} loading={syncing} color={C.green}>
          <RefreshCw size={15} /> Sync From Device
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "FROM DATE", key: "from_date", type: "date", width: 160 },
          { label: "TO DATE",   key: "to_date",   type: "date", width: 160 },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: "block", marginBottom: 4 }}>{f.label}</label>
            <input type={f.type} value={filters[f.key]} style={{ ...inputStyle, width: f.width }}
              onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: "block", marginBottom: 4 }}>DEPARTMENT</label>
          <input type="text" placeholder="e.g. Engineering" value={filters.department} style={{ ...inputStyle, width: 180 }}
            onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} />
        </div>
        {(filters.from_date || filters.to_date || filters.department) && (
          <div style={{ alignSelf: "flex-end" }}>
            <Btn onClick={() => setFilters({ from_date: "", to_date: "", department: "" })} variant="outline" color={C.red} small>
              <X size={13} /> Clear
            </Btn>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
              {["Employee", "Department", "Punch Time", "Type", "Source", "Device"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: C.slate, fontWeight: 600, fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
              </td></tr>
            ) : !records.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>
                No records found. Click "Sync From Device" to import.
              </td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.bg}` }}>
                <td style={{ padding: "11px 16px", fontWeight: 600 }}>{r.user_name || "—"}</td>
                <td style={{ padding: "11px 16px", color: C.slate }}>{r.department || "—"}</td>
                <td style={{ padding: "11px 16px" }}>{fmtTime(r.punch_time)}</td>
                <td style={{ padding: "11px 16px" }}>
                  {pill(r.punch_type === "in" ? "#d1fae5" : "#fee2e2",
                        r.punch_type === "in" ? "#065f46" : "#991b1b",
                        r.punch_type === "in" ? "In" : "Out")}
                </td>
                <td style={{ padding: "11px 16px" }}>{pill("#ede9fe", "#5b21b6", "Machine")}</td>
                <td style={{ padding: "11px 16px", color: C.slate }}>{r.device_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
          <Btn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" color={C.medBlue} small>
            <ChevronLeft size={14} /> Prev
          </Btn>
          <span style={{ fontSize: 14, color: C.slate }}>Page {page} of {totalPages}</span>
          <Btn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} variant="outline" color={C.medBlue} small>
            Next <ChevronRight size={14} />
          </Btn>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: USERS
// ═════════════════════════════════════════════════════════════════════════════
function UsersTab() {
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [syncingId, setSyncingId] = useState(null);
  const [thumbId,   setThumbId]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/users");
      setUsers(data.users || []);
    } catch { toast.error("Failed to load users"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markThumb = async (userId) => {
    setThumbId(userId);
    try {
      await api.patch(`/identix/users/${userId}/thumb-enrolled`);
      toast.success("Thumb enrollment marked complete");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, thumb_enrolled: true } : u));
    } catch { toast.error("Failed to update"); }
    finally { setThumbId(null); }
  };

  const syncToDevice = async (userId, name) => {
    setSyncingId(userId);
    try {
      await api.post(`/identix/users/${userId}/sync-to-device`);
      toast.success(`${name} pushed to device`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Sync failed"); }
    finally { setSyncingId(null); }
  };

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>User Enrollment Status</h2>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…" style={{ ...inputStyle, paddingLeft: 32, width: 220 }} />
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
              {["Name", "Role / Dept", "Device UID", "Device Enrolment", "Thumb Status", "Actions"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: C.slate, fontWeight: 600, fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
              </td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${C.bg}` }}>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                  <div style={{ fontSize: 12, color: C.slate }}>{u.email}</div>
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ textTransform: "capitalize", color: "#374151" }}>{u.role}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{u.departments?.join(", ") || "—"}</div>
                </td>
                <td style={{ padding: "11px 16px", color: C.slate, fontFamily: "monospace" }}>
                  {u.identix_uid ?? <span style={{ color: "#94a3b8" }}>Not assigned</span>}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <StatusBadge ok={u.identix_enrolled} labels={["Synced", "Not Synced"]} />
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <ThumbBadge enrolled={u.thumb_enrolled} />
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!u.thumb_enrolled && (
                      <Btn onClick={() => markThumb(u.id)} loading={thumbId === u.id} color={C.green} small>
                        <Fingerprint size={13} /> Mark Thumb Done
                      </Btn>
                    )}
                    <Btn onClick={() => syncToDevice(u.id, u.full_name)} loading={syncingId === u.id} variant="outline" color={C.medBlue} small>
                      <RefreshCw size={13} /> Push to Device
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: DEVICES  (with LAN scanner + fixed form)
// ═════════════════════════════════════════════════════════════════════════════
const emptyDevice = {
  name: "", ip_address: "", port: 4370, comm_password: "0",
  serial_number: "", location: "", description: "",
};

function DevicesTab() {
  const [devices,     setDevices]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [form,        setForm]        = useState(emptyDevice);
  const [saving,      setSaving]      = useState(false);
  const [testingId,   setTestingId]   = useState(null);
  const [testResults, setTestResults] = useState({});
  const [syncingId,   setSyncingId]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/devices");
      setDevices(data.devices || []);
    } catch { toast.error("Failed to load devices"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew  = (prefill = {}) => { setEditing(null);  setForm({ ...emptyDevice, ...prefill }); setShowModal(true); };
  const openEdit = (d)            => { setEditing(d);     setForm({ ...d });                        setShowModal(true); };

  // Called when user clicks "Add This Device" from LAN scanner
  const handleDiscoveredDevice = (discovered) => {
    openNew({
      ip_address: discovered.ip_address,
      port:       discovered.port ?? 4370,
      name:       discovered.device_info?.serialNumber
                    ? `Identix (${discovered.ip_address})`
                    : `Device @ ${discovered.ip_address}`,
      serial_number: discovered.device_info?.serialNumber || "",
    });
  };

  const save = async () => {
    if (!form.name?.trim() || !form.ip_address?.trim()) {
      toast.error("Device Name and IP Address are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/identix/devices/${editing.id}`, form);
        toast.success("Device updated successfully");
      } else {
        await api.post("/identix/devices", form);
        toast.success("Device added successfully");
      }
      setShowModal(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete device "${d.name}"?`)) return;
    try {
      await api.delete(`/identix/devices/${d.id}`);
      toast.success("Device deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const testConn = async (d) => {
    setTestingId(d.id);
    setTestResults(prev => ({ ...prev, [d.id]: { testing: true } }));
    try {
      const { data } = await api.post(`/identix/devices/${d.id}/test`);
      setTestResults(prev => ({ ...prev, [d.id]: data }));
      if (data.success) toast.success(`✓ Connected to ${d.name}`);
      else              toast.error(`${d.name}: ${data.message}`);
    } catch { toast.error("Test failed"); }
    finally { setTestingId(null); }
  };

  const syncUsers = async (d) => {
    setSyncingId(d.id);
    try {
      const { data } = await api.post(`/identix/devices/${d.id}/sync-users`);
      toast.success(data.message);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed. Check device connection.");
    } finally {
      setSyncingId(null);
    }
  };

  const setField = (field, val) => setForm(f => ({ ...f, [field]: val }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Identix Devices</h2>
        <Btn onClick={() => openNew()} color={C.deepBlue}>
          <Plus size={15} /> Add Device Manually
        </Btn>
      </div>

      {/* ── LAN AUTO-DISCOVERY ── */}
      <LanScanner onAddDevice={handleDiscoveredDevice} />

      {/* ── REGISTERED DEVICES ── */}
      {loading ? (
        <div style={{ color: "#94a3b8", textAlign: "center", padding: 48 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
        </div>
      ) : !devices.length ? (
        <div style={{
          background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 60, textAlign: "center", color: "#94a3b8",
        }}>
          <Monitor size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No devices registered yet</div>
          <div style={{ fontSize: 14 }}>Use the LAN scanner above or add a device manually.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {devices.map(d => {
            const tr = testResults[d.id];
            return (
              <div key={d.id} style={{
                background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
                padding: 20, display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", flexWrap: "wrap", gap: 16,
              }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Monitor size={20} color={C.medBlue} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                    <StatusBadge ok={d.is_active} />
                  </div>
                  <div style={{ fontSize: 13, color: C.slate, display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
                    <span>IP: <b>{d.ip_address}:{d.port}</b></span>
                    {d.location       && <span>📍 {d.location}</span>}
                    {d.serial_number  && <span>S/N: {d.serial_number}</span>}
                    {d.last_sync_at   && <span>Last sync: {fmtTime(d.last_sync_at)}</span>}
                  </div>
                  {/* Test result banner */}
                  {tr && !tr.testing && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                      background: tr.success ? "#d1fae5" : "#fee2e2",
                      color:      tr.success ? "#065f46" : "#991b1b",
                    }}>
                      {tr.success
                        ? `✓ Connected — S/N: ${tr.deviceInfo?.serialNumber}, Users: ${tr.deviceInfo?.userCount}, FW: ${tr.deviceInfo?.firmware}`
                        : `✗ ${tr.message}`}
                    </div>
                  )}
                  {tr?.testing && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.slate }}>
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Testing connection…
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
                  <Btn onClick={() => testConn(d)}  loading={testingId === d.id} variant="outline" color="#3b82f6" small>
                    <Wifi size={13} /> Test
                  </Btn>
                  <Btn onClick={() => syncUsers(d)} loading={syncingId === d.id} variant="outline" color={C.green} small>
                    <Users size={13} /> Sync Users
                  </Btn>
                  <Btn onClick={() => openEdit(d)} variant="outline" color="#374151" small>
                    <Edit2 size={13} /> Edit
                  </Btn>
                  <Btn onClick={() => remove(d)} variant="outline" color={C.red} small>
                    <Trash2 size={13} /> Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD / EDIT MODAL (FIXED — all fields visible) ═══ */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit Device" : "Add Identix Device"}
        width={560}
      >
        {/* Connection info section */}
        <div style={{
          background: "#f8fafc", border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "14px 16px", marginBottom: 20,
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Connection Details
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
            Ensure the device is on the same LAN. Default port is 4370.
          </p>
        </div>

        <FormField label="Device Name" hint="required">
          <input
            type="text"
            placeholder="e.g. Main Entrance, Office Gate"
            value={form.name}
            onChange={e => setField("name", e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </FormField>

        <FormField label="IP Address" hint="required">
          <input
            type="text"
            placeholder="e.g. 192.168.1.201"
            value={form.ip_address}
            onChange={e => setField("ip_address", e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <FormField label="Port">
              <input
                type="number"
                placeholder="4370"
                value={form.port}
                onChange={e => setField("port", Number(e.target.value))}
                style={inputStyle}
              />
            </FormField>
          </div>
          <div style={{ flex: 1 }}>
            <FormField label="Comm Password" hint="usually 0">
              <input
                type="text"
                placeholder="0"
                value={form.comm_password}
                onChange={e => setField("comm_password", e.target.value)}
                style={inputStyle}
              />
            </FormField>
          </div>
        </div>

        <FormField label="Location / Description">
          <input
            type="text"
            placeholder="e.g. Ground Floor Reception, Back Gate"
            value={form.location}
            onChange={e => setField("location", e.target.value)}
            style={inputStyle}
          />
        </FormField>

        <FormField label="Serial Number" hint="optional">
          <input
            type="text"
            placeholder="Found on device label or from Test Connection"
            value={form.serial_number}
            onChange={e => setField("serial_number", e.target.value)}
            style={inputStyle}
          />
        </FormField>

        {/* Active toggle for edits */}
        {editing && (
          <FormField label="Status">
            <div style={{ display: "flex", gap: 10 }}>
              {[true, false].map(v => (
                <button key={String(v)} onClick={() => setField("is_active", v)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                  border: `2px solid ${form.is_active === v ? (v ? C.green : C.red) : C.border}`,
                  background: form.is_active === v ? (v ? "#d1fae5" : "#fee2e2") : "#fff",
                  color: form.is_active === v ? (v ? "#065f46" : "#991b1b") : C.slate,
                }}>
                  {v ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <Btn onClick={() => setShowModal(false)} variant="outline" color={C.slate}>Cancel</Btn>
          <Btn onClick={save} loading={saving} color={C.deepBlue}>
            <Save size={14} /> {editing ? "Update Device" : "Add Device"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: "dashboard",  label: "Dashboard",        icon: LayoutDashboard },
  { id: "attendance", label: "Attendance Logs",  icon: ClipboardList   },
  { id: "users",      label: "User Enrollment",  icon: Users           },
  { id: "devices",    label: "Devices",          icon: Monitor         },
];

export default function IdentixAttendance() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (loading) return (
    <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>
      <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (!user || user.role !== "admin") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
      <Shield size={48} color={C.red} />
      <h2 style={{ margin: 0 }}>Admin Access Only</h2>
      <p style={{ color: C.slate }}>This page is restricted to administrators.</p>
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(13,59,102,0.3)",
          }}>
            <Fingerprint size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
              Identix Machine Integration
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: C.slate }}>
              Biometric punch machine — auto-discovery, sync &amp; attendance management
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${C.border}`, marginBottom: 28 }}>
        {TABS.map(tab => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 18px", fontSize: 14,
              fontWeight: active ? 700 : 500,
              color:      active ? C.deepBlue : C.slate,
              background: "none", border: "none", cursor: "pointer",
              borderBottom: active ? `2.5px solid ${C.deepBlue}` : "2.5px solid transparent",
              marginBottom: -2, transition: "all 0.15s",
            }}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "dashboard"  && <DashboardTab />}
          {activeTab === "attendance" && <AttendanceTab />}
          {activeTab === "users"      && <UsersTab />}
          {activeTab === "devices"    && <DevicesTab />}
        </motion.div>
      </AnimatePresence>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
