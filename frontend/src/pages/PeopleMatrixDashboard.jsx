import React, { useEffect, useState } from 'react';
import { Users, Activity, Briefcase, BarChart3, UserCog } from 'lucide-react';
import api from '@/lib/api';
import useDark from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { HubBanner, StatCard, LinkCard, HUB_COLORS, extractCount } from '@/components/SectionHub.jsx';

// People Matrix — the standalone HRMS module: staff records, activity
// monitoring, hiring/interviews and workforce reports, all in one place
// instead of being scattered across the generic Admin group.
const MODULES = [
  {
    path: '/users', icon: Users, label: 'Users',
    description: 'Manage staff accounts, roles and permissions.',
    color: HUB_COLORS.mediumBlue, permission: 'can_view_user_page', countKey: 'users',
  },
  {
    path: '/staff-activity', icon: Activity, label: 'Staff Activity',
    description: 'Monitor login sessions, productivity and desktop activity.',
    color: HUB_COLORS.emeraldGreen, adminOnly: true, countKey: 'activityToday',
  },
  {
    path: '/interviews', icon: Briefcase, label: 'Employee Interviews',
    description: 'Track candidates, resumes and hiring pipeline status.',
    color: '#7C3AED', permission: 'can_view_interviews', countKey: 'interviews',
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
      const requests = {
        users:      api.get('/users', { _silent: true }),
        interviews: api.get('/interviews', { _silent: true }),
        activity:   api.get('/activity/summary', { params: { date_from: today, date_to: today + 'T23:59:59' }, _silent: true }),
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
        } else {
          next[key] = extractCount(data);
        }
      });
      setCounts(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (v) => (v === null || v === undefined ? '—' : v);

  const stats = [
    { label: 'Total Staff',   value: fmt(counts.users),         loading },
    { label: 'Active Today',  value: fmt(counts.activityToday), loading },
    { label: 'Candidates',    value: fmt(counts.interviews),    loading },
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard icon={Users}    label="Total Staff"  value={fmt(counts.users)}         loading={loading} color={HUB_COLORS.mediumBlue}   isDark={isDark} />
        <StatCard icon={Activity} label="Active Today"  value={fmt(counts.activityToday)} loading={loading} color={HUB_COLORS.emeraldGreen} isDark={isDark} />
        <StatCard icon={Briefcase} label="Candidates"   value={fmt(counts.interviews)}    loading={loading} color="#7C3AED"                  isDark={isDark} />
      </div>

      <h2 className={`text-sm font-extrabold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        People Matrix Modules
      </h2>
      {visibleModules.length === 0 ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You don't have access to any People Matrix modules yet. Contact your admin to request access.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((m) => (
            <LinkCard key={m.path} {...m} badge={m.countKey ? fmt(counts[m.countKey]) : undefined} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
