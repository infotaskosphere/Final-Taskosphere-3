// =============================================================================
// AssignedClientsPanel.jsx
// View clients assigned to a user — with Quick-Edit AND Bulk Assignment so
// admins/managers can manage assignments right from General Settings.
// Bulk assignment uses the same API pattern as Clients.jsx BulkAssignModal
// so both pages stay in sync (PUT /clients/{id} with assignments payload).
// =============================================================================
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users as UsersIcon, Search, Mail, Phone, MapPin, Briefcase,
  Loader2, CheckCircle2, ChevronDown, LayoutGrid, List as ListIcon,
  Building2, Filter, X, Download, Edit2, Save,
  FileText, CreditCard, User, ChevronRight,
  UserPlus, CheckSquare, Square, MinusSquare, AlertCircle, UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────
const SERVICES = [
  'GST', 'Trademark', 'Income Tax', 'ROC', 'Audit', 'Compliance',
  'Company Registration', 'Tax Planning', 'Accounting', 'Payroll', 'Other',
];

const CLIENT_TYPES = [
  { value: 'proprietor', label: 'Proprietor' },
  { value: 'pvt_ltd',    label: 'Private Limited' },
  { value: 'llp',        label: 'LLP' },
  { value: 'partnership',label: 'Partnership' },
  { value: 'huf',        label: 'HUF' },
  { value: 'trust',      label: 'Trust' },
  { value: 'other',      label: 'Other' },
];

const COLORS = {
  deepBlue:     "#0D3B66",
  mediumBlue:   "#1F6FB2",
  emeraldGreen: "#1FAF5A",
};
const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

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

function getAvatarBg(name = "") {
  const palette = ["#0D3B66","#065f46","#7c2d12","#4c1d95","#831843","#1F6FB2","#0E7490","#92400e"];
  return palette[(name?.charCodeAt(0) || 0) % palette.length];
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Avatar({ name, size = "md" }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const bg = getAvatarBg(name);
  const cls = size === "sm"
    ? "w-7 h-7 rounded-lg text-xs"
    : "w-10 h-10 rounded-xl text-sm";
  return (
    <div
      className={`${cls} flex items-center justify-center text-white font-black flex-shrink-0`}
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

function ServiceChips({ services, allClientServices }) {
  // If assigned_services is ["All services"] (legacy fallback), resolve to actual
  // client-level services so the card accurately reflects what was saved.
  const resolved =
    services?.length === 1 && services[0] === "All services"
      ? (allClientServices?.length ? allClientServices : services)
      : services;
  if (!resolved?.length) return <span className="text-[11px] italic text-slate-400">No specific services</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {resolved.map((s) => {
        const h = hueFor(s);
        return (
          <span key={s} className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: h.bg, color: h.text }}>
            {s}
          </span>
        );
      })}
    </div>
  );
}

function SectionTab({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}
    >
      {icon}{label}
    </button>
  );
}

