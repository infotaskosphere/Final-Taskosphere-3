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
      <DialogContent className="max-w-2xl">
        <DialogTitle className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-blue-600" />
          {editing ? 'Edit Government Fee' : 'Add Government Fee'}
        </DialogTitle>
        <DialogDescription>
          Record a one-off government fee (not part of a recurring compliance).
        </DialogDescription>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {!lockClient && (
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600">Client *</label>
              <Select value={form.client_id} onValueChange={v => set('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-600">Title / Purpose *</label>
            <Input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Increase in Authorised Capital — SH-7"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Category</label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">FY Year</label>
            <Input
              value={form.fy_year}
              onChange={e => set('fy_year', e.target.value)}
              placeholder="2024-25"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Period Label</label>
            <Input
              value={form.period_label}
              onChange={e => set('period_label', e.target.value)}
              placeholder="e.g. Q1, May, One-time"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Status</label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Due Date</label>
            <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Payment Date</label>
            <Input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Amount (₹) *</label>
            <Input
              type="number" min="0" step="0.01"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">SRN</label>
            <Input
              value={form.srn}
              onChange={e => set('srn', e.target.value)}
              placeholder="SRN…"
              className="font-mono"
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs font-semibold text-slate-600">Notes</label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'linear-gradient(135deg,#0D3B66,#1F6FB2)', color: '#fff' }}
          >
            {saving
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin"/>Saving…</>
              : <><SaveIcon className="h-4 w-4 mr-1.5"/>{editing ? 'Update' : 'Save'}</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
