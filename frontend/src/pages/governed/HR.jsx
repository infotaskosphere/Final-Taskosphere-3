// HR.jsx — People Matrix → HR, now backed by real Attendance data.
//
// This used to be a generic, empty GovernedListPage CRUD stub pointed at
// `/hr` — a collection nothing else in the app ever wrote to, so the page
// was always blank. HR information a firm actually needs (who's in, who's
// out, who's on leave, attendance trends) already lives in the Attendance
// system, exactly like Leave.jsx already does for the Leave module (see
// that file's header comment for the same rationale). This page follows
// the same pattern: it's a dedicated read view over
//   GET /attendance/staff-report?month=YYYY-MM   — per-employee monthly stats
//   GET /users                                    — the roster (dept, DOJ, role)
//   GET /attendance/leave-summary?month=YYYY-MM   — who applied leave, and why
//   GET /attendance/absent-summary?month=YYYY-MM  — who was absent, and when
// so People Matrix → HR now genuinely reflects Attendance instead of being
// a disconnected page.
//
// backend/governed_modules.py's generic `/hr` CRUD router is left in place
// (harmless, unused by this page) in case anything else depends on it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { format, subMonths, addMonths } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users, UserCheck, UserX, CalendarOff, ChevronLeft, ChevronRight,
  Loader2, Search, TrendingUp, Building2,
} from 'lucide-react';

const COLORS = {
  deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A',
  amber: '#F59E0B', red: '#EF4444', purple: '#8B5CF6',
};
const D = {
  bg: '#0f172a', card: '#1e293b', raised: '#263348', border: '#334155',
  text: '#f1f5f9', muted: '#94a3b8', dimmer: '#64748b',
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } },
};

function StatCard({ icon: Icon, label, value, accent, isDark, sublabel }) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="p-4 flex items-center gap-3 h-full" style={{
        backgroundColor: isDark ? D.card : '#ffffff',
        borderColor: isDark ? D.border : '#e2e8f0',
      }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: isDark ? `${accent}22` : `${accent}12` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-black leading-tight" style={{ color: isDark ? D.text : '#0f172a' }}>{value}</p>
          <p className="text-xs font-semibold truncate" style={{ color: isDark ? D.muted : '#64748b' }}>{label}</p>
          {sublabel && <p className="text-[10px] mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{sublabel}</p>}
        </div>
      </Card>
    </motion.div>
  );
}