function exportCsv(rows, userName) {
  const headers = ["Company","Type","Email","Phone","City","State","Status","Assigned Services","All Services"];
  const csv = [
    headers.join(","),
    ...rows.map(r => {
      const assignedSvcs = (r.assigned_services?.length === 1 && r.assigned_services[0] === "All services")
        ? (r.services || [])
        : (r.assigned_services || []);
      return [
        r.company_name||"", r.client_type_label||r.client_type||"",
        r.email||"", r.phone||"", r.city||"", r.state||"",
        r.status||"active", assignedSvcs.join("; "), (r.services||[]).join("; "),
      ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",");
    })
  ].join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`assigned-clients-${(userName||"user").replace(/\s+/g,"-").toLowerCase()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ─── Bulk Assign Modal ────────────────────────────────────────────────────────
// Mirrors BulkAssignModal in Clients.jsx — same API pattern (PUT /clients/{id}
// with assignments payload) so both pages stay in sync.
function BulkAssignModal({ open, allClients, users, isDark, onClose, onComplete }) {
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [clientSearch, setClientSearch]     = useState("");
  const [targetUserId, setTargetUserId]     = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [mode, setMode]                     = useState("add"); // 'add' | 'replace'
  const [saving, setSaving]                 = useState(false);
  const [userSearch, setUserSearch]         = useState("");
  const [scope, setScope]                   = useState("active");

  const activeClients = useMemo(() =>
    allClients.filter(c => (c?.status || "active") === "active"),
    [allClients]
  );

  // Reset state when opened
  useEffect(() => {
    if (!open) return;
    setScope("active");
    setSelectedIds(new Set(activeClients.map(c => c.id)));
    setClientSearch("");
    setTargetUserId("");
    setSelectedServices([]);
    setMode("add");
    setSaving(false);
    setUserSearch("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayedClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const base = scope === "active" ? activeClients : allClients;
    if (!q) return base;
    return base.filter(c =>
      (c?.company_name || "").toLowerCase().includes(q) ||
      (c?.phone || "").includes(q) ||
      (c?.email || "").toLowerCase().includes(q)
    );
  }, [allClients, activeClients, clientSearch, scope]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const selectedClients = useMemo(() =>
    allClients.filter(c => selectedIds.has(c.id)),
    [allClients, selectedIds]
  );

  const targetUser = users.find(u => u.id === targetUserId);

  const allDisplayedSelected = displayedClients.length > 0 && displayedClients.every(c => selectedIds.has(c.id));
  const someDisplayedSelected = !allDisplayedSelected && displayedClients.some(c => selectedIds.has(c.id));

  const toggleClient = useCallback((id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const toggleAll = useCallback(() => {
    if (allDisplayedSelected) {
      setSelectedIds(prev => { const n = new Set(prev); displayedClients.forEach(c => n.delete(c.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); displayedClients.forEach(c => n.add(c.id)); return n; });
    }
  }, [allDisplayedSelected, displayedClients]);

  const handleScopeChange = useCallback((s) => {
    setScope(s);
    const base = s === "active" ? activeClients : allClients;
    setSelectedIds(new Set(base.map(c => c.id)));
  }, [activeClients, allClients]);

  const toggleService = useCallback((svc) => {
    setSelectedServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]);
  }, []);

  const handleAssign = useCallback(async () => {
    if (!targetUserId || selectedClients.length === 0) return;
    setSaving(true);
    let ok = 0, fail = 0;
    for (const client of selectedClients) {
      try {
        let newAssignments;
        if (mode === "replace") {
          newAssignments = [{ user_id: targetUserId, services: selectedServices }];
        } else {
          const existing = client.assignments || [];
          const alreadyAssigned = existing.find(a => a.user_id === targetUserId);
          if (alreadyAssigned) {
            const merged = [...new Set([...(alreadyAssigned.services || []), ...selectedServices])];
            newAssignments = existing.map(a => a.user_id === targetUserId ? { ...a, services: merged } : a);
          } else {
            newAssignments = [...existing, { user_id: targetUserId, services: selectedServices }];
          }
        }
        await api.put(`/clients/${client.id}`, { assignments: newAssignments });
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    if (ok > 0) {
      toast.success(`Assigned ${targetUser?.full_name || "user"} to ${ok} client${ok !== 1 ? "s" : ""}${fail > 0 ? ` (${fail} failed)` : ""}`);
      onComplete();
    } else {
      toast.error("Assignment failed. Please try again.");
    }
    onClose();
  }, [targetUserId, selectedClients, mode, selectedServices, targetUser, onComplete, onClose]);

  if (!open) return null;

  const inp = `h-9 w-full rounded-xl text-xs px-3 border outline-none focus:ring-2 transition-all ${isDark ? "bg-slate-700 border-slate-600 text-slate-100 focus:ring-blue-500/30 focus:border-blue-500" : "bg-white border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400"}`;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={`relative w-full sm:max-w-4xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] ${isDark ? "bg-slate-900 border border-slate-700" : "bg-white border border-slate-200"}`}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 rounded-t-3xl" style={{ background: GRADIENT }}>
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <UserCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base leading-tight">Bulk Assign Clients</h2>
            <p className="text-white/65 text-xs mt-0.5">Select clients and assign them to a team member in one shot</p>
          </div>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/20 text-white flex-shrink-0">
            {selectedIds.size} selected
          </span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body (2-column) ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* LEFT: Client list */}
          <div className={`w-72 flex-shrink-0 flex flex-col border-r ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/40"}`}>
            {/* Scope toggle */}
            <div className="flex gap-1 px-3 pt-3 pb-2 flex-shrink-0">
              {[
                { id: "active", label: `Active (${activeClients.length})` },
                { id: "all",    label: `All (${allClients.length})` },
              ].map(s => (
                <button key={s.id} onClick={() => handleScopeChange(s.id)}
                  className="flex-1 h-7 rounded-lg text-[10px] font-bold transition-all"
                  style={scope === s.id
                    ? { background: GRADIENT, color: "#fff" }
                    : { background: isDark ? "rgba(255,255,255,0.07)" : "#f1f5f9", color: isDark ? "#94a3b8" : "#64748b" }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className={`flex items-center gap-1.5 px-3 py-2 border-b flex-shrink-0 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
              <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <input
                className={`flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400 ${isDark ? "text-slate-200" : "text-slate-700"}`}
                placeholder="Search clients…"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
              />
              {clientSearch && <button onClick={() => setClientSearch("")}><X className="h-3 w-3 text-slate-400 hover:text-slate-600" /></button>}
            </div>

            {/* Select-all row */}
            <div className={`flex items-center gap-2 px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest flex-shrink-0 ${isDark ? "border-slate-700 text-slate-400" : "border-slate-100 text-slate-400"}`}>
              <button onClick={toggleAll} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                {allDisplayedSelected
                  ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                  : someDisplayedSelected
                    ? <MinusSquare className="h-3.5 w-3.5 text-blue-400" />
                    : <Square className="h-3.5 w-3.5" />}
                {allDisplayedSelected ? "Deselect All" : "Select All"}
              </button>
              <span className="ml-auto">{displayedClients.length} shown</span>
            </div>

            {/* Client rows */}
            <div className="flex-1 overflow-y-auto">
              {displayedClients.map(c => {
                const checked = selectedIds.has(c.id);
                const inactive = (c?.status || "active") === "inactive";
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleClient(c.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b last:border-0 ${isDark ? "border-slate-700/60" : "border-slate-50"} ${checked ? (isDark ? "bg-blue-900/20" : "bg-blue-50/60") : (isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50")}`}
                  >
                    {checked
                      ? <CheckSquare className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      : <Square className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />}
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${getAvatarBg(c.company_name)}, ${COLORS.mediumBlue})`, opacity: inactive ? 0.5 : 1 }}
                    >
                      {c.company_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate leading-tight ${inactive ? "text-slate-400" : isDark ? "text-slate-200" : "text-slate-800"}`}>
                        {c.company_name}
                        {inactive && <span className="ml-1 text-[9px] text-amber-500 font-bold">INACTIVE</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{c.phone || c.email || "—"}</p>
                    </div>
                  </div>
                );
              })}
              {displayedClients.length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-slate-400">No clients found</div>
              )}
            </div>
          </div>

          {/* RIGHT: Assignment config */}
          <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
            <div className="p-5 space-y-5">

              {/* 1. Pick user */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                  Assign To <span className="text-rose-400">*</span>
                </label>
                {/* User search */}
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border mb-2 ${isDark ? "bg-slate-800 border-slate-600" : "bg-slate-50 border-slate-200"}`}>
                  <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <input
                    className={`flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400 ${isDark ? "text-slate-200" : "text-slate-700"}`}
                    placeholder="Search team member…"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                  {userSearch && <button onClick={() => setUserSearch("")}><X className="h-3 w-3 text-slate-400" /></button>}
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-slate-400 italic px-1">No team members found.</p>
                  )}
                  {filteredUsers.map(u => {
                    const isSel = targetUserId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setTargetUserId(u.id)}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all ${isSel
                          ? "border-blue-300 shadow-sm"
                          : isDark ? "border-slate-600 bg-slate-800/40 hover:border-slate-500" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                        style={isSel ? { background: "linear-gradient(135deg, #eff6ff, #dbeafe)", borderColor: "#93c5fd" } : {}}
                      >
                        <Avatar name={u.full_name || u.name || u.email} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                            {u.full_name || u.name || u.email}
                          </p>
                          {u.departments?.length > 0 && (
                            <p className="text-[10px] text-slate-400 truncate">{u.departments.join(", ")}</p>
                          )}
                        </div>
                        {isSel && <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Services */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                  Services <span className={`font-normal normal-case ${isDark ? "text-slate-500" : "text-slate-400"}`}>(optional — leave blank for all)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICES.map(svc => {
                    const isSel = selectedServices.includes(svc);
                    return (
                      <button key={svc} type="button" onClick={() => toggleService(svc)}
                        className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${isSel ? "text-white border-transparent" : isDark ? "bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                        style={isSel ? { background: GRADIENT } : {}}>
                        {svc}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Mode */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Assignment Mode</label>
                <div className={`flex rounded-xl border overflow-hidden ${isDark ? "border-slate-600" : "border-slate-200"}`}>
                  {[
                    { value: "add",     label: "Add to existing",   desc: "Keep current assignments + add this user" },
                    { value: "replace", label: "Replace all",       desc: "Remove existing, set only this user" },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setMode(opt.value)}
                      className={`flex-1 px-4 py-3 text-left transition-all border-r last:border-r-0 ${isDark ? "border-slate-600" : "border-slate-200"}`}
                      style={mode === opt.value ? { background: GRADIENT } : { background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc" }}>
                      <p className={`text-xs font-bold ${mode === opt.value ? "text-white" : isDark ? "text-slate-200" : "text-slate-700"}`}>{opt.label}</p>
                      <p className={`text-[10px] mt-0.5 ${mode === opt.value ? "text-blue-100" : "text-slate-400"}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {mode === "replace" && (
                  <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 font-medium">
                      This will replace ALL existing assignments for the selected clients with only this user.
                    </p>
                  </div>
                )}
              </div>

              {/* 4. Summary */}
              {targetUserId && selectedClients.length > 0 && (
                <div className="rounded-xl border p-4" style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderColor: "#bbf7d0" }}>
                  <p className="text-xs font-semibold text-emerald-800">
                    ✓ Ready to {mode === "replace" ? "replace assignments and assign" : "assign"}{" "}
                    <strong>{targetUser?.full_name || targetUser?.name}</strong>{" "}
                    to <strong>{selectedClients.length}</strong> client{selectedClients.length !== 1 ? "s" : ""}
                    {selectedServices.length > 0 && <> for <strong>{selectedServices.join(", ")}</strong></>}
                    {selectedServices.length === 0 && <> for <strong>all services</strong></>}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t rounded-b-3xl ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-100 bg-white"}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${isDark ? "border-slate-600 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {!targetUserId && <span className="text-xs text-amber-600 font-medium">← Select a team member first</span>}
            {targetUserId && selectedClients.length === 0 && <span className="text-xs text-amber-600 font-medium">← Select at least one client</span>}
            <button
              type="button"
              disabled={!targetUserId || selectedClients.length === 0 || saving}
              onClick={handleAssign}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow disabled:opacity-50 transition-all active:scale-95"
              style={{ background: (!targetUserId || selectedClients.length === 0 || saving) ? "#94a3b8" : GRADIENT }}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" />Assigning…</>
                : <><UserCheck className="h-4 w-4" />Assign {selectedClients.length > 0 ? `(${selectedClients.length})` : ""}</>
              }
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Quick-Edit Modal ─────────────────────────────────────────────────────────
function QuickEditModal({ client, isDark, onClose, onSaved }) {
  const [tab, setTab]       = useState("basic");
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({
    company_name:          client.company_name || "",
    client_type:           client.client_type || "proprietor",
    client_type_other:     client.client_type === "other" ? (client.client_type_label || "") : "",
    email:                 client.email || "",
    phone:                 client.phone || "",
    address:               client.address || "",
    city:                  client.city || "",
    state:                 client.state || "",
    status:                client.status || "active",
    services:              client.services || [],
    notes:                 client.notes || "",
    gstin:                 client.gstin || "",
    pan:                   client.pan || "",
    website:               client.website || "",
    msme_number:           client.msme_number || "",
    gst_treatment:         client.gst_treatment || "regular",
    default_payment_terms: client.default_payment_terms || "Due on receipt",
    credit_limit:          client.credit_limit || "",
    tally_ledger_name:     client.tally_ledger_name || "",
    tally_group:           client.tally_group || "Sundry Debtors",
  });

  const set = useCallback((field, val) => setForm(p => ({ ...p, [field]: val })), []);

  const toggleService = useCallback((s) => {
    setForm(p => ({
      ...p,
      services: p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s],
    }));
  }, []);

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...client,
        company_name:    form.company_name.trim(),
        client_type:     form.client_type,
        client_type_label: form.client_type === "other" ? (form.client_type_other?.trim() || "Other") : null,
        email:           form.email?.trim() || null,
        phone:           form.phone?.replace(/\D/g, "") || null,
        address:         form.address?.trim() || null,
        city:            form.city?.trim() || null,
        state:           form.state?.trim() || null,
        status:          form.status,
        services:        form.services,
        notes:           form.notes?.trim() || null,
        gstin:           form.gstin?.trim().toUpperCase() || null,
        pan:             form.pan?.trim().toUpperCase() || null,
        website:         form.website?.trim() || null,
        msme_number:     form.msme_number?.trim() || null,
        gst_treatment:   form.gst_treatment || "regular",
        default_payment_terms: form.default_payment_terms || "Due on receipt",
        credit_limit:    form.credit_limit ? Number(form.credit_limit) : null,
        tally_ledger_name: form.tally_ledger_name?.trim() || null,
        tally_group:     form.tally_group || "Sundry Debtors",
      };
      await api.put(`/clients/${client.id}`, payload);
      toast.success(`${form.company_name} updated ✓`);
      onSaved({ ...client, ...payload });
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const inp  = `h-10 w-full rounded-xl text-sm px-3 border outline-none focus:ring-2 transition-all ${isDark ? "bg-slate-700 border-slate-600 text-slate-100 focus:ring-blue-500/30 focus:border-blue-500" : "bg-white border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400"}`;
  const lbl  = "block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5";
  const card = `rounded-2xl border p-5 ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-100"}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] ${isDark ? "bg-slate-900 border border-slate-700" : "bg-slate-50 border border-slate-200"}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b flex-shrink-0 rounded-t-3xl" style={{ borderColor: isDark ? "#334155" : "#e2e8f0", background: GRADIENT }}>
          <Avatar name={form.company_name} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight truncate text-white">{form.company_name || "Edit Client"}</p>
            <p className="text-[11px] text-white/60 mt-0.5">Quick Edit · General Settings</p>
          </div>
          <button
            onClick={() => set("status", form.status === "active" ? "inactive" : "active")}
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${form.status === "active" ? "bg-white/20 text-white hover:bg-white/30" : "bg-rose-500/30 text-rose-100 hover:bg-rose-500/50"}`}
          >
            <span className={`w-2 h-2 rounded-full ${form.status === "active" ? "bg-emerald-300 animate-pulse" : "bg-rose-400"}`} />
            {form.status === "active" ? "Active" : "Inactive"}
          </button>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/15 hover:bg-white/25 text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className={`flex items-center gap-1 px-4 py-2.5 border-b flex-shrink-0 overflow-x-auto ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <SectionTab icon={<User className="h-3 w-3" />}       label="Basic"    active={tab==="basic"}    onClick={()=>setTab("basic")} />
          <SectionTab icon={<Briefcase className="h-3 w-3" />}  label="Services" active={tab==="services"} onClick={()=>setTab("services")} />
          <SectionTab icon={<MapPin className="h-3 w-3" />}     label="Address"  active={tab==="address"}  onClick={()=>setTab("address")} />
          <SectionTab icon={<CreditCard className="h-3 w-3" />} label="Billing"  active={tab==="billing"}  onClick={()=>setTab("billing")} />
          <SectionTab icon={<FileText className="h-3 w-3" />}   label="Notes"    active={tab==="notes"}    onClick={()=>setTab("notes")} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === "basic" && (
            <div className="space-y-4">
              <div className={card}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark?"text-slate-400":"text-slate-500"}`}>Company Info</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={lbl}>Company Name *</label>
                    <input value={form.company_name} onChange={e=>set("company_name",e.target.value)} className={inp} placeholder="Company name" />
                  </div>
                  <div>
                    <label className={lbl}>Client Type</label>
                    <select value={form.client_type} onChange={e=>set("client_type",e.target.value)} className={inp}>
                      {CLIENT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  {form.client_type==="other" && (
                    <div>
                      <label className={lbl}>Specify Type</label>
                      <input value={form.client_type_other} onChange={e=>set("client_type_other",e.target.value)} className={inp} placeholder="e.g. Section 8" />
                    </div>
                  )}
                  <div>
                    <label className={lbl}>Status</label>
                    <select value={form.status} onChange={e=>set("status",e.target.value)} className={inp}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className={card}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark?"text-slate-400":"text-slate-500"}`}>Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Email</label>
                    <input type="email" value={form.email} onChange={e=>set("email",e.target.value)} className={inp} placeholder="email@company.com" />
                  </div>
                  <div>
                    <label className={lbl}>Phone</label>
                    <input value={form.phone} onChange={e=>set("phone",e.target.value)} className={inp} placeholder="10-digit mobile" />
                  </div>
                  <div>
                    <label className={lbl}>Website</label>
                    <input value={form.website} onChange={e=>set("website",e.target.value)} className={inp} placeholder="https://..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "services" && (
            <div className={card}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark?"text-slate-400":"text-slate-500"}`}>Applicable Services</p>
              <p className="text-[11px] text-slate-400 mb-4">Toggle services on or off for this client</p>
              <div className="flex flex-wrap gap-2">
                {SERVICES.map(s=>{
                  const sel=form.services.includes(s);
                  return (
                    <button key={s} type="button" onClick={()=>toggleService(s)}
                      className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${sel?"text-white border-transparent shadow-sm":isDark?"bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500":"bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                      style={sel?{background:GRADIENT}:{}}
                    >{s}</button>
                  );
                })}
              </div>
              {form.services.length>0 && (
                <div className="mt-4 pt-4 border-t" style={{borderColor:isDark?"#334155":"#f1f5f9"}}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark?"text-slate-500":"text-slate-400"}`}>Selected ({form.services.length})</p>
                  <ServiceChips services={form.services} />
                </div>
              )}
            </div>
          )}

          {tab === "address" && (
            <div className={card}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark?"text-slate-400":"text-slate-500"}`}>Address Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={lbl}>Street Address</label>
                  <textarea value={form.address} onChange={e=>set("address",e.target.value)} rows={2}
                    className={`w-full rounded-xl text-sm px-3 py-2 border outline-none focus:ring-2 resize-none transition-all ${isDark?"bg-slate-700 border-slate-600 text-slate-100 focus:ring-blue-500/30 focus:border-blue-500":"bg-white border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400"}`}
                  />
                </div>
                <div><label className={lbl}>City</label><input value={form.city} onChange={e=>set("city",e.target.value)} className={inp} placeholder="City" /></div>
                <div><label className={lbl}>State</label><input value={form.state} onChange={e=>set("state",e.target.value)} className={inp} placeholder="State" /></div>
              </div>
            </div>
          )}

          {tab === "billing" && (
            <div className="space-y-4">
              <div className={card}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark?"text-slate-400":"text-slate-500"}`}>Tax Registration</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={lbl}>GSTIN</label><input value={form.gstin} onChange={e=>set("gstin",e.target.value.toUpperCase())} className={inp} placeholder="22AAAAA0000A1Z5" maxLength={15} /></div>
                  <div><label className={lbl}>PAN</label><input value={form.pan} onChange={e=>set("pan",e.target.value.toUpperCase())} className={inp} placeholder="AAAAA0000A" maxLength={10} /></div>
                  <div>
                    <label className={lbl}>GST Treatment</label>
                    <select value={form.gst_treatment} onChange={e=>set("gst_treatment",e.target.value)} className={inp}>
                      {["regular","composition","unregistered","consumer","overseas","sez"].map(v=><option key={v} value={v}>{v.charAt(0).toUpperCase()+v.slice(1)}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>MSME Number</label><input value={form.msme_number} onChange={e=>set("msme_number",e.target.value)} className={inp} placeholder="UDYAM-XX-00-0000000" /></div>
                </div>
              </div>
              <div className={card}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark?"text-slate-400":"text-slate-500"}`}>Payment & Tally</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>Payment Terms</label>
                    <select value={form.default_payment_terms} onChange={e=>set("default_payment_terms",e.target.value)} className={inp}>
                      {["Due on receipt","Net 15","Net 30","Net 45","Net 60"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Credit Limit (₹)</label><input type="number" value={form.credit_limit} onChange={e=>set("credit_limit",e.target.value)} className={inp} placeholder="0" /></div>
                  <div><label className={lbl}>Tally Ledger Name</label><input value={form.tally_ledger_name} onChange={e=>set("tally_ledger_name",e.target.value)} className={inp} placeholder="Ledger name in Tally" /></div>
                  <div>
                    <label className={lbl}>Tally Group</label>
                    <select value={form.tally_group} onChange={e=>set("tally_group",e.target.value)} className={inp}>
                      {["Sundry Debtors","Sundry Creditors","Loans & Advances","Current Assets"].map(g=><option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div className={card}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark?"text-slate-400":"text-slate-500"}`}>Internal Notes</p>
              <p className="text-[11px] text-slate-400 mb-3">Private notes visible only to your team</p>
              <textarea
                value={form.notes} onChange={e=>set("notes",e.target.value)} rows={8}
                placeholder="Add any internal notes, reminders or important information…"
                className={`w-full rounded-xl text-sm px-3 py-3 border outline-none focus:ring-2 resize-y transition-all ${isDark?"bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:ring-blue-500/30 focus:border-blue-500":"bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:ring-blue-100 focus:border-blue-400"}`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between gap-3 px-4 py-3 border-t flex-shrink-0 rounded-b-3xl ${isDark?"border-slate-700 bg-slate-900":"border-slate-200 bg-white"}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${isDark?"border-slate-600 text-slate-400 hover:bg-slate-800":"border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden sm:block">Changes save to the main client record</span>
            <button
              onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-60 transition-all hover:shadow-lg active:scale-95"
              style={{ background: GRADIENT }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AssignedClientsPanel({ isDark }) {
  const { user } = useAuth();
  const isPriv   = user?.role === "admin" || user?.role === "manager";

  const [users, setUsers]                   = useState([]);
  const [selectedUserId, setSelectedId]     = useState(user?.id || "");
  const [data, setData]                     = useState({ clients: [], count: 0 });
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [serviceFilter, setServiceFilter]   = useState("all");
  const [statusFilter, setStatusFilter]     = useState("all");
  const [view, setView]                     = useState("grid");
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [editingClient, setEditingClient]   = useState(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  // Fetch all users (admins/managers only)
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

  const loadClients = useCallback(() => {
    if (!selectedUserId) return;
    setLoading(true);
    api.get(`/users/${selectedUserId}/assigned-clients`)
      .then(res => setData(res.data || { clients: [], count: 0 }))
      .catch(() => setData({ clients: [], count: 0 }))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId) || user, [users, selectedUserId, user]);

  const allServices = useMemo(() => {
    const set = new Set();
    (data.clients || []).forEach(c => {
      const effective =
        (c.assigned_services?.length === 1 && c.assigned_services[0] === "All services")
          ? (c.services || [])
          : (c.assigned_services || []);
      effective.forEach(s => set.add(s));
    });
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.clients || []).filter(c => {
      if (statusFilter !== "all" && (c.status || "active").toLowerCase() !== statusFilter) return false;
      if (serviceFilter !== "all") {
        const effectiveServices =
          (c.assigned_services?.length === 1 && c.assigned_services[0] === "All services")
            ? (c.services || [])
            : (c.assigned_services || []);
        if (!effectiveServices.includes(serviceFilter)) return false;
      }
      if (!q) return true;
      const effectiveSearchSvcs =
        (c.assigned_services?.length === 1 && c.assigned_services[0] === "All services")
          ? (c.services || [])
          : (c.assigned_services || []);
      const hay = [c.company_name, c.email, c.phone, c.city, c.state, c.gstin, c.pan, ...effectiveSearchSvcs].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, serviceFilter, statusFilter]);

  const activeCount  = (data.clients || []).filter(c => (c.status || "active") === "active").length;
  const serviceCount = allServices.length;
  const splitClients = (data.clients || []).filter(c =>
    (c.assignments || []).some(a => a.user_id !== selectedUserId) &&
    (c.assignments || []).some(a => a.user_id === selectedUserId)
  ).length;

  const handleSaved = useCallback((updated) => {
    setData(prev => ({
      ...prev,
      clients: prev.clients.map(c => {
        if (c.id !== updated.id) return c;
        // If services changed and assigned_services was the legacy "All services" fallback,
        // update assigned_services to reflect the new client-level services.
        let assigned_services = c.assigned_services;
        if (
          assigned_services?.length === 1 &&
          assigned_services[0] === "All services" &&
          updated.services
        ) {
          assigned_services = updated.services;
        }
        return { ...c, ...updated, assigned_services };
      }),
    }));
  }, []);

  // After bulk assign, reload the current user's clients so the panel is up-to-date
  const handleBulkComplete = useCallback(() => {
    loadClients();
  }, [loadClients]);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className={`rounded-2xl border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="px-5 py-4 flex flex-wrap items-center gap-3 rounded-t-2xl" style={{ background: GRADIENT }}>
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <UsersIcon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg leading-tight">Assigned Clients</h2>
            <p className="text-white/70 text-xs">
              {isPriv ? "View & edit clients assigned to any user — across all services" : "Clients assigned to you across all services"}
            </p>
          </div>

          {/* Bulk Assign button — admin/manager only */}
          {isPriv && (
            <button
              onClick={() => setBulkAssignOpen(true)}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition px-3 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0"
              title="Bulk assign clients to a user"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Bulk Assign</span>
            </button>
          )}

          {/* User picker */}
          {isPriv && (
            <div className="relative">
              <button
                onClick={() => setUserPickerOpen(o => !o)}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 transition px-3 py-2 rounded-xl text-white text-sm font-semibold"
              >
                <Avatar name={selectedUser?.full_name} size="sm" />
                <div className="text-left leading-tight pr-1">
                  <div className="text-[13px] font-bold truncate max-w-[150px]">{selectedUser?.full_name || "Select user"}</div>
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
                        <button key={u.id} onClick={() => { setSelectedId(u.id); setUserPickerOpen(false); }}
                          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm border-b last:border-b-0 transition ${isDark?"border-slate-700 hover:bg-slate-700/50":"border-slate-100 hover:bg-slate-50"} ${sel?(isDark?"bg-slate-700/70":"bg-blue-50/70"):""}`}
                        >
                          <Avatar name={u.full_name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold truncate ${isDark?"text-slate-100":"text-slate-800"}`}>{u.full_name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                          </div>
                          {sel && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                    {users.length === 0 && <div className="px-3 py-6 text-center text-xs text-slate-400">No users available</div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Metrics strip */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-b-2xl ${isDark?"bg-slate-700":"bg-slate-100"}`}>
          {[
            { label:"Total Clients",  value:data.count,   accent:COLORS.deepBlue,     icon:Building2    },
            { label:"Active",         value:activeCount,  accent:COLORS.emeraldGreen, icon:CheckCircle2 },
            { label:"Services",       value:serviceCount, accent:"#7C3AED",            icon:Briefcase    },
            { label:"Shared Clients", value:splitClients, accent:"#F59E0B",            icon:UsersIcon    },
          ].map(m => {
            const I = m.icon;
            return (
              <div key={m.label} className={`px-4 py-3 flex items-center gap-3 ${isDark?"bg-slate-800":"bg-white"}`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${m.accent}15` }}>
                  <I className="h-4 w-4" style={{ color: m.accent }} />
                </div>
                <div className="min-w-0">
                  <div className={`text-lg font-bold leading-none ${isDark?"text-slate-100":"text-slate-800"}`}>{loading ? "—" : m.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{m.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className={`rounded-2xl border p-3 flex flex-wrap items-center gap-2 ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, city, GSTIN…"
            className={`h-10 rounded-xl text-sm pl-9 ${isDark?"bg-slate-900 border-slate-700 text-slate-100":"bg-slate-50 border-slate-200"}`}
          />
          {search && (
            <button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-200">
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1 px-2 h-10 rounded-xl border ${isDark?"bg-slate-900 border-slate-700":"bg-slate-50 border-slate-200"}`}>
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)} className={`bg-transparent text-xs font-semibold outline-none pr-1 ${isDark?"text-slate-200":"text-slate-700"}`}>
              <option value="all">All services</option>
              {allServices.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className={`flex items-center gap-1 px-2 h-10 rounded-xl border ${isDark?"bg-slate-900 border-slate-700":"bg-slate-50 border-slate-200"}`}>
            <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className={`bg-transparent text-xs font-semibold outline-none pr-1 ${isDark?"text-slate-200":"text-slate-700"}`}>
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className={`flex items-center rounded-xl border overflow-hidden ${isDark?"border-slate-700":"border-slate-200"}`}>
            <button onClick={()=>setView("grid")} className={`px-2.5 h-10 ${view==="grid"?"bg-blue-500 text-white":(isDark?"bg-slate-900 text-slate-400":"bg-slate-50 text-slate-500")}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={()=>setView("list")} className={`px-2.5 h-10 ${view==="list"?"bg-blue-500 text-white":(isDark?"bg-slate-900 text-slate-400":"bg-slate-50 text-slate-500")}`} title="List view"><ListIcon className="h-4 w-4" /></button>
          </div>
          <button onClick={()=>exportCsv(filtered,selectedUser?.full_name)} disabled={!filtered.length}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold text-white shadow disabled:opacity-50" style={{ background:GRADIENT }}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className={`rounded-2xl border p-12 flex items-center justify-center ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-slate-500">Loading assigned clients…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-2xl border p-12 text-center ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
          <Building2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className={`text-sm font-semibold ${isDark?"text-slate-300":"text-slate-600"}`}>
            {search||serviceFilter!=="all"||statusFilter!=="all" ? "No clients match your filters" : "No clients assigned to this user"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {search||serviceFilter!=="all"||statusFilter!=="all"
              ? "Try clearing search or filters."
              : isPriv
                ? "Use Bulk Assign above to assign clients to this user, or manage from the Clients page."
                : "Clients assigned to you will appear here."}
          </p>
          {isPriv && !search && serviceFilter === "all" && statusFilter === "all" && (
            <button
              onClick={() => setBulkAssignOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow"
              style={{ background: GRADIENT }}
            >
              <UserPlus className="h-4 w-4" /> Bulk Assign Clients
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => (
            <motion.div key={c.id} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
              className={`rounded-2xl border p-4 hover:shadow-md transition group ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}
            >
              <div className="flex items-start gap-3">
                <Avatar name={c.company_name} />
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-sm leading-tight truncate ${isDark?"text-slate-100":"text-slate-800"}`}>{c.company_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusPill status={c.status} isDark={isDark} />
                    {c.client_type_label && <span className="text-[10px] font-semibold text-slate-400">{c.client_type_label}</span>}
                  </div>
                </div>
                <button onClick={()=>setEditingClient(c)}
                  className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${isDark?"bg-slate-700 text-slate-300 hover:bg-blue-600 hover:text-white":"bg-slate-100 text-slate-500 hover:bg-blue-600 hover:text-white"}`}
                  title="Quick Edit"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 space-y-1.5">
                {c.email && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Mail className="h-3 w-3 flex-shrink-0" /><span className="truncate">{c.email}</span></div>}
                {c.phone && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Phone className="h-3 w-3 flex-shrink-0" /><span className="truncate">{c.phone}</span></div>}
                {(c.city||c.state) && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{[c.city,c.state].filter(Boolean).join(", ")}</span></div>}
              </div>
              <div className={`mt-3 pt-3 border-t ${isDark?"border-slate-700":"border-slate-100"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3 w-3 text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Services assigned to {selectedUser?.full_name?.split(" ")[0] || "user"}
                    </span>
                  </div>
                  <button onClick={()=>setEditingClient(c)}
                    className={`text-[10px] font-semibold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition ${isDark?"text-blue-400 hover:text-blue-300":"text-blue-500 hover:text-blue-700"}`}
                  >Edit <ChevronRight className="h-3 w-3" /></button>
                </div>
                <ServiceChips services={c.assigned_services} allClientServices={c.services} />
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className={`rounded-2xl border overflow-hidden ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
          <div className={`grid grid-cols-12 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider ${isDark?"bg-slate-900/50 text-slate-400 border-b border-slate-700":"bg-slate-50 text-slate-500 border-b border-slate-100"}`}>
            <div className="col-span-4">Client</div>
            <div className="col-span-3">Contact</div>
            <div className="col-span-2">Location</div>
            <div className="col-span-2">Assigned Services</div>
            <div className="col-span-1 text-right">Edit</div>
          </div>
          {filtered.map((c, idx) => (
            <div key={c.id}
              className={`grid grid-cols-12 px-4 py-3 items-center text-xs ${idx!==filtered.length-1?(isDark?"border-b border-slate-700":"border-b border-slate-100"):""} ${isDark?"hover:bg-slate-700/30":"hover:bg-slate-50/70"}`}
            >
              <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                <Avatar name={c.company_name} />
                <div className="min-w-0">
                  <div className={`font-bold text-sm truncate ${isDark?"text-slate-100":"text-slate-800"}`}>{c.company_name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusPill status={c.status} isDark={isDark} />
                    {c.client_type_label && <span className="text-[10px] text-slate-400">{c.client_type_label}</span>}
                  </div>
                </div>
              </div>
              <div className="col-span-3 min-w-0">
                <div className="truncate text-slate-500 dark:text-slate-400">{c.email||"—"}</div>
                <div className="truncate text-slate-400">{c.phone||"—"}</div>
              </div>
              <div className="col-span-2 truncate text-slate-500 dark:text-slate-400">{[c.city,c.state].filter(Boolean).join(", ")||"—"}</div>
              <div className="col-span-2"><ServiceChips services={c.assigned_services} allClientServices={c.services} /></div>
              <div className="col-span-1 flex justify-end">
                <button onClick={()=>setEditingClient(c)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isDark?"text-slate-400 hover:bg-blue-600 hover:text-white":"text-slate-400 hover:bg-blue-600 hover:text-white"}`}
                  title="Quick Edit"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QUICK-EDIT MODAL */}
      <AnimatePresence>
        {editingClient && (
          <QuickEditModal
            key={editingClient.id}
            client={editingClient}
            isDark={isDark}
            onClose={() => setEditingClient(null)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>

      {/* BULK ASSIGN MODAL */}
      <AnimatePresence>
        {bulkAssignOpen && (
          <BulkAssignModal
            key="bulk-assign"
            open={bulkAssignOpen}
            allClients={data.clients || []}
            users={users}
            isDark={isDark}
            onClose={() => setBulkAssignOpen(false)}
            onComplete={handleBulkComplete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
