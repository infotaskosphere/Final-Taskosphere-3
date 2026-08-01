// ComplianceCenter.jsx — PF & ESI return filing centre: ECR 2.0 text file,
// ESIC monthly contribution file, challan working, PF Forms 5/10/12A/3A/6A and
// the ESI half-yearly Form 5, plus a due-date tracker.
import React, { useMemo, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { summarise, pfChallan, esiChallan, rupee, periodLabel, dueDates, MONTHS } from '@/lib/payroll/statutory';
import { downloadEcr, downloadEsicCsv, downloadEsicExcel, downloadPfForms, downloadPfAnnual, downloadEsiHalfYearly } from '@/lib/payroll/exports';

export default function ComplianceCenter({ runs, employees, settings }) {
  const employeesById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const [selectedId, setSelectedId] = useState(runs[0]?.id || '');
  const run = runs.find((r) => r.id === selectedId) || runs[0];

  if (!run) {
    return <Card className="p-10 text-center text-muted-foreground">Finalise a payroll run first — returns are generated from processed months.</Card>;
  }

  const summary = run.summary || summarise(run.lines);
  const pf = pfChallan(summary, settings);
  const esi = esiChallan(summary);
  const due = dueDates(run.month, run.year);
  const issues = validate(run, employeesById, settings);

  const fyOf = (r) => (r.month >= 4 ? `${r.year}-${String((r.year + 1) % 100).padStart(2, '0')}` : `${r.year - 1}-${String(r.year % 100).padStart(2, '0')}`);
  const fy = fyOf(run);
  const fyRuns = runs.filter((r) => fyOf(r) === fy).sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const halfLabel = run.month >= 4 && run.month <= 9 ? `Apr-Sep ${run.year}` : `Oct-Mar ${run.month >= 10 ? run.year : run.year - 1}`;
  const halfRuns = fyRuns.filter((r) => (run.month >= 4 && run.month <= 9 ? r.month >= 4 && r.month <= 9 : r.month >= 10 || r.month <= 3));

  const guard = (fn) => () => {
    if (issues.blocking.length) return toast.error('Fix the blocking validations first');
    fn();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Return period</span>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={run.id} onChange={(e) => setSelectedId(e.target.value)}>
          {runs.map((r) => <option key={r.id} value={r.id}>{periodLabel(r.month, r.year)} {r.status === 'finalised' ? '' : '(draft)'}</option>)}
        </select>
        <Badge variant={run.status === 'finalised' ? 'default' : 'outline'}>{run.status}</Badge>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-semibold text-sm">Pre-filing validation</div>
        {issues.blocking.length === 0 && issues.warnings.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" />All checks passed — ready to upload.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {issues.blocking.map((m, i) => <li key={`b${i}`} className="flex gap-2 text-destructive"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{m}</li>)}
            {issues.warnings.map((m, i) => <li key={`w${i}`} className="flex gap-2 text-amber-600"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{m}</li>)}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">EPF / EPS — ECR &amp; challan</div>
            <Badge variant="outline">Due {due.pf}</Badge>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Basis</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              <Row a="A/c 1" b="EPF — EE 12% + ER 3.67%" v={pf.ac1} />
              <Row a="A/c 2" b={`Admin charges 0.5% (min ₹${settings.pf.adminMinimum})`} v={pf.ac2} />
              <Row a="A/c 10" b="EPS 8.33% on EPS wages" v={pf.ac10} />
              <Row a="A/c 21" b="EDLI 0.5%" v={pf.ac21} />
              <Row a="A/c 22" b="EDLI admin (abolished)" v={pf.ac22} />
              <TableRow className="font-semibold"><TableCell colSpan={2}>Total remittance</TableCell><TableCell className="text-right">{rupee(pf.total)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <div className="text-xs text-muted-foreground">
            {summary.pfMembers} members · PF wages {rupee(summary.pfWages)} · EPS wages {rupee(summary.epsWages)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={guard(() => downloadEcr(run, employeesById))}><Download className="w-4 h-4 mr-2" />ECR 2.0 (.txt)</Button>
            <Button variant="outline" onClick={() => downloadPfForms(run, employeesById, settings)}>Forms 5 / 10 / 12A</Button>
            <Button variant="outline" onClick={() => downloadPfAnnual(fyRuns, employeesById, settings, fy)}>Form 3A / 6A ({fy})</Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">ESI — monthly contribution</div>
            <Badge variant="outline">Due {due.esi}</Badge>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Particulars</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>Insured persons</TableCell><TableCell className="text-right">{summary.esiMembers}</TableCell></TableRow>
              <TableRow><TableCell>Total ESI wages</TableCell><TableCell className="text-right">{rupee(summary.esiWages)}</TableCell></TableRow>
              <TableRow><TableCell>Employee @ {settings.esi.employeeRate}%</TableCell><TableCell className="text-right">{rupee(esi.employee)}</TableCell></TableRow>
              <TableRow><TableCell>Employer @ {settings.esi.employerRate}%</TableCell><TableCell className="text-right">{rupee(esi.employer)}</TableCell></TableRow>
              <TableRow className="font-semibold"><TableCell>Total payable</TableCell><TableCell className="text-right">{rupee(esi.total)}</TableCell></TableRow>
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-2">
            <Button onClick={guard(() => downloadEsicCsv(run, employeesById))}><Download className="w-4 h-4 mr-2" />Contribution file (.csv)</Button>
            <Button variant="outline" onClick={guard(() => downloadEsicExcel(run, employeesById))}>Contribution file (.xlsx)</Button>
            <Button variant="outline" onClick={() => downloadEsiHalfYearly(halfRuns, employeesById, settings, halfLabel)}>Half-yearly Form 5 ({halfLabel})</Button>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-2 text-sm">Compliance calendar — {periodLabel(run.month, run.year)}</div>
        <Table>
          <TableHeader><TableRow><TableHead>Statute</TableHead><TableHead>Return / payment</TableHead><TableHead>Due date</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell>EPF &amp; MP Act</TableCell><TableCell>ECR upload + challan</TableCell><TableCell>{due.pf}</TableCell><TableCell className="text-right">{rupee(pf.total)}</TableCell></TableRow>
            <TableRow><TableCell>ESI Act</TableCell><TableCell>Monthly contribution</TableCell><TableCell>{due.esi}</TableCell><TableCell className="text-right">{rupee(esi.total)}</TableCell></TableRow>
            <TableRow><TableCell>Professional Tax</TableCell><TableCell>Monthly PT return</TableCell><TableCell>{due.pt}</TableCell><TableCell className="text-right">{rupee(summary.pt)}</TableCell></TableRow>
            <TableRow><TableCell>Income Tax</TableCell><TableCell>TDS 192 deposit</TableCell><TableCell>{due.tds}</TableCell><TableCell className="text-right">{rupee(summary.tds)}</TableCell></TableRow>
          </TableBody>
        </Table>
        <div className="text-xs text-muted-foreground mt-2">
          Quarterly Form 24Q and annual Form 16 are prepared from the {MONTHS[run.month - 1]} register in the Reports tab.
        </div>
      </Card>
    </div>
  );
}

function Row({ a, b, v }) {
  return <TableRow><TableCell>{a}</TableCell><TableCell className="text-muted-foreground text-xs">{b}</TableCell><TableCell className="text-right">{rupee(v)}</TableCell></TableRow>;
}

function validate(run, employeesById, settings) {
  const blocking = [];
  const warnings = [];
  if (run.status !== 'finalised') warnings.push('This run is still a draft — finalise it before uploading returns.');
  if (!settings.employer.pfEstablishmentCode) warnings.push('PF establishment code is not set in Settings.');
  if (!settings.employer.esicEmployerCode) warnings.push('ESIC employer code is not set in Settings.');

  run.lines.forEach((l) => {
    const e = employeesById[l.employeeId] || {};
    if (l.pf.applicable && !/^\d{12}$/.test(e.pf?.uan || '')) blocking.push(`${l.name}: UAN must be 12 digits for the ECR file.`);
    if (l.esi.applicable && !/^\d{10}$/.test(e.esi?.ipNumber || '')) blocking.push(`${l.name}: ESIC IP number must be 10 digits.`);
    if (l.esi.applicable && l.esiDaysPaid === 0 && (!l.esiZeroReason || l.esiZeroReason === '0')) blocking.push(`${l.name}: zero paid days needs an ESIC reason code.`);
    if (!l.pf.applicable && l.earnings.basic > 0 && l.earnings.basic + l.earnings.da <= settings.pf.wageCeiling) warnings.push(`${l.name}: wages are within the PF ceiling but PF is not applied.`);
    if (!l.esi.applicable && l.earnings.gross > 0 && l.earnings.gross <= settings.esi.wageThreshold) warnings.push(`${l.name}: gross is within the ESI threshold but ESI is not applied.`);
  });
  return { blocking: [...new Set(blocking)], warnings: [...new Set(warnings)].slice(0, 8) };
}
