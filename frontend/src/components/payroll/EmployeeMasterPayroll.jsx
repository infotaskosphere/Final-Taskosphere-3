// EmployeeMasterPayroll.jsx — payroll setup (salary structure, PF, ESI, bank)
// for employees, with bulk Excel import and a downloadable template.
//
// The roster itself is NOT owned here — it's the firm's real Users list
// (People Matrix → Users). This page only lets you configure the
// payroll-only fields Users doesn't have (PAN/Aadhaar, UAN/EPS/VPF, ESIC IP,
// bank details, salary structure, monthly TDS) for a user that already
// exists. "Add employee" therefore picks from users who don't have payroll
// set up yet, instead of creating a free-floating record — name, DOB, date
// of joining, department and active/inactive status always come straight
// from Users and are shown read-only here so the two can never drift apart.
import React, { useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, Download, Search, Loader2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { blankEmployee, upsertEmployee, removeEmployee, importEmployees, listUnconfiguredUsers } from '@/lib/payroll/store';
import { downloadEmployeeTemplate, parseEmployeeSheet } from '@/lib/payroll/exports';
import { rupee } from '@/lib/payroll/statutory';

const grossOf = (e) =>
  Object.values(e.structure || {}).reduce((s, v) => s + (Number(v) || 0), 0);

export default function EmployeeMasterPayroll({ employees, loading = false, onChange, canEdit = true }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [picker, setPicker] = useState(null); // { loading, users } while "Add employee" is open
  const fileRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.code, e.pf?.uan, e.esi?.ipNumber, e.department, e.designation]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [employees, query]);

  const save = () => {
    upsertEmployee(editing);
    setEditing(null);
    onChange();
    toast.success('Payroll details saved');
  };

  const openAddPicker = async () => {
    setPicker({ loading: true, users: [] });
    try {
      const users = await listUnconfiguredUsers();
      setPicker({ loading: false, users });
    } catch {
      setPicker({ loading: false, users: [] });
      toast.error('Could not load users');
    }
  };

  const pickUser = (user) => {
    const uid_ = user.id || user._id;
    setEditing({
      ...blankEmployee(),
      id: uid_,
      name: user.full_name || user.email,
      dob: user.birthday || '',
      doj: user.joining_date || '',
      department: (user.departments || [])[0] || '',
      designation: (user.departments || [])[0] || '',
      monthlySalaryOnFile: user.monthly_salary ?? null,
    });
    setPicker(null);
  };

  const onImport = async (file) => {
    if (!file) return;
    try {
      const rows = await parseEmployeeSheet(file);
      const valid = rows.filter((r) => r.name);
      const { matched, skipped } = await importEmployees(valid);
      onChange();
      if (skipped > 0) {
        toast.warning(`Matched ${matched} to existing users, skipped ${skipped} — no matching user by email/name. Create them in Users first.`);
      } else {
        toast.success(`Updated payroll details for ${matched} employees`);
      }
    } catch {
      toast.error('Could not read that file — use the template layout');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, code, UAN, IP number…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="outline" onClick={downloadEmployeeTemplate}><Download className="w-4 h-4 mr-2" />Template</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        <Button variant="outline" disabled={!canEdit} onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Import</Button>
        <Button disabled={!canEdit} onClick={openAddPicker}><Plus className="w-4 h-4 mr-2" />Add employee</Button>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>UAN</TableHead>
              <TableHead>ESIC IP</TableHead>
              <TableHead className="text-right">Gross / month</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading users…
              </TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                No users found. Add people under People Matrix → Users, then set up their payroll here.
              </TableCell></TableRow>
            )}
            {!loading && filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.code || '—'}</TableCell>
                <TableCell>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{[e.designation, e.department].filter(Boolean).join(' · ')}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{e.pf?.uan || <span className="text-muted-foreground">not covered</span>}</TableCell>
                <TableCell className="font-mono text-xs">{e.esi?.ipNumber || <span className="text-muted-foreground">not covered</span>}</TableCell>
                <TableCell className="text-right">
                  {e.configured ? rupee(grossOf(e)) : (
                    <span className="text-muted-foreground text-xs">
                      {e.monthlySalaryOnFile ? `${rupee(e.monthlySalaryOnFile)} (on file)` : 'not set up'}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant={e.status === 'active' ? 'default' : 'secondary'}>{e.status}</Badge>
                    {!e.configured && <Badge variant="outline" className="text-amber-600 border-amber-300">payroll not set up</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title={e.configured ? 'Edit payroll details' : 'Set up payroll'}
                      disabled={!canEdit} onClick={() => setEditing(JSON.parse(JSON.stringify(e)))}>
                      {e.configured ? <Pencil className="w-4 h-4" /> : <UserCog className="w-4 h-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" title="Reset payroll setup (does not delete the user)"
                      disabled={!canEdit || !e.configured} onClick={() => { removeEmployee(e.id); onChange(); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add employee — pick an existing user who isn't set up for payroll yet */}
      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent className="max-w-lg max-h-[75vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add employee to payroll</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Choose a user to set up salary structure, PF, ESI and bank details for. Not seeing someone?
            Add them under People Matrix → Users first.
          </p>
          <div className="space-y-1 max-h-[45vh] overflow-y-auto">
            {picker?.loading && (
              <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading users…</div>
            )}
            {!picker?.loading && picker?.users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">Every user already has payroll set up.</div>
            )}
            {!picker?.loading && picker?.users.map((u) => (
              <button key={u.id || u._id} onClick={() => pickUser(u)}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg text-left hover:bg-muted">
                <div>
                  <div className="text-sm font-medium">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground">{[(u.departments || [])[0], u.email].filter(Boolean).join(' · ')}</div>
                </div>
                <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payroll setup dialog — personal/employment fields are read-only,
          sourced from Users; only payroll-specific fields are editable. */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.configured ? `Edit payroll — ${editing?.name}` : `Set up payroll — ${editing?.name}`}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-6">
              <Section title="Personal & employment (from Users — edit in People Matrix → Users)">
                <ReadOnlyField label="Full name" value={editing.name} />
                <ReadOnlyField label="Date of birth" value={editing.dob} />
                <ReadOnlyField label="Date of joining" value={editing.doj} />
                <ReadOnlyField label="Department" value={editing.department} />
                <ReadOnlyField label="Mobile" value={editing.mobile} />
                <ReadOnlyField label="Status" value={editing.status} />
              </Section>

              <Section title="Payroll identifiers & compliance details">
                <Field label="Employee code" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
                <Field label="Father / husband name" value={editing.fatherName} onChange={(v) => setEditing({ ...editing, fatherName: v })} />
                <Field label="Gender (M/F/T)" value={editing.gender} onChange={(v) => setEditing({ ...editing, gender: v })} />
                <Field label="PAN" value={editing.pan} onChange={(v) => setEditing({ ...editing, pan: v.toUpperCase() })} />
                <Field label="Aadhaar" value={editing.aadhaar} onChange={(v) => setEditing({ ...editing, aadhaar: v })} />
                <Field label="Date of leaving (if applicable)" type="date" value={editing.dol} onChange={(v) => setEditing({ ...editing, dol: v })} />
              </Section>

              <Section title="Salary structure (monthly)">
                {['basic', 'da', 'hra', 'conveyance', 'medical', 'special', 'otherAllowance'].map((k) => (
                  <Field key={k} label={labelFor(k)} type="number" value={editing.structure[k]}
                    onChange={(v) => setEditing({ ...editing, structure: { ...editing.structure, [k]: Number(v) || 0 } })} />
                ))}
                <div className="col-span-full text-sm text-muted-foreground">
                  Gross: <strong>{rupee(grossOf(editing))}</strong>
                  {editing.monthlySalaryOnFile ? ` · ${rupee(editing.monthlySalaryOnFile)} on file in Users` : ''}
                </div>
              </Section>

              <Section title="Provident Fund">
                <Toggle label="PF applicable" checked={editing.pf.enabled} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, enabled: v } })} />
                <Field label="UAN" value={editing.pf.uan} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, uan: v } })} />
                <Field label="PF member ID" value={editing.pf.memberId} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, memberId: v } })} />
                <Field label="VPF %" type="number" value={editing.pf.vpfRate} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, vpfRate: Number(v) || 0 } })} />
                <Toggle label="EPS eligible" checked={editing.pf.epsEligible} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, epsEligible: v } })} />
                <Toggle label="Contribute on actual wages (above ₹15,000)" checked={editing.pf.contributeOnActualWages} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, contributeOnActualWages: v } })} />
                <Toggle label="Include special allowance in PF wages" checked={editing.pf.includeSpecialAllowance} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, includeSpecialAllowance: v } })} />
                <Field label="Exit reason (Form 10)" value={editing.pf.exitReason} onChange={(v) => setEditing({ ...editing, pf: { ...editing.pf, exitReason: v } })} />
              </Section>

              <Section title="ESI">
                <Toggle label="ESI applicable" checked={editing.esi.enabled} onChange={(v) => setEditing({ ...editing, esi: { ...editing.esi, enabled: v } })} />
                <Field label="IP number (10 digits)" value={editing.esi.ipNumber} onChange={(v) => setEditing({ ...editing, esi: { ...editing.esi, ipNumber: v } })} />
                <Field label="Dispensary" value={editing.esi.dispensary} onChange={(v) => setEditing({ ...editing, esi: { ...editing.esi, dispensary: v } })} />
                <Toggle label="Person with disability (₹25,000 limit)" checked={editing.esi.disabled} onChange={(v) => setEditing({ ...editing, esi: { ...editing.esi, disabled: v } })} />
                <Toggle label="Continue coverage till period end" checked={editing.esi.continueTillPeriodEnd} onChange={(v) => setEditing({ ...editing, esi: { ...editing.esi, continueTillPeriodEnd: v } })} />
              </Section>

              <Section title="Bank & tax">
                <Field label="Account number" value={editing.bank.accountNumber} onChange={(v) => setEditing({ ...editing, bank: { ...editing.bank, accountNumber: v } })} />
                <Field label="IFSC" value={editing.bank.ifsc} onChange={(v) => setEditing({ ...editing, bank: { ...editing.bank, ifsc: v.toUpperCase() } })} />
                <Field label="Bank name" value={editing.bank.bankName} onChange={(v) => setEditing({ ...editing, bank: { ...editing.bank, bankName: v } })} />
                <Field label="Monthly TDS" type="number" value={editing.monthlyTds} onChange={(v) => setEditing({ ...editing, monthlyTds: Number(v) || 0 })} />
              </Section>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function labelFor(k) {
  return { basic: 'Basic', da: 'DA', hra: 'HRA', conveyance: 'Conveyance', medical: 'Medical', special: 'Special allowance', otherAllowance: 'Other allowance' }[k] || k;
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
        {value || '—'}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <Label className="text-xs">{label}</Label>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}
