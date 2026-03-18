import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isToday, parseISO, addMonths, subMonths, isBefore,
} from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MapPin, Calendar, Clock, Plus, X, ChevronLeft, ChevronRight,
  User, MessageSquare, Repeat, Building2, CheckCircle2,
  XCircle, AlertCircle, RotateCcw, Edit3, Trash2,
  Send, ChevronDown, ClipboardList, Loader2, Check,
} from "lucide-react";

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  deepBlue:   "#0D3B66",
  mediumBlue: "#1F6FB2",
  emerald:    "#1FAF5A",
  lightGreen: "#5CCB5F",
  coral:      "#FF6B6B",
  amber:      "#F59E0B",
};

const spring  = { type: "spring", stiffness: 300, damping: 24 };
const fadeUp  = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

// ─── Status meta ─────────────────────────────────────────────────────────────
const STATUS_META = {
  scheduled:   { label: "Scheduled",   icon: Clock,        color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/30",    border: "border-blue-200 dark:border-blue-800"    },
  completed:   { label: "Completed",   icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30", border: "border-emerald-200 dark:border-emerald-800" },
  cancelled:   { label: "Cancelled",   icon: XCircle,      color: "text-red-500",     bg: "bg-red-50 dark:bg-red-900/30",      border: "border-red-200 dark:border-red-800"      },
  missed:      { label: "Missed",      icon: AlertCircle,  color: "text-orange-500",  bg: "bg-orange-50 dark:bg-orange-900/30", border: "border-orange-200 dark:border-orange-800"},
  rescheduled: { label: "Rescheduled", icon: RotateCcw,    color: "text-purple-500",  bg: "bg-purple-50 dark:bg-purple-900/30", border: "border-purple-200 dark:border-purple-800"},
};

const PRIORITY_META = {
  low:    { label: "Low",    color: "text-blue-500",   dot: "bg-blue-400"   },
  medium: { label: "Medium", color: "text-amber-500",  dot: "bg-amber-400"  },
  high:   { label: "High",   color: "text-orange-500", dot: "bg-orange-400" },
  urgent: { label: "Urgent", color: "text-red-600",    dot: "bg-red-500"    },
};

// ─── API helpers ──────────────────────────────────────────────────────────────
const fetchVisits  = (p) => api.get("/visits", { params: p }).then(r => r.data);
const fetchClients = ()  => api.get("/clients").then(r => r.data);
const fetchUsers   = ()  => api.get("/users").then(r => r.data);
const fetchSummary = (uid, month) =>
  api.get("/visits/summary", { params: { user_id: uid, month } }).then(r => r.data);

// ─── Tiny reusable pieces ─────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }) {
  const m    = STATUS_META[status] || STATUS_META.scheduled;
  const Icon = m.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-lg font-medium border",
      m.bg, m.border, m.color,
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
    )}>
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {m.label}
    </span>
  );
}

function PriorityDot({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", m.dot)} />
      <span className={cn("text-[10px] font-semibold", m.color)}>{m.label}</span>
    </span>
  );
}

function Avatar({ src, name, size = 7 }) {
  return src ? (
    <img src={src} alt={name}
      className={`w-${size} h-${size} rounded-full object-cover ring-2 ring-white dark:ring-slate-700 flex-shrink-0`} />
  ) : (
    <div
      className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
    >
      {name?.charAt(0)?.toUpperCase() || "?"}
    </div>
  );
}

