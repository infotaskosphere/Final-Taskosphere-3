// PayrollSettings.jsx — establishment identifiers and statutory rate config.
import React, { useState } from 'react';
import { Save, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { saveSettings, exportBackup, importBackup } from '@/lib/payroll/store';

export default function PayrollSettings({ settings, onChange, canEdit = true }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)));

  const set = (path, value) => {
    const next = JSON.parse(JSON.stringify(draft));
    const keys = path.split('.');
    let node = next;
    keys.slice(0, -1).forEach((k) => { node = node[k]; });
    node[keys[keys.length - 1]] = value;
    setDraft(next);
  };

  const save = () => { saveSettings(draft); onChange(); toast.success('Payroll settings saved'); };

  const backup = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const restore = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importBackup(String(reader.result)); onChange(); toast.success('Backup restored'); }
      catch { toast.error('Invalid backup file'); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="font-semibold text-sm">Establishment</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <F label="Employer name" v={draft.employer.name} on={(v) => set('employer.name', v)} />
          <F label="Address" v={draft.employer.address} on={(v) => set('employer.address', v)} />
          <F label="PF establishment code" v={draft.employer.pfEstablishmentCode} on={(v) => set('employer.pfEstablishmentCode', v.toUpperCase())} />
          <F label="ESIC employer code (17 digits)" v={draft.employer.esicEmployerCode} on={(v) => set('employer.esicEmployerCode', v)} />
          <F label="TAN" v={draft.employer.tan} on={(v) => set('employer.tan', v.toUpperCase())} />
          <F label="PAN" v={draft.employer.pan} on={(v) => set('employer.pan', v.toUpperCase())} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Provident Fund</div>
            <Switch checked={draft.pf.enabled} onCheckedChange={(v) => set('pf.enabled', v)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Wage ceiling" type="number" v={draft.pf.wageCeiling} on={(v) => set('pf.wageCeiling', Number(v))} />
            <F label="Employee rate %" type="number" v={draft.pf.employeeRate} on={(v) => set('pf.employeeRate', Number(v))} />
            <F label="Employer rate %" type="number" v={draft.pf.employerRate} on={(v) => set('pf.employerRate', Number(v))} />
            <F label="EPS rate %" type="number" v={draft.pf.epsRate} on={(v) => set('pf.epsRate', Number(v))} />
            <F label="EDLI rate %" type="number" v={draft.pf.edliRate} on={(v) => set('pf.edliRate', Number(v))} />
            <F label="Admin rate %" type="number" v={draft.pf.adminRate} on={(v) => set('pf.adminRate', Number(v))} />
            <F label="Admin minimum ₹" type="number" v={draft.pf.adminMinimum} on={(v) => set('pf.adminMinimum', Number(v))} />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-xs">Restrict contribution to the wage ceiling</Label>
            <Switch checked={draft.pf.restrictToCeiling} onCheckedChange={(v) => set('pf.restrictToCeiling', v)} />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">ESI</div>
            <Switch checked={draft.esi.enabled} onCheckedChange={(v) => set('esi.enabled', v)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Wage threshold" type="number" v={draft.esi.wageThreshold} on={(v) => set('esi.wageThreshold', Number(v))} />
            <F label="Disabled threshold" type="number" v={draft.esi.disabledThreshold} on={(v) => set('esi.disabledThreshold', Number(v))} />
            <F label="Employee rate %" type="number" v={draft.esi.employeeRate} on={(v) => set('esi.employeeRate', Number(v))} />
            <F label="Employer rate %" type="number" v={draft.esi.employerRate} on={(v) => set('esi.employerRate', Number(v))} />
          </div>
          <div className="text-xs text-muted-foreground">Contribution periods: April–September and October–March. Coverage continues to period end once an employee is covered.</div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Professional Tax</div>
            <Switch checked={draft.pt.enabled} onCheckedChange={(v) => set('pt.enabled', v)} />
          </div>
          <F label="State code" v={draft.pt.state} on={(v) => set('pt.state', v.toUpperCase())} />
          {draft.pt.slabs.map((s, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-end">
              <F label="Gross up to" type="number" v={s.upto === Infinity ? '' : s.upto}
                 on={(v) => set(`pt.slabs.${i}.upto`, v === '' ? Infinity : Number(v))} />
              <F label="PT amount" type="number" v={s.amount} on={(v) => set(`pt.slabs.${i}.amount`, Number(v))} />
              <F label="February amount" type="number" v={s.februaryAmount ?? ''} on={(v) => set(`pt.slabs.${i}.februaryAmount`, v === '' ? null : Number(v))} />
            </div>
          ))}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Labour Welfare Fund</div>
            <Switch checked={draft.lwf.enabled} onCheckedChange={(v) => set('lwf.enabled', v)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <F label="Employee ₹" type="number" v={draft.lwf.employee} on={(v) => set('lwf.employee', Number(v))} />
            <F label="Employer ₹" type="number" v={draft.lwf.employer} on={(v) => set('lwf.employer', Number(v))} />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-xs">Show employer contribution on payslips</Label>
            <Switch checked={draft.payslip.showEmployerContribution} onCheckedChange={(v) => set('payslip.showEmployerContribution', v)} />
          </div>
        </Card>
      </div>

      <Card className="p-4 flex flex-wrap gap-2">
        <Button disabled={!canEdit} onClick={save}><Save className="w-4 h-4 mr-2" />Save settings</Button>
        <Button variant="outline" onClick={backup}><Download className="w-4 h-4 mr-2" />Backup payroll data</Button>
        <label className="inline-flex">
          <input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
          <Button variant="outline" asChild><span><Upload className="w-4 h-4 mr-2" />Restore backup</span></Button>
        </label>
      </Card>
    </div>
  );
}

function F({ label, v, on, type = 'text' }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={v ?? ''} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
