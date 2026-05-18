// =============================================================================
// GeneralSettings.jsx — With Assigned Clients tab (admin cross-visibility)
// =============================================================================
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from "@/lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Camera, Phone, Calendar as CalendarIcon,
  Save, Loader2, CheckCircle2, Mail, Shield,
  Settings, Clock, Hash, Star, Trophy, TrendingUp,
  CheckSquare, Timer, Zap, Users, Building2, ChevronDown,
  Search, MapPin, Tag, Eye, UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GoogleDriveConnect from "@/components/GoogleDriveConnect";

const COLORS = {
  deepBlue:     "#0D3B66",
  mediumBlue:   "#1F6FB2",
  emeraldGreen: "#1FAF5A",
  lightGreen:   "#5CCB5F",
};

const GRADIENT   = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;

const BADGE_CFG = {
  "Star Performer": { color: '#F59E0B', bg: '#FEF3C7', darkBg: '#78350f40', icon: '⭐' },
  "Top Performer":  { color: '#3B82F6', bg: '#DBEAFE', darkBg: '#1e3a8a40', icon: '🏆' },
  "Good Performer": { color: '#10B981', bg: '#D1FAE5', darkBg: '#065f4640', icon: '👍' },
};

const TABS = [
  { id: "profile",      label: "Profile",          icon: User     },
  { id: "clients",      label: "Assigned Clients",  icon: Users    },
  { id: "integrations", label: "Integrations",      icon: Settings },
];

