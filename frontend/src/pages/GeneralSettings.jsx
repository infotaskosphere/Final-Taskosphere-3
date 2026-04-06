// =============================================================================
// GeneralSettings.jsx — Modern compact layout, top banner preserved
// =============================================================================
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  User, Camera, Phone, Calendar as CalendarIcon,
  Save, Loader2, CheckCircle2, Mail, Shield,
  Settings, Clock, Hash, Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const COLORS = {
  deepBlue:     "#0D3B66",
  mediumBlue:   "#1F6FB2",
  emeraldGreen: "#1FAF5A",
  lightGreen:   "#5CCB5F",
};

const GRADIENT   = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const GRAD_GREEN = `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`;

const ROLE_COLORS = {
  admin:   { bg: '#ede9fe', text: '#7C3AED', dot: '#7C3AED' },
  manager: { bg: '#dbeafe', text: '#1e40af', dot: '#3B82F6' },
  staff:   { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
};

export default function GeneralSettings() {
  const { user, refreshUser } = useAuth();
  const isDark  = useDark();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState({
    full_name: "", phone: "", birthday: "", profile_picture: "",
  });
  const [loading, setSaving] = useState(false);
  const [saved,   setSaved]  = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      full_name:       user.full_name || "",
      phone:           user.phone || "",
      birthday:        user.birthday ? user.birthday.slice(0, 10) : "",
      profile_picture: user.profile_picture || "",
    });
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

  const roleCfg = ROLE_COLORS[user?.role] || ROLE_COLORS.staff;

  return (
    <div className="space-y-4 w-full min-w-0 overflow-x-hidden">
      {/* TOP BANNER */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div
          className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{ background: GRADIENT, boxShadow: "0 8px 32px rgba(13,59,102,0.2)" }}
        >
          <div
            className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }}
          />
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

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">

        {/* Left: Profile identity card */}
        <motion.div
          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
          className="lg:col-span-2 flex flex-col gap-3"
        >
          <div className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Mini header strip */}
            <div className="h-12 relative" style={{ background: GRADIENT }}>
              <div className="absolute inset-0 opacity-10"
                style={{ background: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
            </div>
            {/* Avatar — no role badge */}
            <div className="px-5 pb-4 -mt-7 flex flex-col items-center text-center">
              <div className="relative group mb-3">
                <div
                  className="w-[72px] h-[72px] rounded-2xl overflow-hidden shadow-xl"
                  style={{ boxShadow: `0 0 0 4px ${isDark ? '#1e293b' : '#fff'}, 0 8px 20px rgba(0,0,0,0.12)` }}
                >
                  {profile.profile_picture ? (
                    <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-2xl font-black"
                      style={{ background: GRADIENT }}>
                      {user?.full_name?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-lg flex items-center justify-center hover:scale-110 transition-all"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-500" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>
              <h2 className={`font-bold text-sm leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{user?.full_name}</h2>
              <p className={`text-xs mt-0.5 truncate max-w-full ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{user?.email}</p>
            </div>

            {/* Meta rows — full depts, ranking row added */}
            <div className={`border-t px-4 py-3 space-y-2.5 flex-1 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              {/* Account ID */}
              <div className="flex items-center justify-between text-xs">
                <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Hash className="h-3 w-3" />Account ID
                </span>
                <span className={`font-mono font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  #{user?.id?.slice(-6)}
                </span>
              </div>
              {/* Status */}
              <div className="flex items-center justify-between text-xs">
                <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Star className="h-3 w-3" />Status
                </span>
                <span className="flex items-center gap-1 text-emerald-500 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Active
                </span>
              </div>
              {/* Departments — full list, wrapping */}
              {user?.departments?.length > 0 && (
                <div className="flex items-start justify-between text-xs gap-2">
                  <span className={`flex items-center gap-1.5 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    <Settings className="h-3 w-3" />Depts
                  </span>
                  <span className={`font-semibold text-right leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {user.departments.join(', ')}
                  </span>
                </div>
              )}
              {/* Ranking */}
              <div className="flex items-center justify-between text-xs">
                <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Shield className="h-3 w-3" />Ranking
                </span>
                <span
                  className="px-2 py-0.5 rounded-lg text-[11px] font-bold capitalize"
                  style={{ background: isDark ? `${roleCfg.dot}20` : roleCfg.bg, color: roleCfg.text }}
                >
                  {user?.role === 'admin' ? 'Administrator' : user?.role === 'manager' ? 'Manager' : 'Staff'}
                </span>
              </div>
            </div>

            {/* Security tip — pinned to bottom of card */}
            <div className={`border-t px-4 py-3 flex items-start gap-2.5 ${isDark ? 'border-slate-700 bg-blue-950/20' : 'border-slate-100 bg-blue-50/60'}`}>
              <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs leading-relaxed ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                Contact your admin to change passwords or system permissions.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Right: Edit form */}
        <motion.div
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}
          className="lg:col-span-3 flex flex-col"
        >
          <div className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col flex-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Card header */}
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
              {/* Full Name */}
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
                {/* Phone */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <Input
                      type="tel"
                      value={profile.phone}
                      onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                      className={`h-10 rounded-xl text-sm pl-9 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                      placeholder="+91 00000 00000"
                    />
                  </div>
                </div>
                {/* Birthday */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Birthday</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <Input
                      type="date"
                      value={profile.birthday}
                      onChange={e => setProfile(p => ({ ...p, birthday: e.target.value }))}
                      className={`h-10 rounded-xl text-sm pl-9 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    value={user?.email || ""}
                    disabled
                    className={`h-10 rounded-xl text-sm pl-9 opacity-50 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`}
                  />
                </div>
              </div>

              {/* Work shift (read-only) */}
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

              {/* Save */}
              <div className={`flex justify-end pt-2 border-t mt-auto ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-7 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-50 transition-all hover:brightness-105"
                  style={{ background: loading ? '#94a3b8' : saved ? GRAD_GREEN : GRADIENT }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
                  ) : saved ? (
                    <><CheckCircle2 className="w-4 h-4" />Saved!</>
                  ) : (
                    <><Save className="w-4 h-4" />Save Changes</>
                  )}
                </motion.button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
