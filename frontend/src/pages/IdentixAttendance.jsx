/**
 * IdentixAttendance.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only Identix Biometric Punch Machine Integration Page
 * For Taskosphere — React + React Router v6 + Axios
 *
 * HOW TO INTEGRATE:
 * 1. Place this file in: frontend/src/pages/IdentixAttendance.jsx
 * 2. In AppRoutes.jsx, add these 2 lines:
 *
 *      const IdentixAttendance = lazy(() => import("@/pages/IdentixAttendance.jsx"));
 *
 *      // Inside <Routes> — admin-only:
 *      <Route path="/identix" element={
 *        <Permission permission="can_view_attendance">
 *          <PageLoader><IdentixAttendance /></PageLoader>
 *        </Permission>
 *      } />
 *
 * 3. In DashboardLayout.jsx (sidebar nav), add a menu item pointing to /identix
 *
 * FEATURES:
 * - Dashboard tab: today's attendance stats (present / absent / pending thumb)
 * - Attendance tab: full log from Identix machine with filters + Sync Now button
 * - Users tab: enrollment status per user, mark thumb enrolled, push to device
 * - Devices tab: add/edit/delete devices, test connection, bulk sync users
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  LayoutDashboard, Users, Monitor, ClipboardList,
  RefreshCw, Plus, Trash2, Edit2, Wifi, WifiOff,
  CheckCircle, AlertTriangle, Clock, UserCheck,
  Fingerprint, Building2, Calendar, Search, X, Save,
  ChevronLeft, ChevronRight, Activity, Shield,
} from "lucide-react";
import { format, parseISO } from "date-fns";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtTime = (iso) => {
  try { return format(parseISO(iso), "MMM dd, yyyy  hh:mm a"); }
  catch { return iso || "—"; }
};

const StatusBadge = ({ ok, labels = ["Active", "Inactive"] }) => (
  <span style={{
    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: ok ? "#d1fae5" : "#fee2e2",
    color: ok ? "#065f46" : "#991b1b",
  }}>
    {ok ? labels[0] : labels[1]}
  </span>
);

const ThumbBadge = ({ enrolled }) => (
  <span style={{
    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: enrolled ? "#dbeafe" : "#fef9c3",
    color: enrolled ? "#1e40af" : "#92400e",
  }}>
    {enrolled ? "✓ Enrolled" : "⚠ Pending Thumb"}
  </span>
);

const StatCard = ({ label, value, color, icon: Icon }) => (
  <div style={{
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
    padding: "20px 24px", flex: 1, minWidth: 150,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{
        width: 36, height: 36, borderRadius: 8,
        background: color + "1a", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={18} color={color} />
      </span>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 700, color: "#0f172a" }}>{value ?? "—"}</div>
  </div>
);

// ─── Simple Modal ────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 28, minWidth: 380, maxWidth: 520,
        width: "90%", maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color="#64748b" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db",
  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};

function Btn({ onClick, disabled, loading, color = "#1e40af", children, variant = "solid", small }) {
  const bg = variant === "solid" ? color : "transparent";
  const textColor = variant === "solid" ? "#fff" : color;
  const border = variant === "outline" ? `1.5px solid ${color}` : "none";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: disabled ? "#e2e8f0" : bg,
        color: disabled ? "#94a3b8" : textColor,
        border: disabled ? "none" : border,
        borderRadius: 8,
        padding: small ? "6px 12px" : "9px 18px",
        fontSize: small ? 13 : 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
        transition: "opacity 0.15s",
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading && <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />}
      {children}
    </button>
  );
}

// ─── TAB: DASHBOARD ─────────────────────────────────────────────────────────

function DashboardTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/attendance/summary");
      setSummary(data);
    } catch (e) {
      toast.error("Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // auto-refresh every 60s
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
          Today's Attendance — {summary?.date || "Loading..."}
        </h2>
        <Btn onClick={load} loading={loading} variant="outline" color="#1e40af" small>
          <RefreshCw size={14} /> Refresh
        </Btn>
      </div>

      {loading && !summary ? (
        <div style={{ color: "#94a3b8", padding: 40, textAlign: "center" }}>Loading stats...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
            <StatCard label="Total Employees" value={summary?.totalEmployees} color="#1e40af" icon={Users} />
            <StatCard label="Present Today" value={summary?.totalPresent} color="#059669" icon={CheckCircle} />
            <StatCard label="Absent" value={summary?.totalAbsent} color="#ef4444" icon={AlertTriangle} />
            <StatCard label="Pending Thumb" value={summary?.pendingThumbEnrollment} color="#d97706" icon={Fingerprint} />
          </div>

          {/* Department breakdown */}
          {summary?.byDepartment?.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>By Department</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {summary.byDepartment.map(d => (
                  <div key={d.department || "—"} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#374151", minWidth: 140 }}>{d.department || "Unassigned"}</span>
                    <div style={{
                      flex: 1, height: 10, background: "#f1f5f9", borderRadius: 10, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", width: `${Math.min(100, (d.present / (summary.totalEmployees || 1)) * 100)}%`,
                        background: "#3b82f6", borderRadius: 10, transition: "width 0.5s",
                      }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#059669", minWidth: 60 }}>
                      {d.present} present
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent punches */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Recent Punches</h3>
            {!summary?.recentActivity?.length ? (
              <div style={{ color: "#94a3b8", textAlign: "center", padding: 24 }}>No punches recorded yet</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f1f5f9" }}>
                    {["Employee", "Department", "Punch Time", "Type", "Device"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.recentActivity.map(r => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.user_name || "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>{r.department || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtTime(r.punch_time)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: r.punch_type === "in" ? "#d1fae5" : "#fee2e2",
                          color: r.punch_type === "in" ? "#065f46" : "#991b1b",
                        }}>
                          {r.punch_type === "in" ? "Punch In" : "Punch Out"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>{r.device_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB: ATTENDANCE LOGS ───────────────────────────────────────────────────

function AttendanceTab() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState({ from_date: "", to_date: "", department: "" });
  const LIMIT = 50;

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = { page: p, limit: LIMIT };
      if (filters.from_date) params.from_date = filters.from_date;
      if (filters.to_date) params.to_date = filters.to_date;
      if (filters.department) params.department = filters.department;
      const { data } = await api.get("/identix/attendance", { params });
      setRecords(data.records || []);
      setTotal(data.total || 0);
    } catch (e) {
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
          <span style={{ fontSize: 14, color: "#64748b", fontWeight: 400, marginLeft: 8 }}>({total} total)</span>
        </h2>
        <Btn onClick={handleSync} loading={syncing} color="#059669">
          <RefreshCw size={15} /> Sync From Device
        </Btn>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>FROM DATE</label>
          <input type="date" value={filters.from_date} style={{ ...inputStyle, width: 160 }}
            onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>TO DATE</label>
          <input type="date" value={filters.to_date} style={{ ...inputStyle, width: 160 }}
            onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600, display: "block", marginBottom: 4 }}>DEPARTMENT</label>
          <input type="text" placeholder="e.g. Engineering" value={filters.department} style={{ ...inputStyle, width: 180 }}
            onChange={e => setFilters(f => ({ ...f, department: e.target.value }))} />
        </div>
        {(filters.from_date || filters.to_date || filters.department) && (
          <div style={{ alignSelf: "flex-end" }}>
            <Btn onClick={() => setFilters({ from_date: "", to_date: "", department: "" })} variant="outline" color="#ef4444" small>
              <X size={13} /> Clear
            </Btn>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["Employee", "Department", "Punch Time", "Type", "Source", "Device"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: "#64748b", fontWeight: 600, fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading...</td></tr>
            ) : !records.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                No records found. Click "Sync From Device" to import.
              </td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "11px 16px", fontWeight: 600 }}>{r.user_name || "—"}</td>
                <td style={{ padding: "11px 16px", color: "#64748b" }}>{r.department || "—"}</td>
                <td style={{ padding: "11px 16px" }}>{fmtTime(r.punch_time)}</td>
                <td style={{ padding: "11px 16px" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: r.punch_type === "in" ? "#d1fae5" : "#fee2e2",
                    color: r.punch_type === "in" ? "#065f46" : "#991b1b",
                  }}>{r.punch_type === "in" ? "In" : "Out"}</span>
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: "#ede9fe", color: "#5b21b6",
                  }}>Machine</span>
                </td>
                <td style={{ padding: "11px 16px", color: "#64748b" }}>{r.device_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
          <Btn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" color="#1e40af" small>
            <ChevronLeft size={14} /> Prev
          </Btn>
          <span style={{ fontSize: 14, color: "#64748b" }}>Page {page} of {totalPages}</span>
          <Btn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} variant="outline" color="#1e40af" small>
            Next <ChevronRight size={14} />
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── TAB: USERS ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [syncingId, setSyncingId] = useState(null);
  const [thumbId, setThumbId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/users");
      setUsers(data.users || []);
    } catch (e) {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markThumb = async (userId) => {
    setThumbId(userId);
    try {
      await api.patch(`/identix/users/${userId}/thumb-enrolled`);
      toast.success("Thumb enrollment marked as complete");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, thumb_enrolled: true } : u));
    } catch (e) {
      toast.error("Failed to update");
    } finally {
      setThumbId(null);
    }
  };

  const syncToDevice = async (userId, name) => {
    setSyncingId(userId);
    try {
      await api.post(`/identix/users/${userId}/sync-to-device`);
      toast.success(`${name} pushed to device. Thumb enrollment pending at device.`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const filtered = users.filter(u =>
    !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>
          User Enrollment Status
        </h2>
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..." style={{ ...inputStyle, paddingLeft: 32, width: 220 }}
          />
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["Name", "Role / Dept", "Device UID", "Device Enrolment", "Thumb Status", "Actions"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: "#64748b", fontWeight: 600, fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading...</td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{u.email}</div>
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ textTransform: "capitalize", color: "#374151" }}>{u.role}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{u.departments?.join(", ") || "—"}</div>
                </td>
                <td style={{ padding: "11px 16px", color: "#64748b", fontFamily: "monospace" }}>
                  {u.identix_uid ?? <span style={{ color: "#94a3b8" }}>Not assigned</span>}
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <StatusBadge ok={u.identix_enrolled} labels={["Synced to Device", "Not Synced"]} />
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <ThumbBadge enrolled={u.thumb_enrolled} />
                </td>
                <td style={{ padding: "11px 16px" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!u.thumb_enrolled && (
                      <Btn onClick={() => markThumb(u.id)} loading={thumbId === u.id} color="#059669" small>
                        <Fingerprint size={13} /> Mark Thumb Done
                      </Btn>
                    )}
                    <Btn onClick={() => syncToDevice(u.id, u.full_name)} loading={syncingId === u.id} variant="outline" color="#1e40af" small>
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

// ─── TAB: DEVICES ────────────────────────────────────────────────────────────

const emptyDevice = { name: "", ip_address: "", port: 4370, comm_password: "0", serial_number: "", location: "" };

function DevicesTab() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = new
  const [form, setForm] = useState(emptyDevice);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [syncingId, setSyncingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/identix/devices");
      setDevices(data.devices || []);
    } catch (e) {
      toast.error("Failed to load devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyDevice); setShowModal(true); };
  const openEdit = (d) => { setEditing(d); setForm({ ...d }); setShowModal(true); };

  const save = async () => {
    if (!form.name || !form.ip_address) { toast.error("Name and IP Address are required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/identix/devices/${editing.id}`, form);
        toast.success("Device updated");
      } else {
        await api.post("/identix/devices", form);
        toast.success("Device added");
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
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const testConn = async (d) => {
    setTestingId(d.id);
    setTestResults(prev => ({ ...prev, [d.id]: null }));
    try {
      const { data } = await api.post(`/identix/devices/${d.id}/test`);
      setTestResults(prev => ({ ...prev, [d.id]: data }));
      if (data.success) toast.success(`Connected to ${d.name}`);
      else toast.error(`${d.name}: ${data.message}`);
    } catch (e) {
      toast.error("Test failed");
    } finally {
      setTestingId(null);
    }
  };

  const syncUsers = async (d) => {
    setSyncingId(d.id);
    try {
      const { data } = await api.post(`/identix/devices/${d.id}/sync-users`);
      toast.success(data.message);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Sync failed. Install pyzk or check device connection.");
    } finally {
      setSyncingId(null);
    }
  };

  const F = ({ label, field, type = "text", placeholder }) => (
    <FormField label={label}>
      <input
        type={type} placeholder={placeholder}
        value={form[field] ?? ""} style={inputStyle}
        onChange={e => setForm(f => ({ ...f, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
      />
    </FormField>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Identix Devices</h2>
        <Btn onClick={openNew} color="#1e40af">
          <Plus size={15} /> Add Device
        </Btn>
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>Loading devices...</div>
      ) : !devices.length ? (
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          padding: 60, textAlign: "center", color: "#94a3b8",
        }}>
          <Monitor size={40} color="#cbd5e1" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No devices registered</div>
          <div style={{ fontSize: 14 }}>Add your Identix biometric device to get started</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {devices.map(d => {
            const testResult = testResults[d.id];
            return (
              <div key={d.id} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                padding: 20, display: "flex", justifyContent: "space-between",
                alignItems: "flex-start", flexWrap: "wrap", gap: 16,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Monitor size={20} color="#3b82f6" />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                    <StatusBadge ok={d.is_active} />
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
                    <span>IP: <b>{d.ip_address}:{d.port}</b></span>
                    {d.location && <span>Location: {d.location}</span>}
                    {d.serial_number && <span>S/N: {d.serial_number}</span>}
                    {d.last_sync_at && <span>Last sync: {fmtTime(d.last_sync_at)}</span>}
                  </div>
                  {testResult && (
                    <div style={{
                      marginTop: 8, padding: "6px 12px", borderRadius: 8, fontSize: 13,
                      background: testResult.success ? "#d1fae5" : "#fee2e2",
                      color: testResult.success ? "#065f46" : "#991b1b",
                    }}>
                      {testResult.success
                        ? `Connected — S/N: ${testResult.deviceInfo?.serialNumber}, Users: ${testResult.deviceInfo?.userCount}, FW: ${testResult.deviceInfo?.firmware}`
                        : testResult.message}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn onClick={() => testConn(d)} loading={testingId === d.id} variant="outline" color="#3b82f6" small>
                    <Wifi size={13} /> Test Connection
                  </Btn>
                  <Btn onClick={() => syncUsers(d)} loading={syncingId === d.id} variant="outline" color="#059669" small>
                    <Users size={13} /> Sync All Users
                  </Btn>
                  <Btn onClick={() => openEdit(d)} variant="outline" color="#374151" small>
                    <Edit2 size={13} /> Edit
                  </Btn>
                  <Btn onClick={() => remove(d)} variant="outline" color="#ef4444" small>
                    <Trash2 size={13} /> Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Device" : "Add Identix Device"}>
        <F label="Device Name *" field="name" placeholder="e.g. Main Entrance" />
        <F label="IP Address *" field="ip_address" placeholder="e.g. 192.168.1.201" />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><F label="Port" field="port" type="number" placeholder="4370" /></div>
          <div style={{ flex: 1 }}><F label="Comm Password" field="comm_password" placeholder="0" /></div>
        </div>
        <F label="Location / Description" field="location" placeholder="e.g. Ground Floor Reception" />
        <F label="Serial Number" field="serial_number" placeholder="Optional" />
        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn onClick={() => setShowModal(false)} variant="outline" color="#64748b">Cancel</Btn>
          <Btn onClick={save} loading={saving} color="#1e40af">
            <Save size={14} /> {editing ? "Update" : "Add Device"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "attendance", label: "Attendance Logs", icon: ClipboardList },
  { id: "users", label: "User Enrollment", icon: Users },
  { id: "devices", label: "Devices", icon: Monitor },
];

export default function IdentixAttendance() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  // Admin-only guard
  if (!user || user.role !== "admin") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: 12,
      }}>
        <Shield size={48} color="#ef4444" />
        <h2 style={{ margin: 0 }}>Admin Access Only</h2>
        <p style={{ color: "#64748b" }}>This page is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "#1e40af",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Fingerprint size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
              Identix Machine Integration
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>
              Biometric punch machine — attendance synced automatically, no web punch-in needed
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e2e8f0", marginBottom: 28 }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "10px 18px", fontSize: 14, fontWeight: active ? 700 : 500,
              color: active ? "#1e40af" : "#64748b",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: active ? "2.5px solid #1e40af" : "2.5px solid transparent",
              marginBottom: -2, transition: "all 0.15s",
            }}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
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

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