export default function HR() {
  const { user } = useAuth();
  const isDark = useDark();
  const isAdmin = user?.role === 'admin';

  const [month, setMonth] = useState(new Date());
  const monthKey = format(month, 'yyyy-MM');

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [staffReport, setStaffReport] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState([]);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, staffRes, leaveRes] = await Promise.all([
        api.get('/users').catch(() => ({ data: [] })),
        api.get('/attendance/staff-report', { params: { month: monthKey } }).catch(() => ({ data: [] })),
        api.get('/attendance/leave-summary', { params: { month: monthKey } }).catch(() => ({ data: { data: [] } })),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setStaffReport(Array.isArray(staffRes.data) ? staffRes.data : []);
      setLeaveSummary(leaveRes.data?.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not load HR data from Attendance');
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Merge Users (roster: name, department, DOJ, role) with their
  // Attendance-derived stats for the selected month. Someone with no
  // attendance record yet this month (new hire, or simply no punches)
  // still shows up with zeroed stats rather than being dropped.
  const roster = useMemo(() => {
    const byId = Object.fromEntries(staffReport.map((s) => [s.user_id, s]));
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return users
      .filter((u) => u.is_active !== false)
      .map((u) => {
        const uid = u.id || u._id;
        const stat = byId[uid];
        const todayRecord = stat?.records?.find((r) => r.date === todayStr);
        return {
          id: uid,
          name: u.full_name || u.email || 'Unnamed',
          email: u.email || '',
          department: (u.departments || [])[0] || '—',
          role: u.role || 'staff',
          joiningDate: u.joining_date || '',
          daysPresent: stat?.days_present ?? 0,
          daysAbsent: stat?.days_absent ?? 0,
          lateDays: stat?.late_days ?? 0,
          earlyOutDays: stat?.early_out_days ?? 0,
          avgHoursPerDay: stat?.avg_hours_per_day ?? 0,
          expectedHours: stat?.expected_hours ?? 0,
          todayStatus: todayRecord?.status || 'no-record',
        };
      })
      .filter((r) => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()) || r.department.toLowerCase().includes(search.trim().toLowerCase()));
  }, [users, staffReport, search]);

  const todayStats = useMemo(() => {
    let present = 0, absent = 0;
    roster.forEach((r) => {
      if (r.todayStatus === 'present') present += 1;
      else if (r.todayStatus === 'absent') absent += 1;
    });
    return { present, absent, onLeave: leaveSummary.length, total: roster.length };
  }, [roster, leaveSummary]);

  const departments = useMemo(() => {
    const set = new Set(roster.map((r) => r.department).filter((d) => d && d !== '—'));
    return set.size;
  }, [roster]);

  const isCurrentMonth = monthKey === format(new Date(), 'yyyy-MM');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" style={{ color: isDark ? D.text : undefined }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Users className="w-6 h-6" style={{ color: COLORS.mediumBlue }} />
            HR
          </h1>
          <p className="text-sm mt-1" style={{ color: isDark ? D.muted : '#64748b' }}>
            Live headcount, attendance and leave — pulled straight from the Attendance system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className="h-9 px-3 flex items-center font-semibold">
            {format(month, 'MMMM yyyy')}
          </Badge>
          <Button variant="outline" size="icon" disabled={isCurrentMonth} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-5 gap-4" variants={containerVariants} initial="hidden" animate="visible">
        <StatCard icon={Users}       label="Employees"        value={todayStats.total}   accent={COLORS.mediumBlue}   isDark={isDark} />
        <StatCard icon={UserCheck}   label="Present Today"    value={todayStats.present} accent={COLORS.emeraldGreen} isDark={isDark} />
        <StatCard icon={UserX}       label="Absent Today"     value={todayStats.absent}  accent={COLORS.red}          isDark={isDark} />
        <StatCard icon={CalendarOff} label="On Leave (Month)" value={todayStats.onLeave} accent={COLORS.amber}        isDark={isDark} sublabel={format(month, 'MMMM')} />
        <StatCard icon={Building2}   label="Departments"      value={departments}        accent={COLORS.purple}       isDark={isDark} />
      </motion.div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-10" style={{ color: isDark ? D.muted : '#64748b' }}>
          <Loader2 className="w-5 h-5 animate-spin" /> Loading HR data from Attendance…
        </div>
      ) : (
        <>
          {/* Roster + attendance table */}
          <Card className="p-5" style={{ backgroundColor: isDark ? D.card : '#ffffff', borderColor: isDark ? D.border : '#e2e8f0' }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: COLORS.mediumBlue }} />
                Team Attendance — {format(month, 'MMMM yyyy')}
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: isDark ? D.dimmer : '#94a3b8' }} />
                <Input placeholder="Search name or department…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>

            {roster.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: isDark ? D.muted : '#94a3b8' }}>
                No employees found{search ? ' matching your search' : ''}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: isDark ? D.border : '#e2e8f0' }}>
                      {['Employee', 'Department', 'Present', 'Absent', 'Late', 'Early-out', 'Avg hrs/day', 'Today'].map((h) => (
                        <th key={h} className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wide"
                          style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((r) => (
                      <tr key={r.id} className="border-b last:border-0" style={{ borderColor: isDark ? D.border : '#f1f5f9' }}>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold" style={{ color: isDark ? D.text : '#1e293b' }}>{r.name}</p>
                          <p className="text-[11px]" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{r.email}</p>
                        </td>
                        <td className="py-2.5 px-3">{r.department}</td>
                        <td className="py-2.5 px-3 font-semibold" style={{ color: COLORS.emeraldGreen }}>{r.daysPresent}</td>
                        <td className="py-2.5 px-3 font-semibold" style={{ color: r.daysAbsent > 0 ? COLORS.red : undefined }}>{r.daysAbsent}</td>
                        <td className="py-2.5 px-3">{r.lateDays}</td>
                        <td className="py-2.5 px-3">{r.earlyOutDays}</td>
                        <td className="py-2.5 px-3">{r.avgHoursPerDay ? `${r.avgHoursPerDay}h` : '—'}</td>
                        <td className="py-2.5 px-3">
                          <Badge
                            style={{
                              backgroundColor: r.todayStatus === 'present' ? `${COLORS.emeraldGreen}18` : r.todayStatus === 'absent' ? `${COLORS.red}18` : `${D.dimmer}18`,
                              color: r.todayStatus === 'present' ? COLORS.emeraldGreen : r.todayStatus === 'absent' ? COLORS.red : (isDark ? D.dimmer : '#64748b'),
                            }}
                          >
                            {r.todayStatus === 'present' ? 'Present' : r.todayStatus === 'absent' ? 'Absent' : 'No record'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* On leave this month */}
          <Card className="p-5" style={{ backgroundColor: isDark ? D.card : '#ffffff', borderColor: isDark ? D.border : '#e2e8f0' }}>
            <h2 className="text-base font-bold flex items-center gap-2 mb-4">
              <CalendarOff className="w-4 h-4" style={{ color: COLORS.amber }} />
              On Leave — {format(month, 'MMMM yyyy')}
            </h2>
            {leaveSummary.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: isDark ? D.muted : '#94a3b8' }}>No leave applied this month.</p>
            ) : (
              <div className="space-y-2">
                {leaveSummary.map((item) => (
                  <div key={item.user_id} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ backgroundColor: isDark ? D.raised : '#fffbeb' }}>
                    <span className="text-sm font-semibold" style={{ color: isDark ? D.text : '#1e293b' }}>{item.user_name}</span>
                    <span className="text-xs font-bold" style={{ color: COLORS.amber }}>{item.leave_days} day{item.leave_days !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {!isAdmin && (
            <p className="text-xs text-center" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
              Showing attendance data for yourself and anyone shared with you. Admins see the full team.
            </p>
          )}
        </>
      )}
    </div>
  );
}
