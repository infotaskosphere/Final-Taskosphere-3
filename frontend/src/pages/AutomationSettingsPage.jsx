import React, { useState, useEffect } from 'react';
import { Cake, Sparkles, ShieldCheck, Clock, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2.5 cursor-pointer">
      <div>
        <div className="text-sm font-semibold text-slate-700">{label}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="w-10 h-6 rounded-full flex-shrink-0 relative transition-colors"
        style={{ background: checked ? '#0D3B66' : '#cbd5e1' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </button>
    </label>
  );
}

export default function AutomationSettingsPage(props) {
  const { isDark: hookIsDark } = useDark();
  const { user } = useAuth();
  const isDark = props.isDark ?? hookIsDark;
  const currentUserRole = props.currentUserRole ?? user?.role;

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newFestival, setNewFestival] = useState({ name: '', month_day: '', wa_template: '', wa_image_url: '', email_template: '' });
  const [addingFestival, setAddingFestival] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/automation/settings');
      setSettings(res.data);
    } catch (err) {
      toast.error('Failed to load automation settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await api.put('/automation/settings', patch);
      setSettings(res.data);
      toast.success('Saved');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addFestival = async () => {
    if (!newFestival.name || !newFestival.month_day) {
      toast.error('Name and date (MM-DD) are required');
      return;
    }
    setAddingFestival(true);
    try {
      const res = await api.post('/automation/settings/festivals', {
        name: newFestival.name,
        month_day: newFestival.month_day,
        wa_template: newFestival.wa_template || `🪔 Happy ${newFestival.name}! Wishing you and your family joy and prosperity.`,
        wa_image_url: newFestival.wa_image_url || null,
        email_template: newFestival.email_template || `Dear {name},\n\nWishing you a very Happy ${newFestival.name}!\n\nBest wishes,\nTaskosphere Team`,
        enabled: true,
      });
      setSettings(res.data);
      setNewFestival({ name: '', month_day: '', wa_template: '', wa_image_url: '', email_template: '' });
      toast.success('Festival added');
    } catch (err) {
      toast.error('Failed to add festival');
    } finally {
      setAddingFestival(false);
    }
  };

  const removeFestival = async (id) => {
    try {
      const res = await api.delete(`/automation/settings/festivals/${id}`);
      setSettings(res.data);
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const card = `rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`;
  const label = `text-xs font-semibold mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`;
  const input = `w-full text-sm rounded-lg border px-3 py-2 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`;

  // Frontend gate mirrors the backend's require_admin — this is UX only,
  // the API itself rejects non-admins with 403 regardless of this check.
  // Placed after all hooks so hook call order stays stable across renders.
  if (currentUserRole !== 'admin') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <p className="text-sm font-semibold text-slate-500">Admin access required</p>
        <p className="text-xs text-slate-400 mt-1">Automation settings are only visible to admins.</p>
      </div>
    );
  }

  if (loading || !settings) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: '#0D3B66' }}>
          <Sparkles className="h-5 w-5" /> Automation Settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">Birthday wishes, festival greetings, renewals and follow-up nudges.</p>
      </div>

      {/* Approval gate */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-2 text-sm font-bold" style={{ color: '#7C3AED' }}>
          <ShieldCheck className="h-4 w-4" /> Approval Gate
        </div>
        <Toggle
          checked={settings.birthday_requires_approval}
          onChange={(v) => save({ birthday_requires_approval: v })}
          label="Require admin approval before sending birthday wishes"
          hint="When on, wishes are queued in Pending Approvals instead of sent automatically."
        />
        <Toggle
          checked={settings.festival_requires_approval}
          onChange={(v) => save({ festival_requires_approval: v })}
          label="Require admin approval before sending festival greetings"
        />
      </div>

      {/* Birthday automation */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-2 text-sm font-bold" style={{ color: '#0D3B66' }}>
          <Cake className="h-4 w-4" /> Birthday Wishes
        </div>
        <Toggle checked={settings.birthday_wa_enabled} onChange={(v) => save({ birthday_wa_enabled: v })} label="Send via WhatsApp" />
        <Toggle checked={settings.birthday_email_enabled} onChange={(v) => save({ birthday_email_enabled: v })} label="Send via Email" />

        <div className="mt-3">
          <label className={label}>WhatsApp template (use {'{name}'})</label>
          <textarea
            className={input}
            rows={2}
            defaultValue={settings.birthday_wa_template}
            onBlur={(e) => save({ birthday_wa_template: e.target.value })}
          />
        </div>
        <div className="mt-3">
          <label className={label}>WhatsApp image URL (optional — sent as an image with the message as caption)</label>
          <input
            className={input}
            placeholder="https://…/birthday-banner.jpg"
            defaultValue={settings.birthday_wa_image_url || ''}
            onBlur={(e) => save({ birthday_wa_image_url: e.target.value })}
          />
          {settings.birthday_wa_image_url && (
            <img src={settings.birthday_wa_image_url} alt="Birthday WhatsApp preview"
              className="mt-2 h-20 rounded-lg border object-cover" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }} />
          )}
        </div>
        <div className="mt-3">
          <label className={label}>Email template (use {'{name}'})</label>
          <textarea
            className={input}
            rows={4}
            defaultValue={settings.birthday_email_template}
            onBlur={(e) => save({ birthday_email_template: e.target.value })}
          />
        </div>
      </div>

      {/* Festivals */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3 text-sm font-bold" style={{ color: '#EA580C' }}>
          <Sparkles className="h-4 w-4" /> Festival Greetings
        </div>
        <div className="space-y-2 mb-4">
          {(settings.festivals || []).length === 0 && (
            <p className="text-xs text-slate-400">No festivals added yet.</p>
          )}
          {(settings.festivals || []).map(f => (
            <div key={f.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                {f.wa_image_url && (
                  <img src={f.wa_image_url} alt="" className="h-7 w-7 rounded object-cover flex-shrink-0" />
                )}
                <div>
                  <span className="text-sm font-semibold">{f.name}</span>
                  <span className="text-xs text-slate-400 ml-2">{f.month_day}</span>
                </div>
              </div>
              <button onClick={() => removeFestival(f.id)} className="p-1 text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Festival name (e.g. Diwali)" value={newFestival.name}
            onChange={e => setNewFestival({ ...newFestival, name: e.target.value })} />
          <input className={input} placeholder="MM-DD (e.g. 11-01)" value={newFestival.month_day}
            onChange={e => setNewFestival({ ...newFestival, month_day: e.target.value })} />
          <input className={`${input} col-span-2`} placeholder="WhatsApp image URL (optional)" value={newFestival.wa_image_url}
            onChange={e => setNewFestival({ ...newFestival, wa_image_url: e.target.value })} />
        </div>
        <button
          onClick={addFestival}
          disabled={addingFestival}
          className="mt-3 h-9 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5"
          style={{ background: '#EA580C' }}
        >
          {addingFestival ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add Festival
        </button>
      </div>

      {/* Follow-ups & expiries */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-2 text-sm font-bold" style={{ color: '#0891B2' }}>
          <Clock className="h-4 w-4" /> Follow-ups & Renewals
        </div>
        <Toggle checked={settings.follow_up_enabled} onChange={(v) => save({ follow_up_enabled: v })}
          label="Nudge assigned user if a client hasn't been contacted" />
        <div className="mt-2">
          <label className={label}>Days without contact before nudging</label>
          <input
            type="number" min={1} className={`${input} w-32`}
            defaultValue={settings.follow_up_days_threshold}
            onBlur={(e) => save({ follow_up_days_threshold: parseInt(e.target.value, 10) || 30 })}
          />
        </div>
        <Toggle checked={settings.expiry_alert_enabled} onChange={(v) => save({ expiry_alert_enabled: v })}
          label="Alert on service/license renewal due dates"
          hint="Set per-client renewal dates from the client's Renewals tab." />
      </div>

      {saving && <div className="text-xs text-slate-400 flex items-center gap-1"><Save className="h-3 w-3" /> Saving…</div>}
    </div>
  );
}
