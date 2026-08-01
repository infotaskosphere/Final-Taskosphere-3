// PayrollRun.jsx — monthly payroll processing: attendance/LOP entry, statutory
// computation, review grid, finalise and payslip/register/bank-advice output.
import React, { useEffect, useMemo, useState } from 'react';
import { Play, Lock, Unlock, FileSpreadsheet, FileText, Banknote, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { computePayrollLine, summarise, MONTHS, rupee, periodLabel, dueDates } from '@/lib/payroll/statutory';
import { getRun, saveRun } from '@/lib/payroll/store';
import { downloadSalaryRegister, downloadBankAdvice, downloadAllPayslips, downloadPayslip } from '@/lib/payroll/exports';

export default function PayrollRun({ employees, settings, month, year, setMonth, setYear, onSaved, canEdit = true }) {
  const [inputs, setInputs] = useState({});
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => employees.filter((e) => e.status !== 'inactive'), [employees]);
  const employeesById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  useEffect(() => {
    const existing = getRun(month, year);
    setRun(existing);
    setInputs(existing?.inputs || {});
  }, [month, year]);

  const lines = useMemo(() => {
    if (run?.status === 'finalised') return run.lines;
    return active.map((e) => computePayrollLine(e, { month, year, ...(inputs[e.id] || {}) }, settings));
  }, [active, inputs, month, year, settings, run]);

  const summary = useMemo(() => summarise(lines), [lines]);
  const due = dueDates(month, year);
  const locked = run?.status === 'finalised';

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
        <div className="flex-1" />
        {locked ? (
          <Badge variant="secondary" className="h-9 px-3 flex items-center gap-1"><Lock className="w-3 h-3" /> Finalised</Badge>
        ) : (
          <Badge variant="outline" className="h-9 px-3 flex items-center gap-1"><Unlock className="w-3 h-3" /> Draft</Badge>
        )}
        <Button variant="outline" disabled={!canEdit || busy || locked} onClick={() => persist('draft')}>Save draft</Button>
        <Button disabled={!canEdit || busy || locked || !lines.length} onClick={() => persist('finalised')}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}Finalise payroll
        </Button>
        {locked && <Button variant="ghost" disabled={!canEdit} onClick={() => { setRun({ ...run, status: 'draft' }); saveRun({ ...run, status: 'draft' }); }}>Reopen</Button>}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Stat label="Employees" value={summary.headcount} />
        <Stat label="Gross wages" value={rupee(summary.gross)} />
        <Stat label="Net payable" value={rupee(summary.net)} />
        <Stat label="PF remittance" value={rupee(summary.pfEmployee + summary.pfEmployerEpf + summary.pfEmployerEps + summary.pfEdli + summary.pfAdmin)} hint={`Due ${due.pf}`} />
        <Stat label="ESI payable" value={rupee(summary.esiEmployee + summary.esiEmployer)} hint={`Due ${due.esi}`} />
        <Stat label="PT + TDS" value={rupee(summary.pt + summary.tds)} hint={`TDS due ${due.tds}`} />
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="w-20">LOP</TableHead>
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
              <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">Add employees first to process payroll for {periodLabel(month, year)}.</TableCell></TableRow>
            )}
            {lines.map((l) => (
              <TableRow key={l.employeeId}>
                <TableCell>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.code || '—'} · {l.earnings.paidDays}/{l.earnings.totalDays} days
                    {l.pf.applicable && <span className="ml-2">PF</span>}
                    {l.esi.applicable && <span className="ml-1">ESI</span>}
                  </div>
                </TableCell>
                {['lopDays', 'overtime', 'incentive', 'advance', 'tds'].map((k) => (
                  <TableCell key={k}>
                    <Input className="h-8" type="number" disabled={locked || !canEdit}
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
            ))}
          </TableBody>
        </Table>
      </Card>

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