function MiniBar({ value, color, isDark }) {
  return (
    <div className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value || 0, 100)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

// ── Assigned Clients Tab ──────────────────────────────────────────────────────
function AssignedClientsTab({ user, isDark }) {
  const [clients, setClients]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [allUsers, setAllUsers]             = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserName, setSelectedUserName] = useState("My");
  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const [userSearch, setUserSearch]         = useState("");
  const dropdownRef = useRef(null);
  const isAdmin = user?.role === "admin";

  // Init selected user from auth
  useEffect(() => {
    if (user?.id) {
      setSelectedUserId(user.id);
      setSelectedUserName(user.full_name || "My");
    }
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch all users list (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/users").then(res => setAllUsers(res.data || [])).catch(() => {});
  }, [isAdmin]);

  const fetchClients = useCallback(async (uid) => {
    if (!uid) return;
    setLoading(true);
    try {
      const res = await api.get(`/users/${uid}/assigned-clients`);
      setClients(res.data?.clients || []);
    } catch (err) {
      if (err?.response?.status === 403)
        toast.error("You don't have permission to view this user's clients");
      else
        toast.error("Failed to load assigned clients");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) fetchClients(selectedUserId);
  }, [selectedUserId, fetchClients]);

  const filteredUsers = allUsers.filter(u =>
    (u.full_name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredClients = clients.filter(c =>
    (c.company_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").includes(search) ||
    (c.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status) => {
    switch ((status || "").toLowerCase()) {
      case "active":   return { bg: isDark ? "#064e3b40" : "#d1fae5", text: "#059669" };
      case "inactive": return { bg: isDark ? "#44403c40" : "#f5f5f4", text: "#78716c" };
      case "prospect": return { bg: isDark ? "#1e3a8a40" : "#dbeafe", text: "#2563eb" };
      default:         return { bg: isDark ? "#1e293b"   : "#f8fafc", text: "#64748b" };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h3 className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            {isAdmin && selectedUserId !== user?.id
              ? `${selectedUserName}'s Assigned Clients`
              : "My Assigned Clients"}
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {loading ? "Loading…" : `${filteredClients.length} client${filteredClients.length !== 1 ? "s" : ""} found`}
          </p>
        </div>

        {/* Admin user selector dropdown */}
        {isAdmin && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all
                ${isDark
                  ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
              <Eye className="w-3.5 h-3.5 text-blue-500" />
              <span className="max-w-[130px] truncate">{selectedUserName}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute right-0 top-full mt-1.5 w-64 rounded-2xl border shadow-xl z-50
                    ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
                >
                  <div className={`p-2 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        autoFocus
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search users…"
                        className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none
                          ${isDark ? 'bg-slate-700 text-slate-200 placeholder-slate-500' : 'bg-slate-50 text-slate-700 placeholder-slate-400'}`}
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1">
                    {/* Own entry always first */}
                    <button
                      onClick={() => {
                        setSelectedUserId(user.id);
                        setSelectedUserName(user.full_name || "My");
                        setDropdownOpen(false);
                        setUserSearch("");
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-colors
                        ${selectedUserId === user.id
                          ? isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-700'
                          : isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                    >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                        style={{ background: GRADIENT }}>
                        {(user.full_name || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{user.full_name} (Me)</p>
                        <p className={`text-[10px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{user.email}</p>
                      </div>
                      {selectedUserId === user.id && <UserCheck className="w-3 h-3 ml-auto text-blue-500 flex-shrink-0" />}
                    </button>

                    {filteredUsers
                      .filter(u => u.id !== user.id && u.is_active !== false)
                      .map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setSelectedUserName(u.full_name || u.email || "User");
                            setDropdownOpen(false);
                            setUserSearch("");
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-colors
                            ${selectedUserId === u.id
                              ? isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-50 text-blue-700'
                              : isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                        >
                          <div className="w-6 h-6 rounded-lg flex-shrink-0 overflow-hidden rounded-lg">
                            {u.profile_picture ? (
                              <img src={u.profile_picture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-black"
                                style={{ background: GRADIENT }}>
                                {(u.full_name || u.email || "?")[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{u.full_name || u.email}</p>
                            <p className={`text-[10px] truncate capitalize ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{u.role}</p>
                          </div>
                          {selectedUserId === u.id && <UserCheck className="w-3 h-3 ml-auto text-blue-500 flex-shrink-0" />}
                        </button>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, city…"
          className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-colors
            ${isDark
              ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-blue-500'
              : 'bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400 focus:border-blue-400'
            }`}
        />
      </div>

      {/* Client list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading clients…</span>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed
          ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
          <Building2 className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">
            {search ? "No clients match your search" : "No clients assigned"}
          </p>
          {!search && (
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
              Ask your admin to assign clients to this account
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredClients.map((client, i) => {
            const sc = statusColor(client.status);
            return (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-2xl border p-4 space-y-3 transition-shadow hover:shadow-md
                  ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-white border-slate-200'}`}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                      style={{ background: GRADIENT }}>
                      {(client.company_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-bold text-sm leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                        {client.company_name}
                      </p>
                      {client.client_type_label && (
                        <p className={`text-[10px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {client.client_type_label}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg capitalize"
                    style={{ background: sc.bg, color: sc.text }}
                  >
                    {client.status || "—"}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1.5">
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-xs truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{client.phone}</span>
                    </div>
                  )}
                  {(client.city || client.state) && (
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {[client.city, client.state].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                  {client.gstin && (
                    <div className="flex items-center gap-2">
                      <Tag className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{client.gstin}</span>
                    </div>
                  )}
                </div>

                {/* Services */}
                {client.services?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {client.services.slice(0, 4).map(svc => (
                      <span
                        key={svc}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg
                          ${isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}
                      >
                        {svc}
                      </span>
                    ))}
                    {client.services.length > 4 && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg
                        ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                        +{client.services.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GeneralSettings() {
  const { user, refreshUser } = useAuth();
  const isDark  = useDark();
  const fileRef = useRef(null);

  const [activeTab, setActiveTab] = useState("profile");
  const [profile, setProfile] = useState({
    full_name: "", phone: "", birthday: "", profile_picture: "",
  });
  const [loading,  setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [perf,     setPerf]     = useState(null);
  const [perfLoad, setPerfLoad] = useState(true);

  useEffect(() => {
    if (!user) return;
    setProfile({
      full_name:       user.full_name || "",
      phone:           user.phone || "",
      birthday:        user.birthday ? user.birthday.slice(0, 10) : "",
      profile_picture: user.profile_picture || "",
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.get("/reports/performance-rankings?period=monthly")
      .then(res => {
        const list = res.data || [];
        const mine = list.find(r => r.user_id === user.id || r.user_id === String(user.id));
        setPerf(mine || null);
      })
      .catch(() => setPerf(null))
      .finally(() => setPerfLoad(false));
  }, [user]);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setProfile(p => ({ ...p, profile_picture: reader.result }));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!profile.full_name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await api.put(`/users/${user.id}`, {
        full_name:       profile.full_name.trim(),
        phone:           profile.phone || null,
        birthday:        profile.birthday || null,
        profile_picture: profile.profile_picture || null,
      });
      await refreshUser();
      toast.success("Profile updated");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const badgeCfg = perf?.badge ? (BADGE_CFG[perf.badge] || BADGE_CFG["Good Performer"]) : null;

  return (
    <div className="space-y-4 w-full min-w-0 overflow-x-hidden">

      {/* TOP BANNER */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div
          className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{ background: GRADIENT, boxShadow: "0 8px 32px rgba(13,59,102,0.2)" }}
        >
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">General Settings</h1>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mt-0.5">
                Manage identity &amp; preferences
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* TAB BAR */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <div className={`flex items-center gap-1 p-1 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-1 justify-center
                  ${isActive
                    ? 'text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                style={isActive ? { background: GRADIENT } : {}}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* TAB CONTENT */}
      <AnimatePresence mode="wait">

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">

              {/* LEFT: Profile card */}
              <div className="lg:col-span-2 flex flex-col">
                <div className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="h-20 relative flex-shrink-0" style={{ background: GRADIENT }}>
                    <div className="absolute inset-0 opacity-10"
                      style={{ background: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
                    {perf && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-xl">
                        <Trophy className="h-3 w-3 text-yellow-300" />
                        <span className="text-white text-[11px] font-bold">#{perf.rank}</span>
                      </div>
                    )}
                  </div>

                  <div className="px-5 pb-4 -mt-[52px] flex flex-col items-center text-center">
                    <div className="relative group mb-3">
                      <div
                        className="w-[110px] h-[110px] rounded-2xl overflow-hidden"
                        style={{ boxShadow: `0 0 0 4px ${isDark ? '#1e293b' : '#fff'}, 0 8px 24px rgba(0,0,0,0.18)` }}
                      >
                        {profile.profile_picture ? (
                          <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-4xl font-black" style={{ background: GRADIENT }}>
                            {user?.full_name?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-lg flex items-center justify-center hover:scale-110 transition-all"
                      >
                        <Camera className="w-4 h-4 text-blue-500" />
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                    </div>
                    <h2 className={`font-bold text-base leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{user?.full_name}</h2>
                    <p className={`text-xs mt-0.5 truncate max-w-full ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user?.email}</p>
                    {badgeCfg && (
                      <span
                        className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-xl text-[11px] font-bold"
                        style={{ background: isDark ? badgeCfg.darkBg : badgeCfg.bg, color: badgeCfg.color }}
                      >
                        {badgeCfg.icon} {perf.badge}
                      </span>
                    )}
                  </div>

                  <div className={`border-t px-4 py-3 space-y-2.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><Hash className="h-3 w-3" />Account ID</span>
                      <span className={`font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>#{user?.id?.slice(-6)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><Star className="h-3 w-3" />Status</span>
                      <span className="flex items-center gap-1 text-emerald-500 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Active
                      </span>
                    </div>
                    {user?.departments?.length > 0 && (
                      <div className="flex items-start justify-between text-xs gap-2">
                        <span className={`flex items-center gap-1.5 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><Settings className="h-3 w-3" />Depts</span>
                        <span className={`font-semibold text-right leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{user.departments.join(', ')}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><Trophy className="h-3 w-3" />Ranking</span>
                      {perfLoad ? (
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Loading…</span>
                      ) : perf ? (
                        <span className="flex items-center gap-1 font-bold text-amber-500">
                          #{perf.rank}
                          <span className={`text-[10px] font-medium ml-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>· {perf.overall_score}% score</span>
                        </span>
                      ) : (
                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No data yet</span>
                      )}
                    </div>
                  </div>

                  <div className={`border-t px-4 py-3 space-y-3 flex-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>This Month's Performance</p>
                    {perfLoad ? (
                      <div className={`flex items-center justify-center py-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading stats…</span>
                      </div>
                    ) : perf ? (
                      [
                        { label: 'Attendance',      val: perf.attendance_percent,      color: '#3B82F6', icon: <Timer className="h-3 w-3" /> },
                        { label: 'Task Completion', val: perf.task_completion_percent, color: '#10B981', icon: <CheckSquare className="h-3 w-3" /> },
                        { label: 'Timely Punch-In', val: perf.timely_punchin_percent,  color: '#F59E0B', icon: <Zap className="h-3 w-3" /> },
                        { label: 'Overall Score',   val: perf.overall_score,           color: '#8B5CF6', icon: <TrendingUp className="h-3 w-3" /> },
                      ].map(stat => (
                        <div key={stat.label} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px]" style={{ color: stat.color }}>{stat.icon}{stat.label}</span>
                            <span className="text-[11px] font-bold" style={{ color: stat.color }}>{(stat.val || 0).toFixed(1)}%</span>
                          </div>
                          <MiniBar value={stat.val} color={stat.color} isDark={isDark} />
                        </div>
                      ))
                    ) : (
                      <p className={`text-xs text-center py-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No performance data available yet.</p>
                    )}
                  </div>

                  <div className={`border-t px-4 py-3 flex items-start gap-2.5 ${isDark ? 'border-slate-700 bg-blue-950/20' : 'border-slate-100 bg-blue-50/60'}`}>
                    <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                      Contact your admin to change passwords or system permissions.
                    </p>
                  </div>
                </div>
              </div>

              {/* RIGHT: Edit form */}
              <div className="lg:col-span-3 flex flex-col">
                <div className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-100 bg-slate-50/60'}`}>
                    <div className={`p-1.5 rounded-lg ${isDark ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                      <User className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Personal Information</h3>
                      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Update your contact and profile details</p>
                    </div>
                  </div>

                  <form onSubmit={handleSave} className="p-5 space-y-4 flex flex-col flex-1">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Name</Label>
                      <Input
                        value={profile.full_name}
                        onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                        className={`h-10 rounded-xl text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                        placeholder="Your full name"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                          <Input type="tel" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                            className={`h-10 rounded-xl text-sm pl-9 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                            placeholder="+91 00000 00000" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Birthday</Label>
                        <div className="relative">
                          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                          <Input type="date" value={profile.birthday} onChange={e => setProfile(p => ({ ...p, birthday: e.target.value }))}
                            className={`h-10 rounded-xl text-sm pl-9 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <Input value={user?.email || ""} disabled
                          className={`h-10 rounded-xl text-sm pl-9 opacity-50 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`} />
                      </div>
                    </div>

                    {(user?.punch_in_time || user?.punch_out_time) && (
                      <div className={`rounded-xl border p-3.5 ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-2 mb-2.5">
                          <Clock className="h-3.5 w-3.5 text-blue-500" />
                          <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Work Shift</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          {[
                            { label: 'Punch In',  val: user?.punch_in_time  },
                            { label: 'Grace',     val: user?.grace_time     },
                            { label: 'Punch Out', val: user?.punch_out_time },
                          ].map(s => (
                            <div key={s.label}>
                              <p className={`text-[10px] uppercase tracking-wider mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.label}</p>
                              <p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{s.val || '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={`flex justify-end pt-2 border-t mt-auto ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <motion.button
                        type="submit"
                        disabled={loading}
                        whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-50 transition-all hover:brightness-105"
                        style={{ background: loading ? '#94a3b8' : saved ? GRAD_GREEN : GRADIENT }}
                      >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
                          : saved  ? <><CheckCircle2 className="w-4 h-4" />Saved!</>
                          :          <><Save className="w-4 h-4" />Save Changes</>}
                      </motion.button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── ASSIGNED CLIENTS TAB ── */}
        {activeTab === "clients" && (
          <motion.div
            key="clients"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-100 bg-slate-50/60'}`}>
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Assigned Clients</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {user?.role === "admin" ? "View clients assigned to any user" : "Clients assigned to your account"}
                  </p>
                </div>
              </div>
              <div className="p-5">
                <AssignedClientsTab user={user} isDark={isDark} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── INTEGRATIONS TAB ── */}
        {activeTab === "integrations" && (
          <motion.div
            key="integrations"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex items-center gap-2.5 px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-100 bg-slate-50/60'}`}>
                <div className={`p-1.5 rounded-lg ${isDark ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                  <Settings className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Integrations</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Connect external services</p>
                </div>
              </div>
              <div className="p-5">
                <GoogleDriveConnect isDark={isDark} />
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
