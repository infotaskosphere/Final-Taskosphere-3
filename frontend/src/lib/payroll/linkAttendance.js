// linkAttendance.js — bridges the Payroll module to the real Attendance/Leave
// system (backend/server.py: GET /attendance/history) so LOP (loss-of-pay)
// days are calculated automatically instead of typed in by hand every run.
//
// Policy (tunable in Payroll → Settings → Attendance, see DEFAULT_SETTINGS.attendance
// in statutory.js):
//   • status === 'absent'                          → 1.0 LOP day
//   • half-day / early-leave record (is_half_day,
//     leave_type half_day_morning/afternoon)        → settings.attendance.halfDayAsLop (default 0.5)
//   • status === 'leave' (an approved leave applied
//     via /attendance/apply-leave)                  → 0 LOP by default; flip
//     settings.attendance.countLeaveAsLop to true if the firm has no separate
//     paid-leave-balance policy and wants every applied leave day to reduce pay.
//   • status === 'present' with no half-day/early-leave flag → 0 LOP
//   • A day with NO attendance record at all (holiday, weekly off, or simply
//     not yet reached) is NEVER counted as LOP — only an explicit 'absent'
//     record (or, if enabled, an explicit 'leave' record) reduces pay. This
//     deliberately avoids treating weekends/holidays as loss-of-pay just
//     because nobody punched in.
import api from '@/lib/api';

function inMonth(dateStr, month, year) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d.getMonth() + 1 === month && d.getFullYear() === year;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

const emptySummary = () => ({
  ok: false, presentDays: 0, absentDays: 0, leaveDays: 0, halfDays: 0, lopDays: 0, records: [],
});

/** Attendance-derived LOP for one employee (by their Users id) for one
 * calendar month. Never throws — falls back to a zeroed, ok:false summary
 * if the attendance API is unreachable or the user has no history, so a
 * backend hiccup never blocks payroll processing; the caller can still
 * type LOP in manually when ok is false. */
export async function attendanceSummaryForMonth(userId, month, year, settings) {
  const cfg = settings?.attendance || {};
  if (!userId) return emptySummary();
  try {
    const { data } = await api.get(`/attendance/history?user_id=${userId}`);
    const records = (Array.isArray(data) ? data : []).filter((r) => inMonth(r.date, month, year));

    let presentDays = 0, absentDays = 0, leaveDays = 0, halfDays = 0;
    records.forEach((r) => {
      const isHalf = !!r.is_half_day || r.leave_type === 'half_day_morning' || r.leave_type === 'half_day_afternoon';
      if (isHalf) halfDays += 1;
      if (r.status === 'absent') absentDays += 1;
      else if (r.status === 'leave') leaveDays += 1;
      else if (r.status === 'present' && !isHalf) presentDays += 1;
    });

    const halfDayWeight = cfg.halfDayAsLop ?? 0.5;
    const lopDays = round1(absentDays + halfDays * halfDayWeight + (cfg.countLeaveAsLop ? leaveDays : 0));

    return { ok: true, presentDays, absentDays, leaveDays, halfDays, lopDays, records };
  } catch {
    return emptySummary();
  }
}

/** Fetch attendance-derived LOP for many employees in parallel. Returns a
 * map keyed by employee (= Users) id → summary, for prefilling a payroll run. */
export async function attendanceSummaryForEmployees(userIds, month, year, settings) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const entries = await Promise.all(
    ids.map(async (id) => [id, await attendanceSummaryForMonth(id, month, year, settings)])
  );
  return Object.fromEntries(entries);
}
