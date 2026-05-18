import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import { IndianRupee, Save as SaveIcon, Loader2 } from 'lucide-react';

/**
 * StandaloneGovtFeeDialog
 * ------------------------------------------------------------------
 * Create / edit an ad-hoc Government Fee that is NOT attached to a
 * compliance master assignment. Used from:
 *   - Client detail → Govt Fees tab  (lockClient = true, clientId fixed)
 *   - Compliance page → Govt Fees tab (client picker shown)
 *
 * Props
 *   open, onOpenChange
 *   editing       optional existing record
 *   clientId      pre-selected client (locked when lockClient=true)
 *   lockClient    boolean — hide client picker
 *   clients       array of {id, name} — required when !lockClient
 *   onSaved       (record) => void
 */
const CATEGORIES = ['ROC', 'GST', 'ITR', 'TDS', 'AUDIT', 'PF_ESIC', 'PT', 'OTHER'];
const STATUSES   = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid',    label: 'Paid'    },
];

export default function StandaloneGovtFeeDialog({
  open, onOpenChange,
  editing      = null,
  clientId     = null,
  lockClient   = false,
  clients      = [],
  onSaved,
}) {
  const empty = {
    client_id:    clientId || '',
    title:        '',
    category:     'OTHER',
    period_label: '',
    fy_year:      '',
    due_date:     '',
    payment_date: '',
    amount:       '',
    srn:          '',
    notes:        '',
    status:       'pending',
  };
  const [form,    setForm]    = useState(empty);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        client_id:    editing.client_id    || clientId || '',
        title:        editing.title        || '',
        category:     editing.category     || 'OTHER',
        period_label: editing.period_label || '',
        fy_year:      editing.fy_year      || '',
        due_date:     editing.due_date     ? editing.due_date.slice(0, 10) : '',
        payment_date: editing.payment_date ? editing.payment_date.slice(0, 10) : '',
        amount:       editing.amount ?? '',
        srn:          editing.srn          || '',
        notes:        editing.notes        || '',
        status:       editing.status       || 'pending',
      });
    } else {
      setForm({ ...empty, client_id: clientId || '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, clientId]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!lockClient && !form.client_id) {
      toast.error('Please select a client');
      return;
    }
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount:       parseFloat(form.amount) || 0,
        due_date:     form.due_date     || null,
        payment_date: form.payment_date || null,
        period_label: form.period_label || null,
        fy_year:      form.fy_year      || null,
        srn:          form.srn          || null,
        notes:        form.notes        || null,
      };
      let res;
      if (editing?.id) {
        res = await api.patch(`/compliance/standalone-govt-fees/${editing.id}`, payload);
        toast.success('Government fee updated');
      } else {
        res = await api.post('/compliance/standalone-govt-fees', payload);
        toast.success('Government fee added');
      }
      onSaved && onSaved(res.data);
      onOpenChange(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden p-0">

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50">
            <IndianRupee className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-slate-800 leading-tight">
              {editing ? 'Edit Government Fee' : 'Add Government Fee'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400 mt-0">
              Record a one-off government fee (not part of a recurring compliance).
            </DialogDescription>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          <div className="grid grid-cols-4 gap-x-4 gap-y-3">

            {/* Client — full width when visible */}
            {!lockClient && (
              <div className="col-span-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client *</label>
                <Select value={form.client_id} onValueChange={v => set('client_id', v)}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select client…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title — full width */}
            <div className="col-span-4">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title / Purpose *</label>
              <Input
                className="mt-1 h-9"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Increase in Authorised Capital — SH-7"
              />
            </div>

            {/* Category | FY Year | Period Label | Status — 4 columns */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">FY Year</label>
              <Input
                className="mt-1 h-9"
                value={form.fy_year}
                onChange={e => set('fy_year', e.target.value)}
                placeholder="2024-25"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period Label</label>
              <Input
                className="mt-1 h-9"
                value={form.period_label}
                onChange={e => set('period_label', e.target.value)}
                placeholder="Q1, May, One-time"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date | Payment Date | Amount | SRN — 4 columns */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Due Date</label>
              <Input className="mt-1 h-9" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Date</label>
              <Input className="mt-1 h-9" type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount (₹) *</label>
              <Input
                className="mt-1 h-9"
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SRN</label>
              <Input
                className="mt-1 h-9 font-mono"
                value={form.srn}
                onChange={e => set('srn', e.target.value)}
                placeholder="SRN…"
              />
            </div>

            {/* Notes — full width, compact */}
            <div className="col-span-4">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
              <Textarea
                className="mt-1 resize-none"
                rows={2}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Optional notes…"
              />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-slate-100 shrink-0 bg-slate-50/60">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'linear-gradient(135deg,#0D3B66,#1F6FB2)', color: '#fff' }}
          >
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Saving…</>
              : <><SaveIcon className="h-3.5 w-3.5 mr-1.5"/>{editing ? 'Update' : 'Save'}</>}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
