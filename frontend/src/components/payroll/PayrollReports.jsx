// PayrollReports.jsx — YTD cost analysis, statutory liability trend and the
// TDS (Form 24Q Annexure I style) working built from finalised runs.
import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { summarise, pfChallan, rupee, periodLabel } from '@/lib/payroll/statutory';
import { downloadSheet } from '@/lib/payroll/exports';

export default function PayrollReports({ runs, employees, settings }) {
  const rows = useMemo(() => runs.slice().sort((a, b) => (a.year - b.year) || (a.month - b.month)).map((r) => {
    const s = r.summary || summarise(r.lines);
    const pf = pfChallan(s, settings);
    return { r, s, pf };
  }), [runs, settings]);

  if (!rows.length) return <Card className="p-10 text-center text-muted-foreground">No processed payroll yet.</Card>;

  const total = rows.reduce((a, { s }) => ({
    gross: a.gross + s.gross, net: a.net + s.net, pf: a.pf + s.pfEmployee + s.pfEmployerEpf + s.pfEmployerEps,
    esi: a.esi + s.esiEmployee + s.esiEmployer, tds: a.tds + s.tds, ctc: a.ctc + s.ctc,
  }), { gross: 0, net: 0, pf: 0, esi: 0, tds: 0, ctc: 0 });

  const exportAll = () => {
    downloadSheet('Payroll_Reports.xlsx', {
      'Monthly summary': [
        ['Period', 'Headcount', 'Gross', 'Net', 'PF total', 'ESI total', 'PT', 'TDS', 'CTC'],
        ...rows.map(({ r, s, pf }) => [periodLabel(r.month, r.year), s.headcount, s.gross, s.net, pf.total, s.esiEmployee + s.esiEmployer, s.pt, s.tds, s.ctc]),
      ],
      'TDS 24Q working': [
        ['Employee', 'PAN', 'Gross paid', 'PF (80C)', 'PT (16iii)', 'TDS deducted'],
        ...employees.map((e) => {
          let g = 0, p = 0, pt = 0, t = 0;
          runs.forEach((r) => {
            const l = r.lines.find((x) => x.employeeId === e.id);
            if (l) { g += l.earnings.gross; p += l.pf.employee + l.pf.vpf; pt += l.pt; t += l.tds; }
          });
          return g ? [e.name, e.pan || '', Math.round(g), Math.round(p), Math.round(pt), Math.round(t)] : null;
        }).filter(Boolean),
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Gross wages" value={rupee(total.gross)} />
        <Stat label="Net paid" value={rupee(total.net)} />
        <Stat label="PF contributions" value={rupee(total.pf)} />
        <Stat label="ESI contributions" value={rupee(total.esi)} />
        <Stat label="Total cost" value={rupee(total.ctc)} />
      </div>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead><TableHead>Headcount</TableHead>
              <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">PF challan</TableHead>
              <TableHead className="text-right">ESI payable</TableHead><TableHead className="text-right">PT</TableHead>
              <TableHead className="text-right">TDS</TableHead><TableHead className="text-right">Net paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ r, s, pf }) => (
              <TableRow key={r.id}>
                <TableCell>{periodLabel(r.month, r.year)}</TableCell>
                <TableCell>{s.headcount}</TableCell>
                <TableCell className="text-right">{rupee(s.gross)}</TableCell>
                <TableCell className="text-right">{rupee(pf.total)}</TableCell>
                <TableCell className="text-right">{rupee(s.esiEmployee + s.esiEmployer)}</TableCell>
                <TableCell className="text-right">{rupee(s.pt)}</TableCell>
                <TableCell className="text-right">{rupee(s.tds)}</TableCell>
                <TableCell className="text-right">{rupee(s.net)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Button variant="outline" onClick={exportAll}><Download className="w-4 h-4 mr-2" />Export reports (Excel)</Button>
    </div>
  );
}

function Stat({ label, value }) {
  return <Card className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold mt-1">{value}</div></Card>;
}