// ─── Yes / No quick-action button pair ───────────────────────────────────────
function QuickStatusButtons({ visit, onDone }) {
  const qc = useQueryClient();

  const quickMut = useMutation({
    mutationFn: (done) =>
      api.post(`/visits/${visit.id}/quick-status`, { done }),
    onSuccess: (_, done) => {
      toast.success(done ? "Marked as completed ✓" : "Marked as missed");
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["visits-upcoming-dashboard"] });
      onDone?.();
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Update failed"),
  });

  const pending = quickMut.isPending;

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {/* YES — visit done */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.93 }}
        disabled={pending}
        onClick={() => quickMut.mutate(true)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold
          bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm
          disabled:opacity-50 transition-colors"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Yes
      </motion.button>

      {/* NO — visit missed */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.93 }}
        disabled={pending}
        onClick={() => quickMut.mutate(false)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold
          bg-slate-100 hover:bg-red-50 dark:bg-slate-700 dark:hover:bg-red-900/30
          text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400
          border border-slate-200 dark:border-slate-600 hover:border-red-200 dark:hover:border-red-800
          disabled:opacity-50 transition-colors"
      >
        <X className="h-3 w-3" />
        No
      </motion.button>
    </div>
  );
}

// ─── Compact Visit Card ───────────────────────────────────────────────────────
// Includes: date badge · purpose · client · meta · Yes/No · status dropdown · edit · delete
function VisitCard({ v, onClick, onEdit, onDelete, currentUser }) {
  const qc = useQueryClient();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const isOver    = isBefore(parseISO(v.visit_date), new Date()) && v.status === "scheduled";
  const showQuick = v.status === "scheduled" || v.status === "rescheduled";

  const isAdmin = currentUser?.role === "admin";
  const isOwner = v.assigned_to === currentUser?.id;
  const canWrite = isAdmin || isOwner;

  // Status change mutation — used by the inline dropdown on the card
  const statusMut = useMutation({
    mutationFn: (newStatus) => api.patch(`/visits/${v.id}`, { status: newStatus }),
    onSuccess: (_, newStatus) => {
      toast.success(`Status updated to ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["visits-upcoming-dashboard"] });
      setShowStatusMenu(false);
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Update failed"),
  });

  // Delete mutation — inline on the card
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/visits/${v.id}`),
    onSuccess: () => {
      toast.success("Visit deleted");
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["visits-upcoming-dashboard"] });
    },
    onError: (err) => toast.error(err.response?.data?.detail || "Delete failed"),
  });

  return (
    <motion.div
      variants={fadeUp}
      layout
      whileHover={{ y: -1, boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}
      transition={spring}
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-slate-800 border rounded-xl cursor-pointer transition-all group",
        isOver
          ? "border-orange-200 dark:border-orange-800"
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">

        {/* ── Date badge ── */}
        <div className="flex-shrink-0 w-11 text-center">
          <div className="rounded-lg overflow-hidden border dark:border-slate-700">
            <div
              className="py-0.5 text-[8px] font-black text-white uppercase tracking-wide"
              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
            >
              {format(parseISO(v.visit_date), "MMM")}
            </div>
            <div className="py-0.5 bg-white dark:bg-slate-800">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 leading-none">
                {format(parseISO(v.visit_date), "d")}
              </p>
              <p className="text-[9px] text-slate-400 font-medium leading-tight">
                {format(parseISO(v.visit_date), "EEE")}
              </p>
            </div>
          </div>
          {v.visit_time && (
            <p className="text-[9px] text-slate-400 mt-0.5 font-medium leading-none">{v.visit_time}</p>
          )}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          {/* Row 1: purpose + status badge + flags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
              {v.purpose}
            </p>
            <StatusBadge status={v.status} />
            {isOver && (
              <span className="text-[9px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/30
                border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded-md">
                Overdue
              </span>
            )}
            {v.recurrence && v.recurrence !== "none" && (
              <span className="text-[9px] font-semibold text-purple-500 bg-purple-50 dark:bg-purple-900/30
                border border-purple-200 dark:border-purple-800 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                <Repeat className="h-2 w-2" />{v.recurrence}
              </span>
            )}
          </div>

          {/* Row 2: client + location + services + comments */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
              <Building2 className="h-3 w-3 flex-shrink-0 text-slate-400" />
              {v.client_name || "—"}
            </span>
            {v.location && (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400 truncate max-w-[120px]">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                {v.location.slice(0, 28)}{v.location.length > 28 ? "…" : ""}
              </span>
            )}
            {v.services?.length > 0 && (
              <div className="flex items-center gap-0.5">
                {v.services.slice(0, 2).map(s => (
                  <span key={s}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700
                      text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                    {s}
                  </span>
                ))}
                {v.services.length > 2 && (
                  <span className="text-[9px] text-slate-400">+{v.services.length - 2}</span>
                )}
              </div>
            )}
            {v.comments?.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                <MessageSquare className="h-2.5 w-2.5" />{v.comments.length}
              </span>
            )}
          </div>
        </div>

        {/* ── Right action cluster ── */}
        <div
          className="flex items-center gap-1.5 flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          {/* Priority dot + avatar (hidden on small screens) */}
          <div className="hidden sm:flex flex-col items-end gap-1 mr-1">
            <PriorityDot priority={v.priority} />
            <Avatar src={v.assigned_to_picture} name={v.assigned_to_name} size={6} />
          </div>

          {/* Yes / No — only for scheduled/rescheduled */}
          {showQuick && <QuickStatusButtons visit={v} />}

          {/* Completed pill */}
          {v.status === "completed" && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg
              bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800
              text-emerald-600 text-[10px] font-bold">
              <CheckCircle2 className="h-3 w-3" /> Done
            </span>
          )}

          {/* Missed pill */}
          {v.status === "missed" && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg
              bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800
              text-orange-500 text-[10px] font-bold">
              <AlertCircle className="h-3 w-3" /> Missed
            </span>
          )}

          {/* Divider */}
          {canWrite && (
            <div className="h-5 w-px bg-slate-200 dark:bg-slate-600 mx-0.5" />
          )}

          {/* Edit button */}
          {canWrite && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); onEdit?.(v); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500
                hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              title="Edit visit"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </motion.button>
          )}

          {/* Status dropdown chevron — matching the screenshot */}
          {canWrite && (
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); setShowStatusMenu(s => !s); }}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600
                  text-slate-500 dark:text-slate-400
                  hover:border-slate-300 dark:hover:border-slate-500
                  hover:bg-slate-50 dark:hover:bg-slate-700
                  transition-colors"
                title="Change status"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </motion.button>

              <AnimatePresence>
                {showStatusMenu && (
                  <motion.div
                    className="absolute right-0 top-full mt-1 w-40 z-50
                      bg-white dark:bg-slate-800
                      border border-slate-200 dark:border-slate-700
                      rounded-xl shadow-xl overflow-hidden"
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{   opacity: 0, y: -6, scale: 0.96  }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  >
                    {Object.entries(STATUS_META).map(([s, m]) => (
                      <button
                        key={s}
                        onClick={(e) => { e.stopPropagation(); statusMut.mutate(s); }}
                        disabled={statusMut.isPending}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold",
                          "hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left",
                          v.status === s ? "bg-slate-50 dark:bg-slate-700" : "",
                        )}
                      >
                        <m.icon className={cn("h-3 w-3 flex-shrink-0", m.color)} />
                        <span className={m.color}>{m.label}</span>
                        {v.status === s && (
                          <Check className="h-3 w-3 ml-auto text-slate-400" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Delete button */}
          {canWrite && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Delete this visit?")) deleteMut.mutate();
              }}
              disabled={deleteMut.isPending}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500
                hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors
                disabled:opacity-50"
              title="Delete visit"
            >
              {deleteMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />
              }
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Visit Form Modal ─────────────────────────────────────────────────────────
function VisitFormModal({ visit, clients, users, currentUser, onClose }) {
  const isEdit = !!visit?.id;
  const qc     = useQueryClient();

  const [form, setForm] = useState({
    client_id:           visit?.client_id      || "",
    assigned_to:         visit?.assigned_to    || currentUser.id,
    visit_date:          visit?.visit_date      || format(new Date(), "yyyy-MM-dd"),
    visit_time:          visit?.visit_time      || "",
    purpose:             visit?.purpose        || "",
    services:            (visit?.services || []).join(", "),
    priority:            visit?.priority       || "medium",
    notes:               visit?.notes          || "",
    location:            visit?.location       || "",
    recurrence:          visit?.recurrence     || "none",
    recurrence_end_date: visit?.recurrence_end_date || "",
  });

  const [bulkMode, setBulkMode]   = useState(false);
  const [bulkDates, setBulkDates] = useState([]);
  const [bulkCalMonth, setBulkCalMonth] = useState(new Date());
  const calDays = eachDayOfInterval({ start: startOfMonth(bulkCalMonth), end: endOfMonth(bulkCalMonth) });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleBulkDate = (d) => {
    const s = format(d, "yyyy-MM-dd");
    setBulkDates(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        services:    form.services.split(",").map(s => s.trim()).filter(Boolean),
        client_name: clients.find(c => c.id === form.client_id)?.company_name || "",
      };
      if (!payload.visit_time)          delete payload.visit_time;
      if (!payload.recurrence_end_date) delete payload.recurrence_end_date;

      if (bulkMode && bulkDates.length)
        return api.post("/visits/bulk-schedule", { ...payload, visit_dates: bulkDates });
      if (isEdit)
        return api.patch(`/visits/${visit.id}`, payload);
      return api.post("/visits", payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Visit updated" : "Visit(s) scheduled");
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["visits-upcoming-dashboard"] });
      onClose();
    },
    onError: err => toast.error(err.response?.data?.detail || "Save failed"),
  });

  const canAssign = currentUser.role === "admin" || currentUser.role === "manager";

  const inputCls = "w-full px-3 py-2 rounded-xl border dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400";
  const labelCls = "block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wider";

  return (
    <motion.div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
      style={{ background: "rgba(7,15,30,0.72)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl"
        initial={{ scale: 0.92, y: 32 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 32 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: `${C.deepBlue}12` }}>
              <Calendar className="h-4 w-4" style={{ color: C.deepBlue }} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {isEdit ? "Edit Visit" : "Schedule Visit"}
              </h2>
              <p className="text-[10px] text-slate-400">
                {isEdit ? "Update visit details" : "Create a new client visit"}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5">
          {/* Bulk toggle */}
          {!isEdit && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <Repeat className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 flex-1">
                Schedule multiple dates at once
              </span>
              <button
                onClick={() => setBulkMode(b => !b)}
                className={cn("relative h-5 w-9 rounded-full transition-colors flex-shrink-0",
                  bulkMode ? "bg-purple-500" : "bg-slate-300 dark:bg-slate-600")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  bulkMode ? "translate-x-4" : "translate-x-0.5")} />
              </button>
            </div>
          )}

          {/* Client + Assigned To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Client *</label>
              <select value={form.client_id} onChange={e => set("client_id", e.target.value)} className={inputCls}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            {canAssign && (
              <div>
                <label className={labelCls}>Assigned To</label>
                <select value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} className={inputCls}>
                  <option value={currentUser.id}>Me ({currentUser.full_name})</option>
                  {users.filter(u => u.id !== currentUser.id && u.is_active).map(u =>
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Date / bulk calendar */}
          {bulkMode ? (
            <div>
              <label className={labelCls}>Select Dates ({bulkDates.length} selected)</label>
              <div className="border dark:border-slate-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => setBulkCalMonth(m => subMonths(m, 1))}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                    <ChevronLeft className="h-4 w-4 text-slate-500" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {format(bulkCalMonth, "MMMM yyyy")}
                  </span>
                  <button onClick={() => setBulkCalMonth(m => addMonths(m, 1))}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} className="text-[9px] font-bold text-slate-400 py-1">{d}</div>
                  ))}
                  {Array(startOfMonth(bulkCalMonth).getDay()).fill(null).map((_, i) => <div key={`e${i}`} />)}
                  {calDays.map(d => {
                    const s    = format(d, "yyyy-MM-dd");
                    const sel  = bulkDates.includes(s);
                    const past = isBefore(d, new Date()) && !isToday(d);
                    return (
                      <button key={s} disabled={past} onClick={() => !past && toggleBulkDate(d)}
                        className={cn("rounded-lg py-1 text-xs font-medium transition-all",
                          sel ? "text-white" : past
                            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                            : "text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                        )}
                        style={sel ? { background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` } : {}}>
                        {format(d, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date *</label>
                <input type="date" value={form.visit_date}
                  onChange={e => set("visit_date", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Time</label>
                <input type="time" value={form.visit_time}
                  onChange={e => set("visit_time", e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {/* Purpose */}
          <div>
            <label className={labelCls}>Purpose *</label>
            <input value={form.purpose} onChange={e => set("purpose", e.target.value)}
              placeholder="e.g. Annual GST review meeting" className={inputCls} />
          </div>

          {/* Services + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Services</label>
              <input value={form.services} onChange={e => set("services", e.target.value)}
                placeholder="GST, ITR, ROC…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} className={inputCls}>
                {Object.entries(PRIORITY_META).map(([k, m]) =>
                  <option key={k} value={k}>{m.label}</option>
                )}
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className={labelCls}>Location / Address</label>
            <input value={form.location} onChange={e => set("location", e.target.value)}
              placeholder="Address or Google Maps link" className={inputCls} />
          </div>

          {/* Recurrence */}
          {!isEdit && !bulkMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Repeat</label>
                <select value={form.recurrence} onChange={e => set("recurrence", e.target.value)} className={inputCls}>
                  <option value="none">No repeat</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {form.recurrence !== "none" && (
                <div>
                  <label className={labelCls}>Until</label>
                  <input type="date" value={form.recurrence_end_date}
                    onChange={e => set("recurrence_end_date", e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              placeholder="Any pre-visit notes or reminders…"
              className={cn(inputCls, "resize-none")} />
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl h-9 text-sm">
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.client_id || !form.purpose}
              className="flex-1 rounded-xl h-9 text-sm text-white font-semibold"
              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
            >
              {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {isEdit ? "Save Changes" : bulkMode ? `Schedule ${bulkDates.length} Visits` : "Schedule Visit"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Visit Detail Panel ───────────────────────────────────────────────────────
function VisitDetailPanel({ visit, currentUser, onClose, onEdit, onDeleted }) {
  const qc = useQueryClient();
  const [comment, setComment]         = useState("");
  const [outcome, setOutcome]         = useState(visit?.outcome || "");
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusMut = useMutation({
    mutationFn: (status) => api.patch(`/visits/${visit.id}`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["visits"] });
      setShowStatusMenu(false);
      onDeleted?.();
    },
    onError: err => toast.error(err.response?.data?.detail || "Update failed"),
  });

  const outcomeMut = useMutation({
    mutationFn: () => api.patch(`/visits/${visit.id}`, { outcome }),
    onSuccess: () => { toast.success("Outcome saved"); qc.invalidateQueries({ queryKey: ["visits"] }); },
    onError: err => toast.error(err.response?.data?.detail || "Save failed"),
  });

  const commentMut = useMutation({
    mutationFn: () => api.post(`/visits/${visit.id}/comments`, { text: comment }),
    onSuccess: () => {
      toast.success("Comment added");
      setComment("");
      qc.invalidateQueries({ queryKey: ["visits"] });
      onDeleted?.();
    },
    onError: err => toast.error(err.response?.data?.detail || "Failed"),
  });

  const deleteCommentMut = useMutation({
    mutationFn: (cid) => api.delete(`/visits/${visit.id}/comments/${cid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visits"] }); onDeleted?.(); },
    onError: err => toast.error(err.response?.data?.detail || "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/visits/${visit.id}`),
    onSuccess: () => {
      toast.success("Visit deleted");
      qc.invalidateQueries({ queryKey: ["visits"] });
      onDeleted?.();
      onClose();
    },
    onError: err => toast.error(err.response?.data?.detail || "Delete failed"),
  });

  const isAdmin  = currentUser.role === "admin";
  const isOwner  = visit.assigned_to === currentUser.id;
  const canWrite = isAdmin || isOwner;

  return (
    <motion.div
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(7,15,30,0.72)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 sm:rounded-2xl rounded-t-2xl shadow-2xl"
        initial={{ y: 64, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 64, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-3.5 border-b dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between">
          <StatusBadge status={visit.status} size="md" />
          <div className="flex items-center gap-1.5">
            {canWrite && (
              <>
                <button onClick={onEdit}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                {/* Status dropdown */}
                <div className="relative">
                  <button onClick={() => setShowStatusMenu(s => !s)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <AnimatePresence>
                    {showStatusMenu && (
                      <motion.div
                        className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl shadow-xl overflow-hidden z-50"
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0,  scale: 1 }}
                        exit={{   opacity: 0, y: -6, scale: 0.96 }}
                      >
                        {Object.entries(STATUS_META).map(([s, m]) => (
                          <button key={s} onClick={() => statusMut.mutate(s)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left">
                            <m.icon className={cn("h-3 w-3", m.color)} />
                            <span className={cn("font-semibold", m.color)}>{m.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={() => window.confirm("Delete this visit?") && deleteMut.mutate()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Title block */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold text-base text-slate-800 dark:text-slate-100 leading-snug">
                {visit.purpose}
              </h2>
              <PriorityDot priority={visit.priority} />
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {visit.client_name || "—"}
              </span>
            </div>
          </div>

          {/* Quick yes/no inside detail panel too */}
          {(visit.status === "scheduled" || visit.status === "rescheduled") && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex-1">
                Was this visit completed?
              </p>
              <QuickStatusButtons visit={visit} onDone={onDeleted} />
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Calendar, label: "Date",        value: format(parseISO(visit.visit_date), "MMM d, yyyy") },
              { icon: Clock,    label: "Time",        value: visit.visit_time || "—"                           },
              { icon: User,     label: "Assigned To", value: visit.assigned_to_name || "—"                     },
              { icon: MapPin,   label: "Location",    value: visit.location || "—"                             },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">{label}</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-0.5 break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Services */}
          {visit.services?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Services</p>
              <div className="flex flex-wrap gap-1">
                {visit.services.map(s => (
                  <span key={s}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-blue-50 dark:bg-blue-900/30
                      text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {visit.notes && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-amber-800 dark:text-amber-200">{visit.notes}</p>
            </div>
          )}

          {/* Outcome */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Outcome / Result
            </p>
            <div className="flex gap-2">
              <textarea
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                rows={2}
                placeholder="What happened during the visit?"
                className="flex-1 px-3 py-2 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800
                  text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
              <button
                onClick={() => outcomeMut.mutate()}
                disabled={outcomeMut.isPending}
                className="px-3 rounded-xl text-white text-xs font-semibold disabled:opacity-60 transition-all"
                style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
              >
                {outcomeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Comments {visit.comments?.length > 0 && `(${visit.comments.length})`}
            </p>
            <div className="space-y-1.5 mb-2 max-h-44 overflow-y-auto">
              <AnimatePresence>
                {(visit.comments || []).map(c => (
                  <motion.div key={c.id} variants={fadeUp} initial="hidden" animate="visible" exit="exit"
                    className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                      {c.user_name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{c.user_name}</span>
                        <span className="text-[9px] text-slate-400">{format(parseISO(c.created_at), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 break-words">{c.text}</p>
                    </div>
                    {(c.user_id === currentUser.id || isAdmin) && (
                      <button onClick={() => deleteCommentMut.mutate(c.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {(!visit.comments || visit.comments.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-3">No comments yet</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && comment.trim() && commentMut.mutate()}
                placeholder="Add a comment (Enter to send)…"
                className="flex-1 px-3 py-2 rounded-xl border dark:border-slate-700 bg-slate-50 dark:bg-slate-800
                  text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={() => comment.trim() && commentMut.mutate()}
                disabled={!comment.trim() || commentMut.isPending}
                className="px-3 rounded-xl text-white transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Month Calendar View ──────────────────────────────────────────────────────
function MonthCalendar({ visits, currentMonth, onDayClick }) {
  const days     = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDay = startOfMonth(currentMonth).getDay();

  const visitsByDate = useMemo(() => {
    const map = {};
    visits.forEach(v => {
      if (!map[v.visit_date]) map[v.visit_date] = [];
      map[v.visit_date].push(v);
    });
    return map;
  }, [visits]);

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
        <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-2">{d}</div>
      ))}
      {Array(startDay).fill(null).map((_, i) => <div key={`e${i}`} />)}
      {days.map(d => {
        const key    = format(d, "yyyy-MM-dd");
        const dayVis = visitsByDate[key] || [];
        const today  = isToday(d);
        return (
          <button key={key} onClick={() => onDayClick(d, dayVis)}
            className={cn("min-h-[64px] p-1.5 rounded-xl border text-left transition-all hover:shadow-sm",
              today
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                : "border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50"
            )}>
            <span className={cn("text-xs font-bold",
              today ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-300")}>
              {format(d, "d")}
            </span>
            <div className="mt-0.5 space-y-0.5 overflow-hidden max-h-[36px]">
              {dayVis.slice(0, 2).map(v => {
                const m = STATUS_META[v.status] || STATUS_META.scheduled;
                return (
                  <div key={v.id}
                    className={cn("text-[8px] font-semibold px-1 py-0.5 rounded truncate", m.bg, m.color)}>
                    {v.client_name || v.purpose}
                  </div>
                );
              })}
              {dayVis.length > 2 && (
                <div className="text-[8px] text-slate-400 px-1">+{dayVis.length - 2} more</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VisitsPage() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  const [viewMode, setViewMode]         = useState("list");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUser, setFilterUser]     = useState("all");
  const [showForm, setShowForm]         = useState(false);
  const [editingVisit, setEditingVisit] = useState(null);
  const [selectedVisit, setSelectedVisit]     = useState(null);
  const [selectedDayVisits, setSelectedDayVisits] = useState(null);

  const monthStr = format(currentMonth, "yyyy-MM");
  const isAdmin  = user?.role === "admin";
  const isMgr    = user?.role === "manager";

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["visits", monthStr, filterStatus, filterUser],
    queryFn:  () => fetchVisits({
      month:   monthStr,
      status:  filterStatus !== "all" ? filterStatus : undefined,
      user_id: filterUser   !== "all" ? filterUser   : undefined,
    }),
    staleTime: 0,
  });

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const { data: users   = [] } = useQuery({ queryKey: ["users"],   queryFn: fetchUsers, enabled: isAdmin || isMgr });
  const { data: summary }      = useQuery({
    queryKey: ["visits-summary", filterUser !== "all" ? filterUser : user?.id, monthStr],
    queryFn:  () => fetchSummary(filterUser !== "all" ? filterUser : user?.id, monthStr),
  });

  // Keep detail panel in sync when list refreshes
  useEffect(() => {
    if (selectedVisit) {
      const updated = visits.find(v => v.id === selectedVisit.id);
      if (updated) setSelectedVisit(updated);
    }
  }, [visits]);

  const statCards = [
    { label: "Total",     value: summary?.total || 0,                                                            color: C.deepBlue   },
    { label: "Completed", value: summary?.by_status?.completed || 0,                                             color: C.emerald    },
    { label: "Upcoming",  value: summary?.by_status?.scheduled || 0,                                             color: C.mediumBlue },
    { label: "Missed",    value: (summary?.by_status?.missed || 0) + (summary?.by_status?.cancelled || 0),       color: C.coral      },
  ];

  return (
    <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="visible">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Client Visits</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {format(currentMonth, "MMMM yyyy")} · {visits.length} visit{visits.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl border dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 p-0.5">
            {[["list", ClipboardList], ["calendar", Calendar]].map(([mode, Icon]) => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === mode ? "text-white shadow-sm" : "text-slate-500 dark:text-slate-400")}
                style={viewMode === mode ? { background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` } : {}}>
                <Icon className="h-3.5 w-3.5" />
                <span className="capitalize hidden sm:inline">{mode}</span>
              </button>
            ))}
          </div>
          <Button
            onClick={() => { setEditingVisit(null); setShowForm(true); }}
            className="rounded-xl text-white font-semibold shadow-sm h-9"
            style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Schedule
          </Button>
        </div>
      </motion.div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color }}>{value}</p>
            {label === "Completed" && summary?.total > 0 && (
              <div className="mt-2 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${summary?.completion_rate || 0}%`, background: `linear-gradient(90deg, ${C.emerald}, ${C.lightGreen})` }} />
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-xl px-2 py-1.5">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 w-28 text-center">
            {format(currentMonth, "MMM yyyy")}
          </span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>

        {(isAdmin || isMgr) && (
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="px-3 py-2 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="all">All Users</option>
            {users.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )}

        <button onClick={() => setCurrentMonth(new Date())}
          className="px-3 py-2 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium">
          Today
        </button>
      </motion.div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
          </div>
        ) : visits.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center py-14 gap-4">
            <div className="p-4 rounded-2xl" style={{ background: `${C.deepBlue}10` }}>
              <MapPin className="h-7 w-7" style={{ color: C.deepBlue }} />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                No visits for {format(currentMonth, "MMMM yyyy")}
              </p>
              <p className="text-sm text-slate-400 mt-1">Schedule a client visit to get started</p>
            </div>
            <Button onClick={() => setShowForm(true)} className="rounded-xl text-white h-9"
              style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
              <Plus className="h-4 w-4 mr-1.5" /> Schedule First Visit
            </Button>
          </div>
        ) : viewMode === "calendar" ? (
          <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-4 shadow-sm">
            <MonthCalendar visits={visits} currentMonth={currentMonth}
              onDayClick={(d, dayVis) => {
                if (dayVis.length === 1)      setSelectedVisit(dayVis[0]);
                else if (dayVis.length > 1)   setSelectedDayVisits({ date: d, visits: dayVis });
              }} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence>
              {visits.map(v => (
                <VisitCard
                  key={v.id}
                  v={v}
                  currentUser={user}
                  onClick={() => setSelectedVisit(v)}
                  onEdit={(visit) => { setEditingVisit(visit); setShowForm(true); }}
                  onDelete={() => qc.invalidateQueries({ queryKey: ["visits"] })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ── Day picker (calendar multi-visit) ───────────────────────────── */}
      <AnimatePresence>
        {selectedDayVisits && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            style={{ background: "rgba(7,15,30,0.6)", backdropFilter: "blur(6px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setSelectedDayVisits(null)}
          >
            <motion.div
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
            >
              <div className="px-4 py-3.5 border-b dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {format(selectedDayVisits.date, "MMMM d, yyyy")}
                  </h3>
                  <p className="text-xs text-slate-400">{selectedDayVisits.visits.length} visits</p>
                </div>
                <button onClick={() => setSelectedDayVisits(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
                {selectedDayVisits.visits.map(v => (
                  <button key={v.id}
                    onClick={() => { setSelectedVisit(v); setSelectedDayVisits(null); }}
                    className="w-full text-left p-3 rounded-xl border dark:border-slate-700
                      hover:border-blue-300 dark:hover:border-blue-700
                      bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{v.purpose}</p>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{v.client_name}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <VisitFormModal
            visit={editingVisit}
            clients={clients}
            users={users}
            currentUser={user}
            onClose={() => { setShowForm(false); setEditingVisit(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── Detail panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedVisit && (
          <VisitDetailPanel
            visit={selectedVisit}
            currentUser={user}
            onClose={() => setSelectedVisit(null)}
            onEdit={() => { setEditingVisit(selectedVisit); setShowForm(true); setSelectedVisit(null); }}
            onDeleted={() => {
              qc.invalidateQueries({ queryKey: ["visits"] });
              const updated = visits.find(v => v.id === selectedVisit?.id);
              if (updated) setSelectedVisit(updated);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
