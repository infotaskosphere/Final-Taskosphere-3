// statutory.js — India payroll statutory computation engine (EPF/EPS/EDLI, ESI,
// PT, LWF, TDS). All rates/ceilings live in DEFAULT_SETTINGS so a firm can
// override them from Payroll → Settings without code changes.

export const DEFAULT_SETTINGS = {
  employer: {
    name: '',
    address: '',
    pfEstablishmentCode: '',   // e.g. MHBAN0012345000
    esicEmployerCode: '',      // 17-digit
    tan: '',
    pan: '',
    ptStateCode: 'MH',
  },
  pf: {
    enabled: true,
    wageCeiling: 15000,
    employeeRate: 12,
    employerRate: 12,
    epsRate: 8.33,
    edliRate: 0.5,
    adminRate: 0.5,           // A/c 2
    adminMinimum: 75,
    restrictToCeiling: true,  // cap PF wages at the ceiling
    epsMaxAge: 58,            // no EPS after 58 — full 12% to EPF
    vpfAllowed: true,
  },
  esi: {
    enabled: true,
    wageThreshold: 21000,
    disabledThreshold: 25000,
    employeeRate: 0.75,
    employerRate: 3.25,
    contributionPeriods: [
      { label: 'Apr–Sep', months: [4, 5, 6, 7, 8, 9] },
      { label: 'Oct–Mar', months: [10, 11, 12, 1, 2, 3] },
    ],
  },
  pt: {
    enabled: true,
    state: 'MH',
    slabs: [
      { upto: 7500, amount: 0 },
      { upto: 10000, amount: 175 },
      { upto: Infinity, amount: 200, februaryAmount: 300 },
    ],
  },
  lwf: { enabled: false, employee: 25, employer: 75, months: [6, 12] },
  gratuity: { enabled: true, rate: 4.81 },
  bonus: { enabled: true, minRate: 8.33, maxRate: 20, wageCeiling: 21000, calcCeiling: 7000 },
  payslip: { showEmployerContribution: true, footNote: 'This is a computer generated payslip.' },
};

export const ESI_ZERO_WAGE_REASONS = [
  { code: '0', label: 'Not applicable' },
  { code: '1', label: 'On leave' },
  { code: '2', label: 'Left service' },
  { code: '3', label: 'Retired' },
  { code: '4', label: 'Out of coverage' },
  { code: '5', label: 'Non-implemented area' },
  { code: '6', label: 'Suspension' },
  { code: '7', label: 'Strike / lockout' },
  { code: '8', label: 'Death' },
];

export const round = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;
export const ceilRupee = (n) => Math.ceil(Number(n) || 0);
export const rupee = (n) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function monthDays(month, year) {
  return new Date(year, month, 0).getDate();
}

/** Prorate the CTC structure for days actually paid in the month. */
export function proratedEarnings(employee, month, year, lopDays = 0, extra = {}) {
  const total = monthDays(month, year);
  const paidDays = Math.max(0, total - (Number(lopDays) || 0));
  const factor = total ? paidDays / total : 0;
  const s = employee.structure || {};
  const line = (v) => round((Number(v) || 0) * factor);

  const basic = line(s.basic);
  const da = line(s.da);
  const hra = line(s.hra);
  const conveyance = line(s.conveyance);
  const medical = line(s.medical);
  const special = line(s.special);
  const otherAllowance = line(s.otherAllowance);

  const overtime = round(extra.overtime);
  const bonus = round(extra.bonus);
  const incentive = round(extra.incentive);
  const arrears = round(extra.arrears);

  const gross = round(
    basic + da + hra + conveyance + medical + special + otherAllowance + overtime + bonus + incentive + arrears
  );

  return {
    totalDays: total,
    paidDays,
    lopDays: Number(lopDays) || 0,
    basic, da, hra, conveyance, medical, special, otherAllowance,
    overtime, bonus, incentive, arrears,
    gross,
  };
}

