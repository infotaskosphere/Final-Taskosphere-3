import React, { useEffect, useState } from 'react';
import { Users, Activity, Briefcase, BarChart3, UserCog, CalendarDays, Wallet, IdCard } from 'lucide-react';
import api from '@/lib/api';
import useDark from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { HubBanner, StatCard, LinkCard, HUB_COLORS, extractCount } from '@/components/SectionHub.jsx';
import { listRuns } from '@/lib/payroll/store';

// People Matrix — the standalone HRMS module: staff records, activity
// monitoring, leave, payroll, HR and hiring/interviews and workforce
// reports, all in one place instead of being scattered across the
// generic Admin group.
const MODULES = [
  {
    path: '/users', icon: Users, label: 'Users',
    description: 'Manage staff accounts, roles and permissions.',
    color: HUB_COLORS.mediumBlue, permission: 'can_view_user_page', countKey: 'users',
  },
  {
    path: '/staff-activity', icon: Activity, label: 'Team Activity',
    description: 'Monitor login sessions, productivity and desktop activity.',
    color: HUB_COLORS.emeraldGreen, adminOnly: true, countKey: 'activityToday',
  },
  {
    path: '/leave', icon: CalendarDays, label: 'Leave',
    description: 'Applied leave, absences and the team leave calendar.',
    color: '#F59E0B', permission: 'can_view_leave', countKey: 'onLeaveToday',
  },
  {
    path: '/payroll', icon: Wallet, label: 'Payroll',
    description: 'Run monthly payroll, statutory deductions and payslips.',
    color: '#0EA5E9', permission: 'can_view_payroll', countKey: 'payrollRuns',
  },
  {
    path: '/hr', icon: IdCard, label: 'HR',
    description: 'Staff attendance trends and roster overview at a glance.',
    color: '#EC4899', permission: 'can_view_hr',
  },
  {
    path: '/recruitment', icon: Briefcase, label: 'Recruitment',
    description: 'Track candidates, resumes and the hiring pipeline end-to-end.',
    color: '#7C3AED', permission: 'can_view_recruitment', countKey: 'recruitment',
  },
  {
    path: '/reports', icon: BarChart3, label: 'Reports',
    description: 'Performance rankings, attendance and workforce reports.',
    color: '#F59E0B', adminOnly: true,
  },
];

export default function PeopleMatrixDashboard() {
  const isDark = useDark();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});

  const canSee = (m) => {
    if (m.adminOnly) return user?.role === 'admin';
    if (!m.permission) return true;
    if (user?.role === 'admin') return true;
    return hasPermission(m.permission);
  };
  const visibleModules = MODULES.filter(canSee);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const monthKey = today.slice(0, 7); // YYYY-MM
      const requests = {
        users:       api.get('/users', { _silent: true }),
        recruitment: api.get('/recruitment', { _silent: true }),
        activity:    api.get('/activity/summary', { params: { date_from: today, date_to: today + 'T23:59:59' }, _silent: true }),
        leave:       api.get('/attendance/leave-summary', { params: { month: monthKey }, _silent: true }),
      };
      const keys = Object.keys(requests);
      const results = await Promise.allSettled(keys.map((k) => requests[k]));
      if (cancelled) return;
      const next = {};
      results.forEach((r, i) => {
        const key = keys[i];
        if (r.status !== 'fulfilled') { next[key] = null; return; }
        const data = r.value?.data;
        if (key === 'activity') {
          // Count how many staff members had any recorded activity today.
          const list = Array.isArray(data) ? data : [];
          next.activityToday = list.filter((d) => (d.total_active_seconds || d.active_time || 0) > 0).length;
        } else if (key === 'leave') {
          // Per-user leave summary for the month; count how many of those
          // users have a leave record dated today.
          const list = Array.isArray(data?.data) ? data.data : [];
          next.onLeaveToday = list.filter((u) =>
            Array.isArray(u.records) && u.records.some((rec) => rec.date === today)
          ).length;
        } else {
          next[key] = extractCount(data);
        }
      });
      // Payroll runs are stored locally (offline-first payroll module) —
      // no network round trip needed, so this reads instantly.
      try {
        next.payrollRuns = (listRuns() || []).length;
      } catch {
        next.payrollRuns = null;
      }
      setCounts(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (v) => (v === null || v === undefined ? '—' : v);

  const stats = [
    { label: 'Total Staff',   value: fmt(counts.users),         loading },
    { label: 'Active Today',  value: fmt(counts.activityToday), loading },
    { label: 'On Leave Today', value: fmt(counts.onLeaveToday),  loading },
    { label: 'Candidates',    value: fmt(counts.recruitment),    loading },
  ];

  return (
    <div>
      <HubBanner
        icon={UserCog}
        eyebrow="People Matrix"
        title="People Matrix Dashboard"
        subtitle="Your HRMS at a glance — staff, activity, hiring and workforce reports in one unified module."
        isDark={isDark}
        stats={stats}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard icon={Users}       label="Total Staff"    value={fmt(counts.users)}         loading={loading} color={HUB_COLORS.mediumBlue}   isDark={isDark} />
        <StatCard icon={Activity}    label="Active Today"   value={fmt(counts.activityToday)} loading={loading} color={HUB_COLORS.emeraldGreen} isDark={isDark} />
        <StatCard icon={CalendarDays} label="On Leave Today" value={fmt(counts.onLeaveToday)}  loading={loading} color="#F59E0B"                 isDark={isDark} />
        <StatCard icon={Wallet}      label="Payroll Runs"   value={fmt(counts.payrollRuns)}   loading={loading} color="#0EA5E9"                 isDark={isDark} />
        <StatCard icon={Briefcase}   label="Candidates"     value={fmt(counts.recruitment)}   loading={loading} color="#7C3AED"                  isDark={isDark} />
      </div>

      <h2 className={`text-sm font-extrabold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        People Matrix Modules
      </h2>
      {visibleModules.length === 0 ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You don't have access to any People Matrix modules yet. Contact your admin to request access.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleModules.map((m) => (
            <LinkCard key={m.path} {...m} badge={m.countKey ? fmt(counts[m.countKey]) : undefined} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
