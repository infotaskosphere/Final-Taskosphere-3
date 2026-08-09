import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function ClientRenewalsTab({ clientId, isDark, currentUserRole }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: '', expiry_date: '', alert_days_before: 30, notes: '' });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/clients/${clientId}/service-expiries`);
      setItems(res.data);
    } catch (err) {
      toast.error('Failed to load renewals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId && currentUserRole === 'admin') load();
    else setLoading(false);
  }, [clientId, currentUserRole]);

  const add = async () => {
    if (!form.label || !form.expiry_date) {
      toast.error('Label and expiry date are required');
      return;
    }
    setAdding(true);
    try {
      const res = await api.post(`/clients/${clientId}/service-expiries`, form);
      setItems(prev => [...prev, res.data].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)));
      setForm({ label: '', expiry_date: '', alert_days_before: 30, notes: '' });
    } catch (err) {
      toast.error('Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/clients/${clientId}/service-expiries/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  const border = isDark ? 'border-slate-700' : 'border-slate-200';
  const input = `text-sm rounded-lg border px-3 py-2 outline-none ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`;

  // Frontend gate mirrors the backend's require_admin — UX only, the API
  // itself rejects non-admins with 403 regardless of this check.
  if (currentUserRole !== 'admin') {
    return (
      <div className="text-center py-8">
        <p className="text-sm font-semibold text-slate-500">Admin access required</p>
        <p className="text-xs text-slate-400 mt-1">Renewal tracking is only visible to admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border ${border} p-3 grid grid-cols-2 gap-2`}>
        <input className={input} placeholder="Label (e.g. Trade License)" value={form.label}
          onChange={e => setForm({ ...form, label: e.target.value })} />
        <input className={input} type="date" value={form.expiry_date}
          onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
        <input className={input} type="number" placeholder="Alert days before" value={form.alert_days_before}
          onChange={e => setForm({ ...form, alert_days_before: parseInt(e.target.value, 10) || 30 })} />
        <input className={input} placeholder="Notes (optional)" value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })} />
        <button
          onClick={add} disabled={adding}
          className="col-span-2 h-9 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add Renewal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-400">No renewals tracked for this client yet.</div>
      ) : (
        items.map(item => {
          const d = daysUntil(item.expiry_date);
          const urgent = d <= item.alert_days_before;
          return (
            <div key={item.id} className={`flex items-center justify-between rounded-lg border ${border} px-3 py-2.5`}>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" style={{ color: urgent ? '#DC2626' : '#64748B' }} />
                <div>
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(item.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    <span style={{ color: urgent ? '#DC2626' : undefined }}>
                      {d < 0 ? `expired ${Math.abs(d)}d ago` : `${d}d left`}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => remove(item.id)} className="p-1 text-slate-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