/** EPF / EPS / EDLI + admin charges for one employee-month. */
export function computePf(employee, earn, settings) {
  const cfg = settings.pf;
  const zero = {
    applicable: false, pfWages: 0, epsWages: 0, edliWages: 0,
    employee: 0, employerEps: 0, employerEpf: 0, employerTotal: 0,
    vpf: 0, edli: 0, admin: 0, totalRemittance: 0,
  };
  if (!cfg.enabled || employee.pf?.enabled === false || !employee.pf?.uan) return zero;

  // PF wages = basic + DA + retaining allowance (+ special if firm opts in)
  const pfWageBase = round(
    earn.basic + earn.da + (employee.pf?.includeSpecialAllowance ? earn.special : 0) + earn.arrears
  );
  const capped = cfg.restrictToCeiling && !employee.pf?.contributeOnActualWages;
  const pfWages = capped ? Math.min(pfWageBase, cfg.wageCeiling) : pfWageBase;

  const isEpsEligible = employee.pf?.epsEligible !== false && (employee.age == null || employee.age < cfg.epsMaxAge);
  const epsWages = isEpsEligible ? Math.min(pfWages, cfg.wageCeiling) : 0;
  const edliWages = Math.min(pfWages, cfg.wageCeiling);

  const employee_ = Math.round((pfWages * cfg.employeeRate) / 100);
  const vpf = Math.round((pfWages * (Number(employee.pf?.vpfRate) || 0)) / 100);
  const employerTotal = Math.round((pfWages * cfg.employerRate) / 100);
  const employerEps = Math.round((epsWages * cfg.epsRate) / 100);
  const employerEpf = Math.max(0, employerTotal - employerEps);
  const edli = Math.round((edliWages * cfg.edliRate) / 100);
  const admin = Math.round((pfWages * cfg.adminRate) / 100);

  return {
    applicable: true, pfWages, epsWages, edliWages,
    employee: employee_, vpf, employerEps, employerEpf, employerTotal,
    edli, admin,
    totalRemittance: employee_ + vpf + employerTotal + edli + admin,
  };
}

/** ESI for one employee-month. Employee 0.75%, employer 3.25%, rounded up. */
export function computeEsi(employee, earn, settings) {
  const cfg = settings.esi;
  const zero = { applicable: false, wages: 0, employee: 0, employer: 0, total: 0 };
  if (!cfg.enabled || employee.esi?.enabled === false || !employee.esi?.ipNumber) return zero;

  const threshold = employee.esi?.disabled ? cfg.disabledThreshold : cfg.wageThreshold;
  // ESI wages exclude annual bonus / gratuity but include OT.
  const wages = round(earn.gross - earn.bonus);
  // Once covered at the start of a contribution period, coverage continues to
  // period end even if wages cross the threshold (ESIC Reg. 4).
  const covered = employee.esi?.continueTillPeriodEnd || wages <= threshold;
  if (!covered) return { ...zero, wages };

  const employee_ = ceilRupee((wages * cfg.employeeRate) / 100);
  const employer = ceilRupee((wages * cfg.employerRate) / 100);
  return { applicable: true, wages, employee: employee_, employer, total: employee_ + employer };
}

export function computePt(earn, settings, month) {
  const cfg = settings.pt;
  if (!cfg.enabled) return 0;
  const slab = cfg.slabs.find((s) => earn.gross <= s.upto) || cfg.slabs[cfg.slabs.length - 1];
  if (month === 2 && slab.februaryAmount != null) return slab.februaryAmount;
  return slab.amount || 0;
}

export function computeLwf(settings, month) {
  const cfg = settings.lwf;
  if (!cfg.enabled || !cfg.months.includes(month)) return { employee: 0, employer: 0 };
  return { employee: cfg.employee, employer: cfg.employer };
}

