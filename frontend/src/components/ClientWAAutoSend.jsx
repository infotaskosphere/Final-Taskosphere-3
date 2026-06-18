// ClientWAAutoSend.jsx — per-client WhatsApp auto-send management
// Lets a user turn birthday auto-wishes on/off for a single client and
// customise that client's birthday message. Nothing is ever sent unless a
// WhatsApp number is connected (enforced server-side by the scheduler).
import React, { useState, useEffect } from 'react';
import { MessageCircle, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';

const DEFAULT_MSG =
  '🎂 *Happy Birthday, {name}!*\n\nWishing you a wonderful birthday filled with joy and prosperity! 🎉\n\nBest wishes,\n_Taskosphere Team_';

export default function ClientWAAutoSend({ client }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(client?.wa_auto_birthday !== false);
  const [message, setMessage] = useState(client?.wa_birthday_message || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEnabled(client?.wa_auto_birthday !== false);
    setMessage(client?.wa_birthday_message || '');
  }, [client?.id, client?.wa_auto_birthday, client?.wa_birthday_message]);

  const save = async () => {
    if (!client?.id) return;
    setSaving(true);
    try {
      await api.put(`/whatsapp/client-autosend/${client.id}`, {
        auto_birthday_enabled: enabled,
        birthday_message: message,
      });
      // keep local object in sync so re-open shows latest
      client.wa_auto_birthday = enabled;
      client.wa_birthday_message = message;
      toast.success('WhatsApp auto-send updated for this client');
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update auto-send');
    } finally {
      setSaving(false);
    }
  };

  const isOn = client?.wa_auto_birthday !== false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition ${
            isOn
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
              : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
          title="Manage WhatsApp birthday auto-send for this client"
        >
          <MessageCircle className="h-3 w-3" />
          WhatsApp Auto-Send: {isOn ? 'ON' : 'OFF'}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogTitle className="flex items-center gap-2 text-base font-bold">
          <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp Auto-Send
        </DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          {client?.company_name} — automatic birthday wishes are sent at 9:00 AM IST.
          Messages are only delivered when a WhatsApp number is connected.
        </DialogDescription>

        <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
          <span className="text-sm font-semibold text-slate-700">Birthday auto-wish</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="mt-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1 text-slate-500">
            Custom birthday message <span className="normal-case font-normal opacity-70">(use {'{name}'})</span>
          </label>
          <Textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!enabled}
            placeholder={DEFAULT_MSG}
            className="font-mono text-xs"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Leave blank to use the global birthday template from WhatsApp Settings.
          </p>
        </div>

        <Button onClick={save} disabled={saving} className="w-full mt-3 gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
