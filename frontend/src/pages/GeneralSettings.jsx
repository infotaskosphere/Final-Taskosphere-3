// =============================================================================
// GeneralSettings.jsx — Aligned with Dashboard Layout
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
  Settings, ChevronRight
} from "lucide-react";

// --- CRITICAL FIX: ADDED MISSING IMPORTS ---
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge"; 

const COLORS = {
  deepBlue: "#0D3B66",
  mediumBlue: "#1F6FB2",
  emeraldGreen: "#1FAF5A",
};

// -- Shared Card Components (Aligned with Dashboard) --
function SectionCard({ children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
        <div>
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

export default function GeneralSettings() {
  const { user, refreshUser } = useAuth();
  const isDark = useDark();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState({
    full_name: "", phone: "", birthday: "", profile_picture: "",
  });
  const [loading, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      full_name: user.full_name || "",
      phone: user.phone || "",
      birthday: user.birthday ? user.birthday.slice(0, 10) : "",
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
        full_name: profile.full_name.trim(),
        phone: profile.phone || null,
        birthday: profile.birthday || null,
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

  // -- Style Tokens --
  const inputBg = isDark ? "#0f172a" : "#f8fafc";
  const inputBdr = isDark ? "#334155" : "#e2e8f0";
  const bannerGradient = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto transition-colors duration-200">
      {/* ── Page Header ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4" 
             style={{ background: bannerGradient, boxShadow: "0 8px 32px rgba(13,59,102,0.2)" }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
               style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">Account Settings</h1>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mt-0.5">Manage identity & preferences</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left Sidebar ── */}
        <div className="lg:col-span-1 space-y-4">
          <SectionCard>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="relative group">
                <div 
                  className="w-28 h-28 rounded-3xl overflow-hidden shadow-2xl ring-4 transition-transform group-hover:scale-[1.02]"
                  style={{ 
                    background: isDark ? "#334155" : "#f1f5f9",
                    boxShadow: `0 0 0 4px ${isDark ? "#1e293b" : "#ffffff"}` 
                  }}
                >
                  {profile.profile_picture ? (
                    <img src={profile.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-3xl font-black"
                         style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      {user?.full_name?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-xl flex items-center justify-center hover:scale-110 transition-all active:scale-95"
                >
                  <Camera className="w-4 h-4 text-blue-500" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>
              
              <div className="mt-5">
                <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight">{user?.full_name}</h2>
                <p className="text-sm text-slate-400 font-medium mt-1">{user?.email}</p>
                {/* Badge component is now properly defined */}
                <Badge variant="secondary" className="mt-3 px-3 py-1 rounded-lg capitalize bg-blue-500/10 text-blue-500 border-0 font-bold">
                  {user?.role}
                </Badge>
              </div>
            </div>
            
            <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs py-2">
                <span className="text-slate-400 font-medium">Account ID</span>
                <span className="text-slate-500 dark:text-slate-300 font-mono">#{user?.id?.slice(-6)}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-2">
                <span className="text-slate-400 font-medium">Status</span>
                <span className="text-emerald-500 font-bold flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard className="p-4 bg-blue-500/5 dark:bg-blue-500/10 border-blue-200 dark:border-blue-900">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-400">
                Contact Admin to change passwords or system permissions.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* ── Right Panel ── */}
        <div className="lg:col-span-2">
          <SectionCard>
            <CardHeaderRow 
              iconBg="bg-blue-50 dark:bg-blue-900/30"
              icon={<User className="h-4 w-4 text-blue-500" />}
              title="Personal Information"
              subtitle="Update your contact and profile details"
            />
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Full Name</Label>
                  <Input 
                    value={profile.full_name}
                    onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                    style={{ background: inputBg, borderColor: inputBdr }}
                    className="rounded-xl h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone Number</Label>
                  <Input 
                    type="tel"
                    value={profile.phone}
                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    style={{ background: inputBg, borderColor: inputBdr }}
                    className="rounded-xl h-11"
                    placeholder="+91 00000 00000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Birth Date</Label>
                  <Input 
                    type="date"
                    value={profile.birthday}
                    onChange={e => setProfile(p => ({ ...p, birthday: e.target.value }))}
                    style={{ background: inputBg, borderColor: inputBdr }}
                    className="rounded-xl h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Email Address</Label>
                  <Input 
                    value={user?.email || ""}
                    disabled
                    className="rounded-xl h-11 opacity-60 bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end border-t border-slate-100 dark:border-slate-700">
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                  ) : saved ? (
                    <><CheckCircle2 className="w-4 h-4" /> Profile Updated</>
                  ) : (
                    <><Save className="w-4 h-4" /> Save Changes</>
                  )}
                </motion.button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
