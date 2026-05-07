import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, getDaysInMonth } from 'date-fns';
import {
  X, Download, FileText, Users, Calendar,
  Loader2, CheckCircle2, BarChart3, Building2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/lib/api';

// ── Brand tokens (matches Attendance.jsx) ───────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber:        '#F59E0B',
  red:          '#EF4444',
  purple:       '#8B5CF6',
};
const D = {
  bg:     '#0f172a', card:   '#1e293b', raised: '#263348',
  border: '#334155', text:   '#f1f5f9', muted:  '#94a3b8', dimmer: '#64748b',
};

// ── Status definitions ───────────────────────────────────────────────────────
const STATUS = {
  present:  { code: 'P',   label: 'Present',   bg: '#16a34a', text: '#ffffff', border: '#14532d' },
  late:     { code: 'L',   label: 'Late',       bg: '#f59e0b', text: '#000000', border: '#92400e' },
  absent:   { code: 'A',   label: 'Absent',     bg: '#dc2626', text: '#ffffff', border: '#7f1d1d' },
  leave:    { code: 'CL',  label: 'Leave',      bg: '#ea580c', text: '#ffffff', border: '#7c2d12' },
  half_day: { code: 'HD',  label: 'Half Day',   bg: '#d97706', text: '#ffffff', border: '#92400e' },
  wfh:      { code: 'WFH', label: 'WFH',        bg: '#2563eb', text: '#ffffff', border: '#1e40af' },
  holiday:  { code: 'H',   label: 'Holiday',    bg: '#1e3a8a', text: '#ffffff', border: '#1e3a8a' },
  sunday:   { code: 'SU',  label: 'Sunday',     bg: '#64748b', text: '#ffffff', border: '#475569' },
  none:     { code: '—',   label: 'No Record',  bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' },
};

function resolveStatus(record, isHoliday, isSunday, isFuture) {
  if (isFuture)  return { ...STATUS.none, code: '' };
  if (isSunday)  return STATUS.sunday;
  if (isHoliday) return STATUS.holiday;
  if (!record)   return STATUS.none;
  if (record.status === 'absent')             return STATUS.absent;
  if (record.status === 'leave')             return STATUS.leave;
  if (record.is_half_day || record.status === 'half_day') return STATUS.half_day;
  if (record.status === 'wfh')               return STATUS.wfh;
  if (record.punch_in && record.is_late)     return STATUS.late;
  if (record.punch_in)                       return STATUS.present;
  return STATUS.none;
}

function fmtTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });
  } catch { return '—'; }
}
function fmtDur(mins) {
  if (!mins && mins !== 0) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── HTML report builders ─────────────────────────────────────────────────────
function buildMonthlyHTML(companyName, year, month, rows, dayHeaders, holidays) {
  const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' });
  const generated = format(new Date(), 'dd MMM yyyy, hh:mm a');

  const legendItems = [
    { code: 'P',   label: 'Present',  bg: '#16a34a', text: '#fff' },
    { code: 'L',   label: 'Late',     bg: '#f59e0b', text: '#000' },
    { code: 'A',   label: 'Absent',   bg: '#dc2626', text: '#fff' },
    { code: 'CL',  label: 'Leave',    bg: '#ea580c', text: '#fff' },
    { code: 'HD',  label: 'Half Day', bg: '#d97706', text: '#fff' },
    { code: 'WFH', label: 'WFH',      bg: '#2563eb', text: '#fff' },
    { code: 'H',   label: 'Holiday',  bg: '#1e3a8a', text: '#fff' },
    { code: 'SU',  label: 'Sunday',   bg: '#64748b', text: '#fff' },
    { code: '—',   label: 'No Data',  bg: '#f1f5f9', text: '#94a3b8' },
  ];

  const dayWeekLetters = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${companyName} — Attendance ${monthName} ${year}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; padding: 20px; color: #1e293b; }

    .wrapper { max-width: 100%; }

    /* ── HEADER ── */
    .report-header {
      background: linear-gradient(135deg, #0D3B66 0%, #1F6FB2 100%);
      color: #ffffff;
      padding: 22px 28px 20px;
      border-radius: 12px 12px 0 0;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .report-header::before {
      content: '';
      position: absolute;
      right: -40px; top: -40px;
      width: 160px; height: 160px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
    }
    .report-header h1 { font-size: 24px; font-weight: 900; letter-spacing: 0.3px; }
    .report-header h2 { font-size: 15px; font-weight: 600; opacity: 0.82; margin-top: 5px; letter-spacing: 0.5px; }
    .report-meta {
      display: inline-flex; gap: 18px; margin-top: 10px;
      background: rgba(255,255,255,0.12); border-radius: 8px; padding: 6px 16px;
      font-size: 11px; opacity: 0.88;
    }
    .report-meta span { display: flex; align-items: center; gap: 4px; }

    /* ── LEGEND ── */
    .legend-bar {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 12px 20px;
      background: #ffffff;
      border: 1px solid #e2e8f0; border-top: none;
      align-items: center;
    }
    .legend-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-right: 4px; }
    .legend-chip {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 20px; border-radius: 4px;
      font-size: 9px; font-weight: 800;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 600; color: #475569; }

    /* ── TABLE ── */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid #e2e8f0; border-top: none;
      border-radius: 0 0 12px 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }

    thead tr.hdr1 th {
      background: #0D3B66;
      color: #ffffff;
      padding: 9px 5px;
      text-align: center;
      font-size: 10px; font-weight: 700;
      border: 1px solid rgba(255,255,255,0.14);
      white-space: nowrap;
    }
    thead tr.hdr1 th.sun-col { background: #334155; }
    thead tr.hdr2 th {
      background: #1F6FB2;
      color: #ffffff;
      padding: 5px 3px;
      text-align: center;
      font-size: 9px; font-weight: 600;
      border: 1px solid rgba(255,255,255,0.14);
    }
    thead tr.hdr2 th.sun-col { background: #475569; }

    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr:hover td { background: #eff6ff; transition: background 0.15s; }
    tbody td {
      padding: 5px 4px;
      text-align: center;
      border: 1px solid #e2e8f0;
      font-size: 10.5px;
    }
    tbody td.td-left { text-align: left; padding-left: 10px; white-space: nowrap; }
    tbody td.sun-col { background: #fef9c3 !important; }

    .emp-id { font-family: 'Courier New', monospace; font-size: 9.5px; color: #64748b; }
    .emp-name { font-weight: 600; color: #0f172a; }
    .month-col { font-weight: 700; color: #1F6FB2; font-size: 10px; }

    .chip {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 20px; border-radius: 4px;
      font-size: 8.5px; font-weight: 800; letter-spacing: 0.2px;
    }

    .sum-present { color: #16a34a; font-weight: 800; font-size: 11px; }
    .sum-absent  { color: #dc2626; font-weight: 800; font-size: 11px; }
    .sum-late    { color: #d97706; font-weight: 800; font-size: 11px; }
    .sum-leave   { color: #ea580c; font-weight: 800; font-size: 11px; }

    /* ── TOTALS ROW ── */
    tfoot td {
      background: #0D3B66 !important;
      color: #ffffff;
      font-weight: 700;
      padding: 7px 5px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.18);
      font-size: 10px;
    }
    tfoot td.td-left { text-align: left; padding-left: 10px; }

    .footer { text-align: center; padding: 14px; font-size: 10px; color: #94a3b8; margin-top: 12px; }

    @media print {
      body { background: #fff; padding: 4px; }
      .report-header { border-radius: 0; }
      .table-wrap { border-radius: 0; box-shadow: none; }
      thead tr.hdr1 th, tfoot td { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #0D3B66 !important; }
      thead tr.hdr2 th { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #1F6FB2 !important; }
      .chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody td.sun-col { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fef9c3 !important; }
    }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="report-header">
    <h1>${companyName}</h1>
    <h2>Employee Attendance Sheet</h2>
    <div class="report-meta">
      <span>📅 ${monthName} ${year}</span>
      <span>👥 ${rows.length} Employee${rows.length !== 1 ? 's' : ''}</span>
      <span>🕐 Generated: ${generated}</span>
    </div>
  </div>

  <div class="legend-bar">
    <span class="legend-label">Legend:</span>
    ${legendItems.map(l => `
      <div class="legend-item">
        <span class="legend-chip" style="background:${l.bg};color:${l.text}">${l.code}</span>
        ${l.label}
      </div>`).join('')}
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr class="hdr1">
          <th>Emp. ID</th>
          <th>Employee Name</th>
          <th>Company</th>
          <th>Month</th>
          ${dayHeaders.map(({ day, isSunday }) =>
            `<th class="${isSunday ? 'sun-col' : ''}">${day}</th>`
          ).join('')}
          <th>P</th><th>A</th><th>L</th><th>Leave</th>
        </tr>
        <tr class="hdr2">
          <th colspan="4"></th>
          ${dayHeaders.map(({ day, isSunday }) => {
            const d = new Date(year, month - 1, day);
            return `<th class="${isSunday ? 'sun-col' : ''}">${dayWeekLetters[d.getDay()]}</th>`;
          }).join('')}
          <th colspan="4"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, idx) => `
          <tr>
            <td class="td-left emp-id">${row.user.id ? row.user.id.slice(0, 8).toUpperCase() : `EMP${String(idx + 1).padStart(3, '0')}`}</td>
            <td class="td-left emp-name">${row.user.full_name || 'Unknown'}</td>
            <td class="td-left" style="font-size:10px;color:#475569;">${row.user.company_name || '—'}</td>
            <td class="month-col">${monthName.substring(0, 3).toUpperCase()}</td>
            ${row.days.map((st, i) => {
              const isSun = dayHeaders[i].isSunday;
              const chip = st.code
                ? `<span class="chip" style="background:${st.bg};color:${st.text}">${st.code}</span>`
                : `<span style="color:#e2e8f0;font-size:9px">·</span>`;
              return `<td class="${isSun ? 'sun-col' : ''}" style="padding:3px 2px">${chip}</td>`;
            }).join('')}
            <td class="sum-present">${row.presentCount}</td>
            <td class="sum-absent">${row.absentCount}</td>
            <td class="sum-late">${row.lateCount}</td>
            <td class="sum-leave">${row.leaveCount}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td class="td-left" colspan="3">TOTALS</td>
          ${dayHeaders.map(({ day, isSunday }) => {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const count = rows.filter(r => r.days[day - 1]?.code === 'P' || r.days[day - 1]?.code === 'L').length;
            const isHol = holidays.some(h => h.date === dateStr);
            return `<td style="${isSunday ? 'background:#334155!important' : isHol ? 'background:#1e3a8a!important' : ''}">${isHol ? 'H' : (count > 0 ? count : '')}</td>`;
          }).join('')}
          <td>${rows.reduce((s, r) => s + r.presentCount, 0)}</td>
          <td>${rows.reduce((s, r) => s + r.absentCount, 0)}</td>
          <td>${rows.reduce((s, r) => s + r.lateCount, 0)}</td>
          <td>${rows.reduce((s, r) => s + r.leaveCount, 0)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <p class="footer">Taskosphere HR Management System &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Auto-generated · ${companyName}</p>
</div>
</body>
</html>`;
}

function buildDatewiseHTML(companyName, dateStr, rows) {
  const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const generated = format(new Date(), 'dd MMM yyyy, hh:mm a');
  const presentCount = rows.filter(r => r.status.code === 'P').length;
  const absentCount  = rows.filter(r => r.status.code === 'A').length;
  const lateCount    = rows.filter(r => r.status.code === 'L').length;
  const leaveCount   = rows.filter(r => ['CL','HD'].includes(r.status.code)).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${companyName} — Daily Attendance ${dateStr}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; padding: 20px; color: #1e293b; }
    .wrapper { max-width: 960px; margin: 0 auto; }

    .report-header {
      background: linear-gradient(135deg, #0D3B66 0%, #1F6FB2 100%);
      color: #fff; padding: 22px 28px 18px; border-radius: 12px 12px 0 0;
      text-align: center; position: relative; overflow: hidden;
    }
    .report-header::before {
      content: ''; position: absolute; right: -40px; top: -40px;
      width: 160px; height: 160px; border-radius: 50%;
      background: rgba(255,255,255,0.08);
    }
    .report-header h1 { font-size: 22px; font-weight: 900; }
    .report-header h2 { font-size: 14px; font-weight: 600; opacity: 0.82; margin-top: 4px; }
    .report-meta {
      display: inline-flex; gap: 16px; margin-top: 10px;
      background: rgba(255,255,255,0.12); border-radius: 8px;
      padding: 6px 16px; font-size: 11px; opacity: 0.9;
    }

    .summary-bar {
      display: flex; gap: 0;
      border: 1px solid #e2e8f0; border-top: none; background: #fff;
    }
    .summary-item {
      flex: 1; text-align: center; padding: 12px 8px;
      border-right: 1px solid #e2e8f0;
    }
    .summary-item:last-child { border-right: none; }
    .summary-item .val { font-size: 22px; font-weight: 900; line-height: 1; }
    .summary-item .lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; color: #94a3b8; }

    .table-wrap {
      overflow-x: auto; border: 1px solid #e2e8f0; border-top: none;
      border-radius: 0 0 12px 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    thead th {
      background: #0D3B66; color: #fff;
      padding: 10px 12px; text-align: left;
      font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
      border: 1px solid rgba(255,255,255,0.14); white-space: nowrap;
    }
    thead th.tc { text-align: center; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    tbody tr:hover td { background: #eff6ff; }
    tbody td { padding: 9px 12px; border: 1px solid #e2e8f0; vertical-align: middle; }
    tbody td.tc { text-align: center; }

    .num { color: #94a3b8; font-size: 10px; }
    .emp-id { font-family: 'Courier New', monospace; font-size: 10px; color: #64748b; }
    .emp-name { font-weight: 700; color: #0f172a; }
    .badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 6px;
      font-size: 10.5px; font-weight: 800;
    }
    .mono { font-family: 'Courier New', monospace; font-size: 11px; }
    .dur { font-weight: 700; color: #1F6FB2; }
    .late-tag { color: #d97706; font-size: 10px; font-weight: 600; }

    .footer { text-align: center; padding: 14px; font-size: 10px; color: #94a3b8; margin-top: 12px; }

    @media print {
      body { background: #fff; padding: 0; }
      .report-header { border-radius: 0; }
      .table-wrap { border-radius: 0; box-shadow: none; }
      thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #0D3B66 !important; }
      .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="report-header">
    <h1>${companyName}</h1>
    <h2>Daily Attendance Report</h2>
    <div class="report-meta">
      <span>📅 ${displayDate}</span>
      <span>👥 ${rows.length} Employee${rows.length !== 1 ? 's' : ''}</span>
      <span>🕐 Generated: ${generated}</span>
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <div class="val" style="color:#16a34a">${presentCount}</div>
      <div class="lbl">Present</div>
    </div>
    <div class="summary-item">
      <div class="val" style="color:#dc2626">${absentCount}</div>
      <div class="lbl">Absent</div>
    </div>
    <div class="summary-item">
      <div class="val" style="color:#f59e0b">${lateCount}</div>
      <div class="lbl">Late</div>
    </div>
    <div class="summary-item">
      <div class="val" style="color:#ea580c">${leaveCount}</div>
      <div class="lbl">On Leave</div>
    </div>
    <div class="summary-item">
      <div class="val" style="color:#1F6FB2">${rows.length}</div>
      <div class="lbl">Total</div>
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:32px">#</th>
          <th>Emp. ID</th>
          <th>Employee Name</th>
          <th>Company</th>
          <th class="tc">Status</th>
          <th class="tc">Punch In</th>
          <th class="tc">Punch Out</th>
          <th class="tc">Duration</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, idx) => `
          <tr>
            <td class="num">${idx + 1}</td>
            <td class="emp-id">${row.user.id ? row.user.id.slice(0, 8).toUpperCase() : `EMP${String(idx + 1).padStart(3, '0')}`}</td>
            <td class="emp-name">${row.user.full_name || 'Unknown'}</td>
            <td style="font-size:10px;color:#475569;">${row.user.company_name || '—'}</td>
            <td class="tc">
              <span class="badge" style="background:${row.status.bg};color:${row.status.text}">
                ${row.status.code}  ${row.status.label}
              </span>
            </td>
            <td class="tc mono">${row.punchIn}</td>
            <td class="tc mono">${row.punchOut}</td>
            <td class="tc dur">${row.duration}</td>
            <td>${row.isLate ? '<span class="late-tag">⏰ Late arrival</span>' : (row.adminNote ? `<span style="color:#64748b;font-size:10px">${row.adminNote}</span>` : '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <p class="footer">Taskosphere HR Management System &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; ${companyName}</p>
</div>
</body>
</html>`;
}

// ── Main Modal Component ─────────────────────────────────────────────────────
export default function AttendanceReportModal({
  isOpen, onClose, isDark,
  allUsers, holidays,
  isAdmin, currentUser,
  canViewOtherAttendance, // array of permitted user IDs (non-admins)
  companies, // array of company objects { id, name }
}) {
  const [reportType,        setReportType]        = useState('monthly');
  const [selectedMonth,     setSelectedMonth]     = useState(format(new Date(), 'yyyy-MM'));
  const [selectedDate,      setSelectedDate]      = useState(format(new Date(), 'yyyy-MM-dd'));
  const [employeeFilter,    setEmployeeFilter]    = useState('all');
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [companyName,       setCompanyName]       = useState('Your Company Name');
  const [generating,        setGenerating]        = useState(false);
  const [companyFilter,     setCompanyFilter]     = useState('all');

  const safeCompanies = useMemo(() => Array.isArray(companies) ? companies : [], [companies]);

  // Users this role can report on
  const baseUsers = useMemo(() => {
    if (isAdmin) return Array.isArray(allUsers) ? allUsers : [];
    const permIds = Array.isArray(canViewOtherAttendance) ? canViewOtherAttendance : [];
    return (Array.isArray(allUsers) ? allUsers : []).filter(
      u => u.id === currentUser?.id || permIds.includes(u.id)
    );
  }, [isAdmin, allUsers, canViewOtherAttendance, currentUser]);

  const availableUsers = useMemo(() => {
    if (companyFilter === 'all') return baseUsers;
    if (companyFilter === '__unassigned__') return baseUsers.filter(u => !u.company_id);
    return baseUsers.filter(u => u.company_id === companyFilter);
  }, [baseUsers, companyFilter]);

  const targetUsers = useMemo(() => {
    if (employeeFilter === 'all') return availableUsers;
    return availableUsers.filter(u => selectedEmployees.includes(u.id));
  }, [employeeFilter, availableUsers, selectedEmployees]);

  const safeHolidays = useMemo(() => Array.isArray(holidays) ? holidays : [], [holidays]);

  const toggleEmployee = (id) => {
    setSelectedEmployees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (employeeFilter === 'selected' && selectedEmployees.length === 0) {
      toast.error('Select at least one employee');
      return;
    }
    setGenerating(true);
    try {
      // ── Fetch fresh attendance data ──────────────────────────────────────
      let historyData = [];

      if (isAdmin && employeeFilter === 'all') {
        const res = await api.get('/attendance/history').catch(() => ({ data: [] }));
        historyData = res.data || [];
      } else if (isAdmin && employeeFilter === 'selected') {
        const results = await Promise.all(
          selectedEmployees.map(uid =>
            api.get(`/attendance/history?user_id=${uid}`)
              .then(r => r.data || [])
              .catch(() => [])
          )
        );
        historyData = results.flat();
      } else {
        // Non-admin: fetch each permitted user + self
        const uids = targetUsers.map(u => u.id);
        const results = await Promise.all(
          uids.map(uid =>
            api.get(`/attendance/history?user_id=${uid}`)
              .then(r => r.data || [])
              .catch(() => [])
          )
        );
        historyData = results.flat();
      }

      // ── Build userId → dateStr → record map ────────────────────────────
      const attByUser = {};
      historyData.forEach(rec => {
        const uid = rec.user_id;
        if (!uid) return;
        if (!attByUser[uid]) attByUser[uid] = {};
        attByUser[uid][rec.date] = rec;
      });

      const today = new Date(); today.setHours(0, 0, 0, 0);
      let htmlContent = '';
      let filename    = '';

      if (reportType === 'monthly') {
        const [yr, mo] = selectedMonth.split('-').map(Number);
        const daysInMonth = getDaysInMonth(new Date(yr, mo - 1));
        const dayHeaders  = Array.from({ length: daysInMonth }, (_, i) => {
          const day  = i + 1;
          const date = new Date(yr, mo - 1, day);
          return { day, isSunday: date.getDay() === 0 };
        });

        const rows = targetUsers.map(user => {
          const userAtt = attByUser[user.id] || {};
          const days = dayHeaders.map(({ day, isSunday }) => {
            const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
            const record  = userAtt[dateStr];
            const isHoliday = safeHolidays.some(h => h.date === dateStr);
            const isFuture  = new Date(yr, mo - 1, day) > today;
            return resolveStatus(record, isHoliday, isSunday, isFuture);
          });
          return {
            user,
            days,
            presentCount: days.filter(d => d.code === 'P').length,
            absentCount:  days.filter(d => d.code === 'A').length,
            lateCount:    days.filter(d => d.code === 'L').length,
            leaveCount:   days.filter(d => ['CL','HD'].includes(d.code)).length,
          };
        });

        htmlContent = buildMonthlyHTML(companyName.trim() || 'Company', yr, mo, rows, dayHeaders, safeHolidays);
        filename    = `Attendance_Monthly_${selectedMonth}_${employeeFilter === 'all' ? 'All' : 'Selected'}.html`;

      } else {
        const dateStr   = selectedDate;
        const selDateObj = new Date(dateStr + 'T00:00:00');
        const isHoliday  = safeHolidays.some(h => h.date === dateStr);
        const isFuture   = selDateObj > today;
        const isSunday   = selDateObj.getDay() === 0;

        const rows = targetUsers.map(user => {
          const record = (attByUser[user.id] || {})[dateStr];
          const status = resolveStatus(record, isHoliday, isSunday, isFuture);
          return {
            user,
            status,
            punchIn:   fmtTime(record?.punch_in),
            punchOut:  fmtTime(record?.punch_out),
            duration:  fmtDur(record?.duration_minutes),
            isLate:    record?.is_late || false,
            adminNote: record?.edit_note || record?.admin_note || '',
          };
        });

        htmlContent = buildDatewiseHTML(companyName.trim() || 'Company', dateStr, rows);
        filename    = `Attendance_Daily_${dateStr}_${employeeFilter === 'all' ? 'All' : 'Selected'}.html`;
      }

      // ── Download ─────────────────────────────────────────────────────────
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        reportType === 'monthly'
          ? 'Monthly report downloaded — open in browser · use Print → Save as PDF for PDF format'
          : 'Daily report downloaded',
        { duration: 6000 }
      );
      onClose();
    } catch (err) {
      console.error('Report generation error:', err);
      toast.error(err?.response?.data?.detail || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  // ── Input styles ────────────────────────────────────────────────────────────
  const inputBase = `w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all`;
  const inputStyle = {
    backgroundColor: isDark ? D.raised : '#ffffff',
    borderColor:     isDark ? D.border : '#d1d5db',
    color:           isDark ? D.text   : '#1e293b',
  };

  if (!isOpen) return null;

  const canGenerate = !generating && (employeeFilter === 'all' || selectedEmployees.length > 0);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{
          background: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(15,23,42,0.75)',
          backdropFilter: 'blur(12px)',
        }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          style={{
            backgroundColor: isDark ? D.card : '#ffffff',
            border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0',
          }}
          initial={{ scale: 0.93, y: 28 }}
          animate={{ scale: 1,    y: 0  }}
          exit={{    scale: 0.93, y: 28 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div
            className="px-7 py-5 flex items-center justify-between flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Generate Attendance Report</h2>
                <p className="text-blue-200 text-xs mt-0.5">
                  Monthly grid or date-wise summary · downloads as HTML (print to PDF)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all active:scale-90"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <div
            className="p-6 space-y-5 overflow-y-auto flex-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
          >

            {/* Company name */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: isDark ? D.muted : '#64748b' }}>
                Company Name <span className="normal-case font-normal">(shown in report header)</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Your Company Name"
                  className={`${inputBase} pl-10`}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Report type */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest mb-3 block" style={{ color: isDark ? D.muted : '#64748b' }}>
                Report Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    value: 'monthly',
                    label: 'Monthly Report',
                    icon:  Calendar,
                    desc:  'All days in a month per employee — Excel-style grid',
                  },
                  {
                    value: 'datewise',
                    label: 'Date-wise Report',
                    icon:  FileText,
                    desc:  'All employees for one date — punch-in/out detail',
                  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setReportType(opt.value)}
                    className="flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98]"
                    style={{
                      borderColor: reportType === opt.value
                        ? COLORS.mediumBlue
                        : isDark ? D.border : '#e2e8f0',
                      backgroundColor: reportType === opt.value
                        ? isDark ? 'rgba(31,111,178,0.18)' : '#eff6ff'
                        : isDark ? D.raised : '#f8fafc',
                      boxShadow: reportType === opt.value
                        ? `0 0 0 1.5px ${COLORS.mediumBlue}`
                        : 'none',
                    }}
                  >
                    <opt.icon
                      className="w-4 h-4"
                      style={{ color: reportType === opt.value ? COLORS.mediumBlue : '#94a3b8' }}
                    />
                    <div>
                      <p className="text-sm font-bold" style={{ color: isDark ? D.text : '#1e293b' }}>
                        {opt.label}
                      </p>
                      <p className="text-xs leading-snug mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: isDark ? D.muted : '#64748b' }}>
                {reportType === 'monthly' ? 'Month & Year' : 'Select Date'}
              </label>
              {reportType === 'monthly' ? (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className={inputBase}
                  style={inputStyle}
                />
              ) : (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className={inputBase}
                  style={inputStyle}
                />
              )}
            </div>

            {/* Company filter */}
            {safeCompanies.length > 0 && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{ color: isDark ? D.muted : '#64748b' }}>
                  Filter by Company
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <select
                    value={companyFilter}
                    onChange={e => { setCompanyFilter(e.target.value); setSelectedEmployees([]); }}
                    className={`${inputBase} pl-10 pr-10 appearance-none`}
                    style={inputStyle}
                  >
                    <option value="all">All Companies ({baseUsers.length} employees)</option>
                    {safeCompanies.map(co => {
                      const count = baseUsers.filter(u => u.company_id === co.id).length;
                      return <option key={co.id} value={co.id}>{co.name} ({count})</option>;
                    })}
                    {baseUsers.some(u => !u.company_id) && (
                      <option value="__unassigned__">— No Company ({baseUsers.filter(u => !u.company_id).length})</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Employee filter */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest mb-3 block" style={{ color: isDark ? D.muted : '#64748b' }}>
                Employees
              </label>
              <div className="flex gap-3 mb-3">
                {[
                  { value: 'all',      label: `All Employees (${availableUsers.length})` },
                  { value: 'selected', label: 'Select Specific' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setEmployeeFilter(opt.value)}
                    className="flex-1 py-2.5 px-4 rounded-xl border-2 text-sm font-semibold transition-all"
                    style={{
                      borderColor: employeeFilter === opt.value
                        ? COLORS.emeraldGreen
                        : isDark ? D.border : '#e2e8f0',
                      backgroundColor: employeeFilter === opt.value
                        ? isDark ? 'rgba(31,175,90,0.15)' : '#f0fdf4'
                        : isDark ? D.raised : '#f8fafc',
                      color: employeeFilter === opt.value
                        ? COLORS.emeraldGreen
                        : isDark ? D.muted : '#64748b',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {employeeFilter === 'selected' && (
                <div
                  className="flex flex-wrap gap-2 p-3 rounded-xl border"
                  style={{
                    borderColor: isDark ? D.border : '#e2e8f0',
                    backgroundColor: isDark ? D.raised : '#f8fafc',
                  }}
                >
                  {availableUsers.length === 0 ? (
                    <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                      No employees available
                    </p>
                  ) : (
                    availableUsers.map(u => {
                      const isSel = selectedEmployees.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleEmployee(u.id)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all active:scale-95"
                          style={
                            isSel
                              ? { background: COLORS.mediumBlue, color: '#ffffff', borderColor: COLORS.mediumBlue }
                              : isDark
                                ? { background: '#1e293b', color: '#94a3b8', borderColor: '#334155' }
                                : { background: '#ffffff', color: '#475569', borderColor: '#e2e8f0' }
                          }
                        >
                          {isSel ? '✓ ' : ''}{u.full_name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Preview info box */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: isDark ? D.border : '#e2e8f0' }}
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: isDark ? D.raised : '#f8fafc' }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: isDark ? D.muted : '#64748b' }}>
                  Report Preview
                </span>
              </div>
              <div className="px-4 py-3 text-sm space-y-1" style={{ color: isDark ? D.muted : '#475569' }}>
                <p>
                  <strong style={{ color: isDark ? D.text : '#0f172a' }}>
                    {reportType === 'monthly' ? 'Monthly Spreadsheet' : 'Daily Summary'}
                  </strong>
                  {' for '}
                  <strong style={{ color: COLORS.mediumBlue }}>
                    {employeeFilter === 'all'
                      ? `all ${availableUsers.length} employees`
                      : `${selectedEmployees.length} selected`}
                  </strong>
                  {' · '}
                  <strong style={{ color: isDark ? D.text : '#0f172a' }}>
                    {reportType === 'monthly'
                      ? new Date(selectedMonth + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })
                      : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                        })}
                  </strong>
                </p>
                <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                  Downloaded as HTML · Open in Chrome → Print → Save as PDF for high-quality PDF export
                </p>
              </div>
            </div>

          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div
            className="px-6 py-4 flex items-center justify-between flex-shrink-0 border-t"
            style={{
              borderColor: isDark ? D.border : '#e2e8f0',
              backgroundColor: isDark ? D.raised : '#f8fafc',
            }}
          >
            <p className="text-xs" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
              {employeeFilter === 'selected' && selectedEmployees.length === 0
                ? '⚠ Select at least one employee'
                : `${targetUsers.length} employee(s) included`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={onClose}
                className="font-semibold rounded-xl text-sm h-9"
                style={{ color: isDark ? D.muted : undefined }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="font-semibold text-white rounded-xl px-5 h-9 flex items-center gap-2"
                style={{ backgroundColor: COLORS.deepBlue, opacity: !canGenerate ? 0.55 : 1 }}
              >
                {generating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                  : <><Download className="w-3.5 h-3.5" />Download Report</>}
              </Button>
            </div>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
