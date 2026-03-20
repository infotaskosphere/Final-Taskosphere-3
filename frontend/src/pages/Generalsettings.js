// =============================================================================
// GeneralSettings.jsx
// Place this file at: src/pages/GeneralSettings.jsx
// =============================================================================

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
      toast.success("✓ Profile updated");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">General Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Update your personal profile information</p>
      </div>

      <motion.form
        onSubmit={handleSave}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        {/* Avatar strip */}
        <div
          className="flex items-center gap-5 p-6"
          style={{
            background: `linear-gradient(135deg,${C.deepBlue}08,${C.mediumBlue}05)`,
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 ring-4 ring-white shadow-md">
              {profile.profile_picture ? (
                <img
                  src={profile.profile_picture}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
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
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 bg-white rounded-xl shadow-lg
                border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-slate-500" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhoto}
            />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-lg leading-tight">{user?.full_name}</p>
            <p className="text-sm text-slate-500 mt-0.5">{user?.email}</p>
            <span
              className="inline-block mt-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-lg capitalize"
              style={{ background: `${C.deepBlue}12`, color: C.deepBlue }}
            >
              {user?.role}
            </span>
          </div>
        </div>

        {/* Fields */}
        <div className="p-6 space-y-4">

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                value={profile.full_name}
                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Your full name"
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Email read-only */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Email{" "}
              <span className="normal-case font-normal text-slate-400">(cannot be changed)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200
                  bg-slate-50 text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Phone
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="tel"
                value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                placeholder="+91 00000 00000"
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Birthday */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Birthday
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="date"
                value={profile.birthday}
                onChange={e => setProfile(p => ({ ...p, birthday: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white
                  focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition-all"
              />
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <Shield className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
                text-white shadow-md transition-all disabled:opacity-60"
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
  );
}
