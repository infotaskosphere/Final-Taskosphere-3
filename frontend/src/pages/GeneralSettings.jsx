// =============================================================================
// GeneralSettings.jsx — with full light/dark theme support
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDark } from "@/hooks/useDark";
import api from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  User, Camera, Phone, Calendar,
  Save, Loader2, CheckCircle2, Mail, Shield,
} from "lucide-react";

const C = { deepBlue: "#0D3B66", mediumBlue: "#1F6FB2" };

export default function GeneralSettings() {
  const { user, refreshUser } = useAuth();
  const isDark = useDark();
  const fileRef = useRef(null);

  const [profile, setProfile] = useState({
    full_name: "", phone: "", birthday: "", profile_picture: "",
  });
  const [loading, setSaving] = useState(false);
  const [saved,   setSaved]  = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      full_name:       user.full_name       || "",
      phone:           user.phone           || "",
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
        phone:           profile.phone    || null,
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

  const pageBg     = isDark ? "#0f172a"  : "#f8fafc";
  const cardBg     = isDark ? "#1e293b"  : "#ffffff";
  const cardBorder = isDark ? "#334155"  : "#f1f5f9";
  const headingClr = isDark ? "#f1f5f9"  : "#1e293b";
  const subClr     = isDark ? "#94a3b8"  : "#64748b";
  const labelClr   = isDark ? "#94a3b8"  : "#64748b";
  const iconClr    = isDark ? "#475569"  : "#cbd5e1";
  const inputBg    = isDark ? "#0f172a"  : "#ffffff";
  const inputBdr   = isDark ? "#334155"  : "#e2e8f0";
  const inputTxt   = isDark ? "#e2e8f0"  : "#1e293b";
  const inputDisBg = isDark ? "#1e293b"  : "#f8fafc";
  const inputDisTx = isDark ? "#475569"  : "#94a3b8";
  const infoBg     = isDark ? "rgba(37,99,235,0.12)" : "#eff6ff";
  const infoBdr    = isDark ? "#1d4ed8"  : "#bfdbfe";
  const infoTxt    = isDark ? "#93c5fd"  : "#1d4ed8";
  const stripBg    = isDark
    ? "linear-gradient(135deg,rgba(13,59,102,0.18),rgba(31,111,178,0.10))"
    : `linear-gradient(135deg,${C.deepBlue}08,${C.mediumBlue}05)`;

  return (
    <div style={{ minHeight: "100vh", background: pageBg }} className="transition-colors duration-200">
      <div className="max-w-xl mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 style={{ color: headingClr }} className="text-2xl font-bold">General Settings</h1>
          <p style={{ color: subClr }} className="text-sm mt-0.5">Update your personal profile information</p>
        </div>

        <motion.form
          onSubmit={handleSave}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          className="rounded-2xl shadow-sm overflow-hidden"
        >
          {/* Avatar strip */}
          <div
            className="flex items-center gap-5 p-6"
            style={{ background: stripBg, borderBottom: `1px solid ${cardBorder}` }}
          >
            <div className="relative">
              <div
                style={{ background: isDark ? "#334155" : "#f1f5f9", ring: "none" }}
                className="w-20 h-20 rounded-2xl overflow-hidden shadow-md ring-4"
                style={{ boxShadow: `0 0 0 4px ${isDark ? "#1e293b" : "#ffffff"}` }}
              >
                {profile.profile_picture ? (
                  <img src={profile.profile_picture} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-2xl font-black"
                    style={{ background: `linear-gradient(135deg,${C.deepBlue},${C.mediumBlue})` }}
                  >
                    {user?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{ background: cardBg, border: `1px solid ${inputBdr}` }}
                className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl shadow-lg flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <Camera style={{ color: subClr }} className="w-3.5 h-3.5" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </div>
            <div>
              <p style={{ color: headingClr }} className="font-bold text-lg leading-tight">{user?.full_name}</p>
              <p style={{ color: subClr }} className="text-sm mt-0.5">{user?.email}</p>
              <span
                className="inline-block mt-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-lg capitalize"
                style={{ background: `${C.deepBlue}${isDark ? "25" : "12"}`, color: isDark ? "#93c5fd" : C.deepBlue }}
              >
                {user?.role}
              </span>
            </div>
          </div>

          {/* Fields */}
          <div className="p-6 space-y-4">

            {[
              { label: "Full Name", icon: User, key: "full_name", type: "text", placeholder: "Your full name", disabled: false },
              { label: "Phone", icon: Phone, key: "phone", type: "tel", placeholder: "+91 00000 00000", disabled: false },
              { label: "Birthday", icon: Calendar, key: "birthday", type: "date", placeholder: "", disabled: false },
            ].map(({ label, icon: Icon, key, type, placeholder, disabled }) => (
              <div key={key} className="space-y-1.5">
                <label style={{ color: labelClr }} className="block text-xs font-bold uppercase tracking-wider">
                  {label}
                </label>
                <div className="relative">
                  <Icon style={{ color: iconClr }} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                  <input
                    type={type}
                    value={profile[key]}
                    onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    disabled={disabled}
                    style={{ background: inputBg, border: `1px solid ${inputBdr}`, color: inputTxt }}
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl outline-none focus:ring-2 focus:ring-blue-400/30 transition-all"
                  />
                </div>
              </div>
            ))}

            {/* Email — read-only */}
            <div className="space-y-1.5">
              <label style={{ color: labelClr }} className="block text-xs font-bold uppercase tracking-wider">
                Email <span className="normal-case font-normal opacity-60">(cannot be changed)</span>
              </label>
              <div className="relative">
                <Mail style={{ color: iconClr }} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  style={{ background: inputDisBg, border: `1px solid ${inputBdr}`, color: inputDisTx }}
                  className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl outline-none cursor-not-allowed"
                />
              </div>
            </div>

            {/* Info note */}
            <div
              style={{ background: infoBg, border: `1px solid ${infoBdr}` }}
              className="flex items-start gap-2.5 p-3 rounded-xl"
            >
              <Shield style={{ color: isDark ? "#60a5fa" : "#3b82f6" }} className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p style={{ color: infoTxt }} className="text-xs">
                To update password, attendance times, Telegram ID, or access permissions —
                contact your admin or visit the <strong>Users</strong> section.
              </p>
            </div>

            {/* Save button */}
            <div className="flex justify-end pt-1">
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg,${C.deepBlue},${C.mediumBlue})` }}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : saved
                  ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                  : <><Save className="w-4 h-4" /> Save Changes</>
                }
              </motion.button>
            </div>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
