// =============================================================================
// AssignedClientsPanel.jsx
// View clients assigned to a user — handles BOTH legacy `assigned_to` AND
// per-service `assignments[].user_id` so a client whose services are split
// across multiple users shows up under each of them.
// =============================================================================
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users as UsersIcon, Search, Mail, Phone, MapPin, Briefcase,
  Loader2, CheckCircle2, ChevronDown, LayoutGrid, List as ListIcon,
  Building2, Filter, X, Download,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const COLORS = {
  deepBlue:     "#0D3B66",
  mediumBlue:   "#1F6FB2",
  emeraldGreen: "#1FAF5A",
  lightGreen:   "#5CCB5F",
};
const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

// Distinct hue per service for chip color
const SERVICE_HUES = [
  { bg: "#DBEAFE", text: "#1E40AF" },
  { bg: "#D1FAE5", text: "#065F46" },
  { bg: "#FEF3C7", text: "#92400E" },
  { bg: "#FCE7F3", text: "#9D174D" },
  { bg: "#EDE9FE", text: "#5B21B6" },
  { bg: "#FFE4E6", text: "#9F1239" },
  { bg: "#E0F2FE", text: "#075985" },
  { bg: "#ECFCCB", text: "#3F6212" },
];
function hueFor(label = "") {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return SERVICE_HUES[h % SERVICE_HUES.length];
}

