// exports.js — statutory return / challan / register file generators.
// Formats follow EPFO ECR 2.0 and the ESIC monthly-contribution template so the
// generated files can be uploaded on the Unified Portal / ESIC portal as-is.

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MONTHS, periodLabel, pfChallan, esiChallan, rupee, summarise } from './statutory';

const stamp = (m, y) => `${String(m).padStart(2, '0')}-${y}`;

export function downloadText(filename, text) {
  saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  saveAs(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadSheet(filename, sheets) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
  });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), filename);
}

/* ─────────────────────────── EPFO ECR 2.0 ─────────────────────────────────
 * Pipe layout: UAN#~#Name#~#Gross#~#EPF wages#~#EPS wages#~#EDLI wages#~#
 * EPF contri#~#EPS contri#~#EPF-EPS diff#~#NCP days#~#Refund of advances
 * ------------------------------------------------------------------------ */
export function buildEcr(run) {
  return run.lines
    .filter((l) => l.pf.applicable)
    .map((l) => [
      l.pf?.uan || l.uan || '',
      (l.name || '').toUpperCase().replace(/[#~]/g, ' '),
      Math.round(l.earnings.gross),
      Math.round(l.pf.pfWages),
      Math.round(l.pf.epsWages),
      Math.round(l.pf.edliWages),
      Math.round(l.pf.employee + l.pf.vpf),
      Math.round(l.pf.employerEps),
      Math.round(l.pf.employerEpf),
      Math.round(l.ncpDays),
      Math.round(l.refundOfAdvances || 0),
    ].join('#~#'))
    .join('\r\n');
}

export function downloadEcr(run, employeesById) {
  const withUan = {
    ...run,
    lines: run.lines.map((l) => ({ ...l, uan: employeesById[l.employeeId]?.pf?.uan || '' })),
  };
  downloadText(`ECR_${stamp(run.month, run.year)}.txt`, buildEcr(withUan));
}

/* ─────────────────────── ESIC monthly contribution ───────────────────────
 * Columns per the ESIC bulk-upload template.
 * ------------------------------------------------------------------------ */
export function esicRows(run, employeesById) {
  const header = [
    'IP Number (10 Digits)',
    'IP Name',
    'No of Days for which wages paid/payable during the month',
    'Total Monthly Wages',
    'Reason Code for Zero workings days (numeric only; provide 0 for all other reasons)',
    'Last Working Day (Format DD/MM/YYYY or DD-MM-YYYY)',
  ];
  const body = run.lines
    .filter((l) => l.esi.applicable)
    .map((l) => [
      employeesById[l.employeeId]?.esi?.ipNumber || '',
      l.name,
      l.esiDaysPaid,
      Math.round(l.esi.wages),
      l.esiDaysPaid === 0 ? l.esiZeroReason || '1' : '0',
      l.lastWorkingDay || '',
    ]);
  return [header, ...body];
}

export function downloadEsicCsv(run, employeesById) {
  downloadCsv(`ESIC_MC_${stamp(run.month, run.year)}.csv`, esicRows(run, employeesById));
}

export function downloadEsicExcel(run, employeesById) {
  downloadSheet(`ESIC_MC_${stamp(run.month, run.year)}.xlsx`, {
    'ESIC Contribution': esicRows(run, employeesById),
  });
}

/* ───────────────────────────── Registers ────────────────────────────────── */
export function downloadSalaryRegister(run, employeesById, settings) {
  const head = [
    'Emp Code', 'Name', 'UAN', 'ESIC IP', 'PAN', 'Designation', 'Department',
    'Total Days', 'Paid Days', 'LOP',
    'Basic', 'DA', 'HRA', 'Conveyance', 'Medical', 'Special', 'Other', 'OT', 'Bonus', 'Incentive', 'Arrears', 'Gross',
    'PF Wages', 'PF Employee', 'VPF', 'ESI Wages', 'ESI Employee', 'PT', 'LWF', 'TDS', 'Advance', 'Other Ded', 'Total Deductions', 'Net Pay',
    'EPF Employer', 'EPS Employer', 'EDLI', 'PF Admin', 'ESI Employer', 'CTC',
    'Bank A/c', 'IFSC',
  ];
  const rows = run.lines.map((l) => {
    const e = employeesById[l.employeeId] || {};
    const x = l.earnings;
    return [
      l.code, l.name, e.pf?.uan || '', e.esi?.ipNumber || '', e.pan || '', e.designation || '', e.department || '',
      x.totalDays, x.paidDays, x.lopDays,
      x.basic, x.da, x.hra, x.conveyance, x.medical, x.special, x.otherAllowance, x.overtime, x.bonus, x.incentive, x.arrears, x.gross,
      l.pf.pfWages, l.pf.employee, l.pf.vpf, l.esi.wages, l.esi.employee, l.pt, l.lwf.employee, l.tds, l.advance, l.otherDeduction, l.totalDeductions, l.netPay,
      l.pf.employerEpf, l.pf.employerEps, l.pf.edli, l.pf.admin, l.esi.employer, l.ctc,
      e.bank?.accountNumber || '', e.bank?.ifsc || '',
    ];
  });
  const s = run.summary || summarise(run.lines);
  const pf = pfChallan(s, settings);
  const esi = esiChallan(s);
  downloadSheet(`Salary_Register_${stamp(run.month, run.year)}.xlsx`, {
    'Salary Register': [head, ...rows],
    'PF Challan': [
      ['Account', 'Description', 'Amount'],
      ['A/c 1', 'EPF (EE 12% + ER 3.67%)', pf.ac1],
      ['A/c 2', 'EPF Admin charges (0.5%, min ₹75)', pf.ac2],
      ['A/c 10', 'EPS (8.33%)', pf.ac10],
      ['A/c 21', 'EDLI (0.5%)', pf.ac21],
      ['A/c 22', 'EDLI Admin (abolished)', pf.ac22],
      ['', 'Total remittance', pf.total],
    ],
    'ESI Challan': [
      ['Description', 'Amount'],
      ['Employee contribution (0.75%)', esi.employee],
      ['Employer contribution (3.25%)', esi.employer],
      ['Total payable', esi.total],
    ],
  });
}

export function downloadBankAdvice(run, employeesById) {
  const rows = [
    ['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Narration'],
    ...run.lines
      .filter((l) => l.netPay > 0)
      .map((l) => {
        const e = employeesById[l.employeeId] || {};
        return [
          e.bank?.accountHolder || l.name,
          e.bank?.accountNumber || '',
          e.bank?.ifsc || '',
          l.netPay,
          `SALARY ${MONTHS[run.month - 1].slice(0, 3).toUpperCase()}${run.year}`,
        ];
      }),
  ];
  downloadCsv(`Bank_Advice_${stamp(run.month, run.year)}.csv`, rows);
}

/* ─────────────────── PF Forms 5 / 10 / 12A and 3A / 6A ─────────────────── */
export function downloadPfForms(run, employeesById, settings) {
  const s = run.summary || summarise(run.lines);
  const pf = pfChallan(s, settings);
  const period = periodLabel(run.month, run.year);
  const joiners = run.lines
    .map((l) => employeesById[l.employeeId])
    .filter((e) => e && sameMonth(e.doj, run.month, run.year));
  const leavers = run.lines
    .map((l) => employeesById[l.employeeId])
    .filter((e) => e && sameMonth(e.dol, run.month, run.year));

  downloadSheet(`PF_Forms_${stamp(run.month, run.year)}.xlsx`, {
    'Form 5 (New joiners)': [
      [`Form 5 — Employees qualifying for membership — ${period}`],
      [`Establishment code: ${settings.employer.pfEstablishmentCode || '-'}`],
      [],
      ['S.No', 'UAN', 'Name', 'Father/Husband Name', 'DOB', 'Gender', 'Date of Joining', 'PF Wages', 'Remarks'],
      ...joiners.map((e, i) => [i + 1, e.pf?.uan, e.name, e.fatherName, e.dob, e.gender, e.doj, e.structure?.basic, '']),
    ],
    'Form 10 (Exits)': [
      [`Form 10 — Members leaving service — ${period}`],
      [],
      ['S.No', 'UAN', 'Name', 'Father/Husband Name', 'Date of Leaving', 'Reason for Leaving'],
      ...leavers.map((e, i) => [i + 1, e.pf?.uan, e.name, e.fatherName, e.dol, e.pf?.exitReason || 'Cessation']),
    ],
    'Form 12A': [
      [`Form 12A — Monthly statement — ${period}`],
      [`Establishment: ${settings.employer.name || '-'} (${settings.employer.pfEstablishmentCode || '-'})`],
      [],
      ['Particulars', 'Amount'],
      ['Total wages on which contribution payable', s.pfWages],
      ['EPS wages', s.epsWages],
      ['A/c 1 — EPF', pf.ac1],
      ['A/c 2 — Admin charges', pf.ac2],
      ['A/c 10 — EPS', pf.ac10],
      ['A/c 21 — EDLI', pf.ac21],
      ['A/c 22 — EDLI admin', pf.ac22],
      ['Total remitted', pf.total],
      ['No. of subscribers', s.pfMembers],
      ['Joiners during the month', joiners.length],
      ['Left during the month', leavers.length],
    ],
  });
}

export function downloadPfAnnual(runs, employeesById, settings, fy) {
  const emps = Object.values(employeesById);
  const head = ['UAN', 'Name', ...runs.map((r) => MONTHS[r.month - 1].slice(0, 3) + ' ' + r.year), 'Total EE', 'Total EPF ER', 'Total EPS'];
  const rows = emps.map((e) => {
    let ee = 0, er = 0, eps = 0;
    const cells = runs.map((r) => {
      const l = r.lines.find((x) => x.employeeId === e.id);
      if (!l) return 0;
      ee += l.pf.employee + l.pf.vpf; er += l.pf.employerEpf; eps += l.pf.employerEps;
      return Math.round(l.pf.employee + l.pf.vpf);
    });
    return [e.pf?.uan || '', e.name, ...cells, Math.round(ee), Math.round(er), Math.round(eps)];
  });
  downloadSheet(`PF_Form_3A_6A_${fy}.xlsx`, {
    'Form 3A (Member-wise)': [[`Form 3A — Contribution card — FY ${fy}`], [`Establishment: ${settings.employer.pfEstablishmentCode || '-'}`], [], head, ...rows],
    'Form 6A (Consolidated)': [
      [`Form 6A — Annual consolidated statement — FY ${fy}`], [],
      ['Month', 'PF Wages', 'A/c 1', 'A/c 2', 'A/c 10', 'A/c 21', 'Total'],
      ...runs.map((r) => {
        const s = r.summary || summarise(r.lines);
        const c = pfChallan(s, settings);
        return [periodLabel(r.month, r.year), s.pfWages, c.ac1, c.ac2, c.ac10, c.ac21, c.total];
      }),
    ],
  });
}

/* ───────────────── ESI half-yearly return (Form 5) + Form 6 ─────────────── */
export function downloadEsiHalfYearly(runs, employeesById, settings, label) {
  const emps = Object.values(employeesById);
  downloadSheet(`ESI_Form5_${label.replace(/\s/g, '')}.xlsx`, {
    'Form 5 (Return of Contribution)': [
      [`ESI Form 5 — Return of Contributions — ${label}`],
      [`Employer code: ${settings.employer.esicEmployerCode || '-'}`],
      [],
      ['S.No', 'IP Number', 'IP Name', 'Total Wages', 'Days Paid', 'EE Contribution', 'ER Contribution'],
      ...emps.map((e, i) => {
        let w = 0, d = 0, ee = 0, er = 0;
        runs.forEach((r) => {
          const l = r.lines.find((x) => x.employeeId === e.id);
          if (l?.esi?.applicable) { w += l.esi.wages; d += l.esiDaysPaid; ee += l.esi.employee; er += l.esi.employer; }
        });
        return w ? [i + 1, e.esi?.ipNumber || '', e.name, Math.round(w), d, Math.round(ee), Math.round(er)] : null;
      }).filter(Boolean),
    ],
    'Form 6 (Register)': [
      ['Month', 'Insured Persons', 'Total Wages', 'EE Contribution', 'ER Contribution', 'Total Payable'],
      ...runs.map((r) => {
        const s = r.summary || summarise(r.lines);
        return [periodLabel(r.month, r.year), s.esiMembers, s.esiWages, s.esiEmployee, s.esiEmployer, Math.ceil(s.esiEmployee + s.esiEmployer)];
      }),
    ],
  });
}

/* ─────────────────────────────── Payslips ──────────────────────────────── */
export function renderPayslip(doc, line, employee, settings, run) {
  const period = periodLabel(run.month, run.year);
  doc.setFontSize(14);
  doc.text(settings.employer.name || 'Payslip', 14, 16);
  doc.setFontSize(9);
  doc.text(settings.employer.address || '', 14, 22);
  doc.setFontSize(11);
  doc.text(`Payslip for ${period}`, 14, 32);

  autoTable(doc, {
    startY: 36,
    theme: 'grid',
    styles: { fontSize: 8 },
    body: [
      ['Employee', `${line.name} (${line.code || '-'})`, 'UAN', employee.pf?.uan || '-'],
      ['Designation', employee.designation || '-', 'ESIC IP', employee.esi?.ipNumber || '-'],
      ['Department', employee.department || '-', 'PAN', employee.pan || '-'],
      ['Date of Joining', employee.doj || '-', 'Bank A/c', employee.bank?.accountNumber || '-'],
      ['Paid Days', `${line.earnings.paidDays} / ${line.earnings.totalDays}`, 'LOP Days', line.earnings.lopDays],
    ],
  });

  const e = line.earnings;
  const earnings = [
    ['Basic', e.basic], ['DA', e.da], ['HRA', e.hra], ['Conveyance', e.conveyance],
    ['Medical', e.medical], ['Special Allowance', e.special], ['Other Allowance', e.otherAllowance],
    ['Overtime', e.overtime], ['Bonus', e.bonus], ['Incentive', e.incentive], ['Arrears', e.arrears],
  ].filter(([, v]) => v);
  const deductions = [
    ['PF (Employee)', line.pf.employee], ['VPF', line.pf.vpf], ['ESI (Employee)', line.esi.employee],
    ['Professional Tax', line.pt], ['LWF', line.lwf.employee], ['TDS', line.tds],
    ['Advance', line.advance], ['Other Deduction', line.otherDeduction],
  ].filter(([, v]) => v);

  const rows = [];
  for (let i = 0; i < Math.max(earnings.length, deductions.length); i++) {
    rows.push([
      earnings[i]?.[0] || '', earnings[i] ? rupee(earnings[i][1]) : '',
      deductions[i]?.[0] || '', deductions[i] ? rupee(deductions[i][1]) : '',
    ]);
  }
  rows.push(['Gross Earnings', rupee(e.gross), 'Total Deductions', rupee(line.totalDeductions)]);

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8 },
  });

  let y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.text(`Net Pay: ${rupee(line.netPay)}`, 14, y);

  if (settings.payslip.showEmployerContribution) {
    autoTable(doc, {
      startY: y + 4,
      head: [['Employer contribution', 'Amount']],
      body: [
        ['EPF (A/c 1)', rupee(line.pf.employerEpf)],
        ['EPS (A/c 10)', rupee(line.pf.employerEps)],
        ['EDLI (A/c 21)', rupee(line.pf.edli)],
        ['PF Admin (A/c 2)', rupee(line.pf.admin)],
        ['ESI Employer', rupee(line.esi.employer)],
        ['Cost to Company', rupee(line.ctc)],
      ],
      theme: 'striped',
      styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY;
  }
  doc.setFontSize(8);
  doc.text(settings.payslip.footNote || '', 14, y + 10);
  return doc;
}

export function payslipPdf(line, employee, settings, run) {
  return renderPayslip(new jsPDF(), line, employee, settings, run);
}

export function downloadPayslip(line, employee, settings, run) {
  payslipPdf(line, employee, settings, run).save(`Payslip_${line.code || line.name}_${stamp(run.month, run.year)}.pdf`);
}

export function downloadAllPayslips(run, employeesById, settings) {
  const doc = new jsPDF();
  run.lines.forEach((line, i) => {
    if (i > 0) doc.addPage();
    doc.lastAutoTable = undefined;
    renderPayslip(doc, line, employeesById[line.employeeId] || {}, settings, run);
  });
  doc.save(`Payslips_${stamp(run.month, run.year)}.pdf`);
}

/* ─────────────────── Employee master import / template ─────────────────── */
export const EMPLOYEE_TEMPLATE_HEADER = [
  'code', 'name', 'fatherName', 'gender', 'dob', 'doj', 'designation', 'department',
  'pan', 'aadhaar', 'mobile', 'email', 'uan', 'pfMemberId', 'esicIpNumber',
  'basic', 'da', 'hra', 'conveyance', 'medical', 'special', 'otherAllowance',
  'bankAccount', 'ifsc', 'bankName', 'monthlyTds',
];

export function downloadEmployeeTemplate() {
  downloadSheet('Employee_Master_Template.xlsx', {
    Employees: [
      EMPLOYEE_TEMPLATE_HEADER,
      ['E001', 'Ramesh Kumar', 'Suresh Kumar', 'M', '1990-05-12', '2022-04-01', 'Accountant', 'Accounts',
        'ABCPK1234F', '', '9876543210', 'ramesh@example.com', '100123456789', '', '3100123456',
        12000, 0, 4800, 1600, 1250, 4350, 0, '000111222333', 'HDFC0000123', 'HDFC Bank', 0],
    ],
  });
}

export function parseEmployeeSheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        resolve(rows.map(mapRowToEmployee));
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function num(v) { return Number(String(v).replace(/[^\d.-]/g, '')) || 0; }

function mapRowToEmployee(r) {
  return {
    code: String(r.code || '').trim(),
    name: String(r.name || '').trim(),
    fatherName: r.fatherName || '',
    gender: r.gender || 'M',
    dob: r.dob || '',
    doj: r.doj || '',
    designation: r.designation || '',
    department: r.department || '',
    pan: r.pan || '',
    aadhaar: String(r.aadhaar || ''),
    mobile: String(r.mobile || ''),
    email: r.email || '',
    monthlyTds: num(r.monthlyTds),
    status: 'active',
    structure: {
      basic: num(r.basic), da: num(r.da), hra: num(r.hra), conveyance: num(r.conveyance),
      medical: num(r.medical), special: num(r.special), otherAllowance: num(r.otherAllowance),
    },
    pf: { enabled: !!r.uan, uan: String(r.uan || ''), memberId: String(r.pfMemberId || ''), epsEligible: true, vpfRate: 0 },
    esi: { enabled: !!r.esicIpNumber, ipNumber: String(r.esicIpNumber || ''), disabled: false },
    bank: { accountNumber: String(r.bankAccount || ''), ifsc: r.ifsc || '', bankName: r.bankName || '', accountHolder: r.name || '' },
  };
}