/** Full payroll line for one employee for one month. */
export function computePayrollLine(employee, input, settings) {
  const { month, year, lopDays = 0 } = input;
  const earn = proratedEarnings(employee, month, year, lopDays, input);
  const pf = computePf(employee, earn, settings);
  const esi = computeEsi(employee, earn, settings);
  const pt = computePt(earn, settings, month);
  const lwf = computeLwf(settings, month);
  const tds = round(input.tds ?? employee.monthlyTds ?? 0);
  const advance = round(input.advance);
  const otherDeduction = round(input.otherDeduction);

  const totalDeductions = round(
    pf.employee + pf.vpf + esi.employee + pt + lwf.employee + tds + advance + otherDeduction
  );
  const netPay = round(earn.gross - totalDeductions);
  const ctc = round(earn.gross + pf.employerTotal + pf.edli + pf.admin + esi.employer + lwf.employer);

  return {
    employeeId: employee.id,
    code: employee.code,
    name: employee.name,
    month, year,
    earnings: earn,
    pf, esi, pt, lwf, tds, advance, otherDeduction,
    totalDeductions,
    netPay,
    ctc,
    ncpDays: earn.lopDays,
    esiDaysPaid: earn.paidDays,
    esiZeroReason: input.esiZeroReason || '0',
    lastWorkingDay: input.lastWorkingDay || '',
    paymentMode: employee.bank?.accountNumber ? 'BANK' : 'CASH',
  };
}

export function summarise(lines) {
  const add = (fn) => round(lines.reduce((s, l) => s + (fn(l) || 0), 0));
  return {
    headcount: lines.length,
    gross: add((l) => l.earnings.gross),
    net: add((l) => l.netPay),
    pfEmployee: add((l) => l.pf.employee + l.pf.vpf),
    pfEmployerEpf: add((l) => l.pf.employerEpf),
    pfEmployerEps: add((l) => l.pf.employerEps),
    pfEdli: add((l) => l.pf.edli),
    pfAdmin: add((l) => l.pf.admin),
    pfWages: add((l) => l.pf.pfWages),
    epsWages: add((l) => l.pf.epsWages),
    pfMembers: lines.filter((l) => l.pf.applicable).length,
    esiEmployee: add((l) => l.esi.employee),
    esiEmployer: add((l) => l.esi.employer),
    esiWages: add((l) => l.esi.wages),
    esiMembers: lines.filter((l) => l.esi.applicable).length,
    pt: add((l) => l.pt),
    lwf: add((l) => l.lwf.employee + l.lwf.employer),
    tds: add((l) => l.tds),
    ctc: add((l) => l.ctc),
  };
}

/** PF challan (A/c 1/2/10/21/22) totals, with the ₹75 admin minimum applied. */
export function pfChallan(summary, settings) {
  const ac1 = Math.round(summary.pfEmployee + summary.pfEmployerEpf);
  const ac10 = Math.round(summary.pfEmployerEps);
  const ac2 = Math.max(Math.round(summary.pfAdmin), summary.pfMembers ? settings.pf.adminMinimum : 0);
  const ac21 = Math.round(summary.pfEdli);
  const ac22 = 0; // EDLI admin charges abolished w.e.f. 01-04-2017
  return { ac1, ac2, ac10, ac21, ac22, total: ac1 + ac2 + ac10 + ac21 + ac22 };
}

export function esiChallan(summary) {
  const total = Math.ceil(summary.esiEmployee + summary.esiEmployer);
  return { employee: summary.esiEmployee, employer: summary.esiEmployer, total };
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function periodLabel(month, year) {
  return `${MONTHS[month - 1]} ${year}`;
}

/** Statutory due dates: PF ECR 15th, ESIC 15th, PT (MH) 21st, TDS 7th. */
export function dueDates(month, year) {
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  const d = (day) => new Date(ny, nm - 1, day).toLocaleDateString('en-IN');
  return { pf: d(15), esi: d(15), pt: d(21), tds: d(7) };
}