function Avatar({ name, isDark }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const palette = ["#0D3B66","#065f46","#7c2d12","#4c1d95","#831843","#1F6FB2","#0E7490"];
  const bg = palette[(name?.charCodeAt(0) || 0) % palette.length];
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${bg}, ${COLORS.mediumBlue})` }}
    >
      {initial}
    </div>
  );
}

function StatusPill({ status, isDark }) {
  const active = (status || "active").toLowerCase() === "active";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: active ? (isDark ? "#064e3b" : "#D1FAE5") : (isDark ? "#7f1d1d" : "#FEE2E2"),
        color:      active ? (isDark ? "#6ee7b7" : "#047857") : (isDark ? "#fecaca" : "#B91C1C"),
      }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
      {active ? "Active" : (status || "Inactive")}
    </span>
  );
}

function ServiceChips({ services }) {
  if (!services?.length) {
    return <span className="text-[11px] italic text-slate-400">No specific services</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {services.map((s) => {
        const h = hueFor(s);
        return (
          <span
            key={s}
            className="px-2 py-0.5 rounded-md text-[10px] font-bold"
            style={{ background: h.bg, color: h.text }}
          >
            {s}
          </span>
        );
      })}
    </div>
  );
}

function exportCsv(rows, userName) {
  const headers = ["Company", "Type", "Email", "Phone", "City", "State", "Status", "Assigned Services", "All Services"];
  const csv = [
    headers.join(","),
    ...rows.map(r => [
      r.company_name || "",
      r.client_type_label || r.client_type || "",
      r.email || "",
      r.phone || "",
      r.city || "",
      r.state || "",
      r.status || "active",
      (r.assigned_services || []).join("; "),
      (r.services || []).join("; "),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assigned-clients-${(userName || "user").replace(/\s+/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function AssignedClientsPanel({ isDark }) {
  const { user } = useAuth();
  const isPriv   = user?.role === "admin" || user?.role === "manager";

  const [users, setUsers]               = useState([]);
  const [selectedUserId, setSelectedId] = useState(user?.id || "");
  const [data, setData]                 = useState({ clients: [], count: 0 });
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView]                 = useState("grid"); // grid | list
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  // Load directory (admins/managers) so they can pick any user
  useEffect(() => {
    if (!isPriv) return;
    api.get("/users")
      .then(res => {
        const list = (res.data || []).filter(u => u.is_active !== false);
        list.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
        setUsers(list);
      })
      .catch(() => setUsers([]));
  }, [isPriv]);

  // Load assigned clients for the selected user
  useEffect(() => {
    if (!selectedUserId) return;
    setLoading(true);
    api.get(`/users/${selectedUserId}/assigned-clients`)
      .then(res => setData(res.data || { clients: [], count: 0 }))
      .catch(() => setData({ clients: [], count: 0 }))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) || user,
    [users, selectedUserId, user]
  );

  // Derive unique services (from `assigned_services`) for filter
  const allServices = useMemo(() => {
    const set = new Set();
    (data.clients || []).forEach(c =>
      (c.assigned_services || []).forEach(s => set.add(s))
    );
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.clients || []).filter(c => {
      if (statusFilter !== "all" && (c.status || "active").toLowerCase() !== statusFilter) return false;
      if (serviceFilter !== "all" && !(c.assigned_services || []).includes(serviceFilter)) return false;
      if (!q) return true;
      const hay = [
        c.company_name, c.email, c.phone, c.city, c.state, c.gstin, c.pan,
        ...(c.assigned_services || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, serviceFilter, statusFilter]);

  // Summary metrics
  const activeCount   = (data.clients || []).filter(c => (c.status || "active") === "active").length;
  const serviceCount  = allServices.length;
  const splitClients  = (data.clients || []).filter(c =>
    (c.assignments || []).some(a => a.user_id !== selectedUserId)
    && (c.assignments || []).some(a => a.user_id === selectedUserId)
  ).length;

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div
        className={`rounded-2xl border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
      >
        <div className="px-5 py-4 flex flex-wrap items-center gap-4 rounded-t-2xl" style={{ background: GRADIENT }}>
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <UsersIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg leading-tight">Assigned Clients</h2>
            <p className="text-white/70 text-xs">
              {isPriv ? "View clients assigned to any user — across all services" : "Clients assigned to you across all services"}
            </p>
          </div>

          {/* User picker (admin/manager) */}
          {isPriv && (
            <div className="relative">
              <button
                onClick={() => setUserPickerOpen(o => !o)}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition px-3 py-2 rounded-xl text-white text-sm font-semibold"
              >
                <Avatar name={selectedUser?.full_name} />
                <div className="text-left leading-tight pr-1">
                  <div className="text-[13px] font-bold truncate max-w-[180px]">{selectedUser?.full_name || "Select user"}</div>
                  <div className="text-[10px] uppercase tracking-wider text-white/70">{selectedUser?.role || "—"}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-white/80" />
              </button>
              <AnimatePresence>
                {userPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className={`absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl shadow-2xl border z-50 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
                  >
                    {users.map(u => {
                      const sel = u.id === selectedUserId;
                      return (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedId(u.id); setUserPickerOpen(false); }}
                          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm border-b last:border-b-0 transition ${isDark ? "border-slate-700 hover:bg-slate-700/50" : "border-slate-100 hover:bg-slate-50"} ${sel ? (isDark ? "bg-slate-700/70" : "bg-blue-50/70") : ""}`}
                        >
                          <Avatar name={u.full_name} />
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>{u.full_name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                          </div>
                          {sel && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                    {users.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-slate-400">No users available</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* METRICS STRIP */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-b-2xl ${isDark ? "bg-slate-700" : "bg-slate-100"}`}>
          {[
            { label: "Total Clients", value: data.count, accent: COLORS.deepBlue, icon: Building2 },
            { label: "Active",        value: activeCount, accent: COLORS.emeraldGreen, icon: CheckCircle2 },
            { label: "Services",      value: serviceCount, accent: "#7C3AED", icon: Briefcase },
            { label: "Shared Clients",value: splitClients, accent: "#F59E0B", icon: UsersIcon },
          ].map(m => {
            const I = m.icon;
            return (
              <div
                key={m.label}
                className={`px-4 py-3 flex items-center gap-3 ${isDark ? "bg-slate-800" : "bg-white"}`}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${m.accent}15` }}
                >
                  <I className="h-4 w-4" style={{ color: m.accent }} />
                </div>
                <div className="min-w-0">
                  <div className={`text-lg font-bold leading-none ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                    {loading ? "—" : m.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{m.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-2 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, city, GSTIN…"
            className={`h-10 rounded-xl text-sm pl-9 ${isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200"}`}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 h-10 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className={`bg-transparent text-xs font-semibold outline-none pr-1 ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              <option value="all">All services</option>
              {allServices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className={`flex items-center gap-1 px-2 h-10 rounded-xl border ${isDark ? "bg-slate-900 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={`bg-transparent text-xs font-semibold outline-none pr-1 ${isDark ? "text-slate-200" : "text-slate-700"}`}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className={`flex items-center rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 h-10 ${view === "grid" ? "bg-blue-500 text-white" : (isDark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-500")}`}
              title="Grid view"
            ><LayoutGrid className="h-4 w-4" /></button>
            <button
              onClick={() => setView("list")}
              className={`px-2.5 h-10 ${view === "list" ? "bg-blue-500 text-white" : (isDark ? "bg-slate-900 text-slate-400" : "bg-slate-50 text-slate-500")}`}
              title="List view"
            ><ListIcon className="h-4 w-4" /></button>
          </div>

          <button
            onClick={() => exportCsv(filtered, selectedUser?.full_name)}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold text-white shadow disabled:opacity-50"
            style={{ background: GRADIENT }}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className={`rounded-2xl border p-12 flex items-center justify-center ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-slate-500">Loading assigned clients…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-2xl border p-12 text-center ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
          <Building2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            {search || serviceFilter !== "all" || statusFilter !== "all" ? "No clients match your filters" : "No clients assigned to this user"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {search || serviceFilter !== "all" || statusFilter !== "all"
              ? "Try clearing search or filters."
              : "Assign clients (or specific services on a client) to this user from the Clients page."}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl border p-4 hover:shadow-md transition ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
            >
              <div className="flex items-start gap-3">
                <Avatar name={c.company_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-bold text-sm leading-tight truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                      {c.company_name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusPill status={c.status} isDark={isDark} />
                    {c.client_type_label && (
                      <span className="text-[10px] font-semibold text-slate-400">{c.client_type_label}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{c.phone}</span>
                  </div>
                )}
                {(c.city || c.state) && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{[c.city, c.state].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>

              <div className={`mt-3 pt-3 border-t ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Briefcase className="h-3 w-3 text-blue-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Services assigned to {selectedUser?.full_name?.split(" ")[0] || "user"}
                  </span>
                </div>
                <ServiceChips services={c.assigned_services} />
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
          <div className={`grid grid-cols-12 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? "bg-slate-900/50 text-slate-400 border-b border-slate-700" : "bg-slate-50 text-slate-500 border-b border-slate-100"}`}>
            <div className="col-span-4">Client</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-3">Assigned Services</div>
          </div>
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className={`grid grid-cols-12 px-4 py-3 items-center text-xs ${idx !== filtered.length - 1 ? (isDark ? "border-b border-slate-700" : "border-b border-slate-100") : ""} ${isDark ? "hover:bg-slate-700/30" : "hover:bg-slate-50/70"}`}
            >
              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                <Avatar name={c.company_name} />
                <div className="min-w-0">
                  <div className={`font-bold text-sm truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                    {c.company_name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusPill status={c.status} isDark={isDark} />
                    {c.client_type_label && (
                      <span className="text-[10px] text-slate-400">{c.client_type_label}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-span-3 min-w-0">
                <div className="truncate text-slate-500 dark:text-slate-400">{c.email || "—"}</div>
                <div className="truncate text-slate-400">{c.phone || "—"}</div>
              </div>
              <div className="col-span-2 truncate text-slate-500 dark:text-slate-400">
                {[c.city, c.state].filter(Boolean).join(", ") || "—"}
              </div>
              <div className="col-span-3">
                <ServiceChips services={c.assigned_services} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
