// PayrollRun.jsx — monthly payroll processing: attendance-driven LOP,
// statutory computation, review grid, finalise and payslip/register/bank-
// advice output.
//
// LOP (loss-of-pay) days are pulled automatically from the real Attendance
// system (see lib/payroll/linkAttendance.js) for the selected month whenever
// settings.attendance.autoCalculateLop is on (the default). This only ever
// prefills a value the person hasn't already set for this run — a saved
// draft's numbers, or anything typed in by hand, are never silently
// overwritten. Use "Recalculate from attendance" to force a refresh.
import React, { useEffect, useMemo, useState } from 'react';
import { Play, Lock, Unlock, FileSpreadsheet, FileText, Banknote, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { computePayrollLine, summarise, MONTHS, rupee, periodLabel, dueDates } from '@/lib/payroll/statutory';
import { getRun, saveRun } from '@/lib/payroll/store';
import { attendanceSummaryForEmployees } from '@/lib/payroll/linkAttendance';
import { downloadSalaryRegister, downloadBankAdvice, downloadAllPayslips, downloadPayslip } from '@/lib/payroll/exports';

export default function PayrollRun({ employees, employeesLoading = false, settings, month, year, setMonth, setYear, onSaved, canEdit = true }) {
  const [inputs, setInputs] = useState({});
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState({}); // employeeId -> summary from attendanceSummaryForEmployees
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const active = useMemo(() => employees.filter((e) => e.status !== 'inactive'), [employees]);
  const employeesById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const autoLop = settings?.attendance?.autoCalculateLop !== false;

  useEffect(() => {
    const existing = getRun(month, year);
    setRun(existing);
    setInputs(existing?.inputs || {});
  }, [month, year]);

  // Pull attendance-derived LOP for everyone in this run whenever the
  // period or roster changes, then prefill it — but only for employees who
  // don't already have a lopDays value for this run (a loaded draft or a
  // manual edit is never overwritten by this effect).
  useEffect(() => {
    if (!autoLop || locked() || active.length === 0) return;
    let cancelled = false;
    setAttendanceLoading(true);
    attendanceSummaryForEmployees(active.map((e) => e.id), month, year, settings)
      .then((summaries) => {
        if (cancelled) return;
        setAttendance(summaries);
        setInputs((prev) => {
          const next = { ...prev };
          active.forEach((e) => {
            if (next[e.id]?.lopDays != null) return; // already set — don't clobber
            const s = summaries[e.id];
            if (s?.ok) next[e.id] = { ...(next[e.id] || {}), lopDays: s.lopDays };
          });
          return next;
        });
      })
      .finally(() => { if (!cancelled) setAttendanceLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, active.map((e) => e.id).join(','), autoLop]);

  function locked() { return run?.status === 'finalised'; }

  const recalculateFromAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const summaries = await attendanceSummaryForEmployees(active.map((e) => e.id), month, year, settings);
      setAttendance(summaries);
      setInputs((prev) => {
        const next = { ...prev };
        active.forEach((e) => {
          const s = summaries[e.id];
          if (s?.ok) next[e.id] = { ...(next[e.id] || {}), lopDays: s.lopDays };
        });
        return next;
      });
      toast.success('LOP days recalculated from attendance');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const lines = useMemo(() => {
    if (run?.status === 'finalised') return run.lines;
    return active.map((e) => computePayrollLine(e, { month, year, ...(inputs[e.id] || {}) }, settings));
  }, [active, inputs, month, year, settings, run]);

  const summary = useMemo(() => summarise(lines), [lines]);
  const due = dueDates(month, year);
  const isLocked = locked();

  const setInput = (id, key, value) =>
    setInputs((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));

  const persist = (status) => {
    setBusy(true);
    try {
      const saved = saveRun({ id: run?.id, month, year, status, inputs, lines, summary });
      setRun(saved);
      onSaved?.();
      toast.success(status === 'finalised' ? 'Payroll finalised' : 'Draft saved');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Input className="w-28" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        {autoLop && (
          <Button variant="outline" size="sm" disabled={isLocked || attendanceLoading || !active.length} onClick={recalculateFromAttendance}>
            {attendanceLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Recalculate from attendance
          </Button>
        )}
        <div className="flex-1" />
        {isLocked ? (
          <Badge variant="secondary" className="h-9 px-3 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalised</Badge>
        ) : (
          <Badge variant="outline" className="h-9 px-3 flex items-center gap-1"><Unlock className="w-3 h-3" /> Draft</Badge>
        )}
        <Button variant="outline" disabled={!canEdit || busy || isLocked} onClick={() => persist('draft')}>Save draft</Button>
        <Button disabled={!canEdit || busy || isLocked || !lines.length} onClick={() => persist('finalised')}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}Finalise payroll
        </Button>
        {isLocked && <Button variant="ghost" disabled={!canEdit} onClick={() => { setRun({ ...run, status: 'draft' }); saveRun({ ...run, status: 'draft' }); }}>Reopen</Button>}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Employees" value={summary.headcount} />
        <Stat label="Gross wages" value={rupee(summary.gross)} />
        <Stat label="Net payable" value={rupee(summary.net)} />
        <Stat label="PF remittance" value={rupee(summary.pfEmployee + summary.pfEmployerEpf + summary.pfEmployerEps + summary.pfEdli + summary.pfAdmin)} hint={`Due ${due.pf}`} />
        <Stat label="ESI payable" value={rupee(summary.esiEmployee + summary.esiEmployer)} hint={`Due ${due.esi}`} />
        <Stat label="PT + TDS" value={rupee(summary.pt + summary.tds)} hint={`TDS due ${due.tds}`} />
      </div>

      {employeesLoading ? (
        <Card className="p-10 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading employees…</Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="w-24">LOP {autoLop && <span className="text-[10px] font-normal text-muted-foreground">(auto)</span>}</TableHead>
                <TableHead className="w-24">OT</TableHead>
                <TableHead className="w-24">Incentive</TableHead>
                <TableHead className="w-24">Advance</TableHead>
                <TableHead className="w-24">TDS</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">PF EE</TableHead>
                <TableHead className="text-right">ESI EE</TableHead>
                <TableHead className="text-right">PT</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                  {employees.length === 0
                    ? 'No users yet — add people under People Matrix → Users.'
                    : `Set up payroll for at least one employee to process payroll for ${periodLabel(month, year)}.`}
                </TableCell></TableRow>
              )}
              {lines.map((l) => {
                const att = attendance[l.employeeId];
                return (
                  <TableRow key={l.employeeId}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.code || '—'} · {l.earnings.paidDays}/{l.earnings.totalDays} days
                        {l.pf.applicable && <span className="ml-2">PF</span>}
                        {l.esi.applicable && <span className="ml-1">ESI</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" type="number" disabled={isLocked || !canEdit}
                        value={inputs[l.employeeId]?.lopDays ?? 0}
                        onChange={(e) => setInput(l.employeeId, 'lopDays', Number(e.target.value) || 0)} />
                      {att?.ok && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {att.absentDays} absent{att.halfDays ? `, ${att.halfDays} half-day` : ''}{att.leaveDays ? `, ${att.leaveDays} leave` : ''}
                        </div>
                      )}
                    </TableCell>
                    {['overtime', 'incentive', 'advance', 'tds'].map((k) => (
                      <TableCell key={k}>
                        <Input className="h-8" type="number" disabled={isLocked || !canEdit}
                          value={inputs[l.employeeId]?.[k] ?? (k === 'tds' ? employeesById[l.employeeId]?.monthlyTds ?? 0 : 0)}
                          onChange={(e) => setInput(l.employeeId, k, Number(e.target.value) || 0)} />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">{rupee(l.earnings.gross)}</TableCell>
                    <TableCell className="text-right">{rupee(l.pf.employee + l.pf.vpf)}</TableCell>
                    <TableCell className="text-right">{rupee(l.esi.employee)}</TableCell>
                    <TableCell className="text-right">{rupee(l.pt)}</TableCell>
                    <TableCell className="text-right font-medium">{rupee(l.netPay)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" title="Payslip"
                        onClick={() => downloadPayslip(l, employeesById[l.employeeId] || {}, settings, { month, year })}>
                        <FileText className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="p-4 flex flex-wrap gap-2">
        <Button variant="outline" disabled={!lines.length} onClick={() => downloadSalaryRegister({ month, year, lines, summary }, employeesById, settings)}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />Salary register (Excel)
        </Button>
        <Button variant="outline" disabled={!lines.length} onClick={() => downloadAllPayslips({ month, year, lines }, employeesById, settings)}>
          <FileText className="w-4 h-4 mr-2" />All payslips (PDF)
        </Button>
        <Button variant="outline" disabled={!lines.length} onClick={() => downloadBankAdvice({ month, year, lines }, employeesById)}>
          <Banknote className="w-4 h-4 mr-2" />Bank transfer advice (CSV)
        </Button>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}
