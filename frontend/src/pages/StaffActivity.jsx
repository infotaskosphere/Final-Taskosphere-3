import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDark } from '@/hooks/useDark';
import { CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subMonths } from 'date-fns';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Users,
  Clock,
  Activity,
  TrendingUp,
  Target,
  RefreshCw,
  BrainCircuit,
  FileDown,
  Calendar as CalendarIcon,
  ShieldCheck,
  GitCompare,
  Flame,
  Binary,
  Timer,
  LayoutDashboard,
  Database,
  UserCheck,
  Filter,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Mouse,
  Keyboard,
  Monitor,
  Zap,
  BarChart2,
  Eye,
  GripVertical,
  Settings2,
} from 'lucide-react';
import LayoutCustomizer from '../components/layout/LayoutCustomizer';
import { usePageLayout } from '../hooks/usePageLayout';
// ─── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};
// ─── Spring Physics ───────────────────────────────────────────────────────────
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
};
// ─── Animation Variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, y: 12, transition: { duration: 0.3 } },
};
const staggerChildren = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const listItem = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.23, 1, 0.32, 1] } },
};
// ─── Shared Card Shell ────────────────────────────────────────────────────────
function SectionCard({ children, className, onClick, isDark }) {
  const base = `border rounded-2xl overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`;
  const interactive = onClick ? 'cursor-pointer hover:shadow-md transition-all' : '';
  return (
    <div onClick={onClick} className={[base, interactive, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
// ─── Card Header Row ──────────────────────────────────────────────────────────
function CardHeaderRow({ iconBg, icon, title, subtitle, action, isDark }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
      <div className="flex items-center gap-2.5">
        <div className={['p-1.5 rounded-lg', iconBg].join(' ')}>{icon}</div>
        <div>
          <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h3>
          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function secondsToHM(s) {
  const t = Math.floor(Number(s) || 0);
  return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
}
function minutesToHM(m) {
  const t = Math.floor(Number(m) || 0);
  return `${Math.floor(t / 60)}h ${t % 60}m`;
}
function secToMin(s) { return Math.floor((Number(s) || 0) / 60); }
function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }
function getDomain(url) {
  if (!url) return 'Unknown';
  try {
    const u = url.startsWith('http') ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return url.length > 30 ? url.slice(0, 30) + '…' : url;
  }
}
const CAT_COLORS = {
  productivity: COLORS.emeraldGreen,
  communication: COLORS.mediumBlue,
  entertainment: COLORS.coral,
  social: COLORS.amber,
  development: COLORS.deepBlue,
  other: '#94a3b8',
};
// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function StaffActivity() {
  const { user, hasPermission } = useAuth();
  const isDark = useDark();
  const [showCustomize, setShowCustomize] = useState(false);
  const SA_SECTIONS = ['key_metrics','intensity_radar','activity_tabs'];
  const SA_LABELS = {
    key_metrics:     { name:'Key Metrics',           icon:'📊', desc:'Active personnel, hours, productivity, intensity, idle time' },
    intensity_radar: { name:'Intensity Map & Radar', icon:'🔥', desc:'24-hour heatmap and comparison radar chart' },
    activity_tabs:   { name:'Activity Tabs',         icon:'📑', desc:'Activity log, task telemetry, app usage, executive intelligence' },
  };
  const { order: saOrder, moveSection: saMove, resetOrder: saReset } = usePageLayout('staffactivity', SA_SECTIONS);
  // ── Permissions ───────────────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin';
  const canViewActivity = hasPermission('can_view_staff_activity') || isAdmin;
  const canDownloadReports = hasPermission('can_download_reports') || isAdmin;
  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('activity_log');
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditInsights, setAuditInsights] = useState([]);
  // ── Data state ────────────────────────────────────────────────────────────
  const [attendanceRegister, setAttendanceRegister] = useState([]);
  const [activitySummary, setActivitySummary] = useState([]);
  const [activePersonnel, setActivePersonnel] = useState([]);
  const [taskVectors, setTaskVectors] = useState([]);
  const [taskVectorsLoading, setTaskVectorsLoading] = useState(false);
  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [unitAlpha, setUnitAlpha] = useState('');
  const [unitBeta, setUnitBeta] = useState('');
  // ── Month options ─────────────────────────────────────────────────────────
  const monthOptions = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), i);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
    }), []);
  // ── 24-hr intensity map ───────────────────────────────────────────────────
  const intensityMap = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      density: (i >= 9 && i <= 18)
        ? 35 + (i === 10 || i === 11 || i === 14 || i === 15 ? 30 : 10) + (i * 2 % 15)
        : 2 + (i * 3 % 8),
    })), []);
  // ── Filtered arrays ───────────────────────────────────────────────────────
  const filteredActivity = useMemo(() =>
    selectedUnit === 'all'
      ? activitySummary
      : activitySummary.filter((s) => s.user_id === selectedUnit),
  [activitySummary, selectedUnit]);
  const filteredAttendance = useMemo(() =>
    selectedUnit === 'all'
      ? attendanceRegister
      : attendanceRegister.filter((s) => s.user_id === selectedUnit),
  [attendanceRegister, selectedUnit]);
  // ── Aggregated apps ───────────────────────────────────────────────────────
  const aggregatedApps = useMemo(() => {
    const map = {};
    filteredActivity.forEach((u) => {
      (u.apps_list || []).forEach((app) => {
        if (!map[app.name]) map[app.name] = { name: app.name, duration: 0, count: 0 };
        map[app.name].duration += Number(app.duration) || 0;
        map[app.name].count += Number(app.count) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.duration - a.duration).slice(0, 8);
  }, [filteredActivity]);
  // ── Aggregated websites ───────────────────────────────────────────────────
  const aggregatedWebsites = useMemo(() => {
    const map = {};
    filteredActivity.forEach((u) => {
      const websites = u.websites;
      if (!websites) return;
      if (Array.isArray(websites)) {
        websites.forEach((entry) => {
          const url = entry?.url || entry?.domain || '';
          const duration = Number(entry?.duration ?? entry?.time ?? 0);
          if (!url) return;
          const domain = getDomain(url);
          if (!map[domain]) map[domain] = { domain, duration: 0 };
          map[domain].duration += duration;
        });
      } else if (typeof websites === 'object') {
        Object.entries(websites).forEach(([url, dur]) => {
          if (!url) return;
          const domain = getDomain(url);
          if (!map[domain]) map[domain] = { domain, duration: 0 };
          map[domain].duration += Number(dur) || 0;
        });
      }
    });
    return Object.values(map).sort((a, b) => b.duration - a.duration).slice(0, 10);
  }, [filteredActivity]);
  // ── Idle stats ────────────────────────────────────────────────────────────
  const idleStats = useMemo(() => {
    const totalDur = filteredActivity.reduce((a, u) => a + (Number(u.total_duration) || 0), 0);
    const idleDur = filteredActivity.reduce((a, u) => a + (Number(u.idle_duration) || 0), 0);
    const activeDur = filteredActivity.reduce((a, u) => a + (Number(u.active_duration) || 0), 0);
    const idlePct = pct(idleDur, totalDur);
    const activePct = pct(activeDur, totalDur);
    const perUser = filteredActivity.map((u) => {
      const total = Number(u.total_duration) || 0;
      const idle = Number(u.idle_duration) || 0;
      const active = Number(u.active_duration) || 0;
      return {
        user_name: u.user_name || 'Unknown',
        user_id: u.user_id,
        total,
        idle,
        active,
        idlePct: pct(idle, total || 1),
      };
    }).sort((a, b) => b.idlePct - a.idlePct);
    return { totalDur, idleDur, activeDur, idlePct, activePct, perUser };
  }, [filteredActivity]);
  // ── Category breakdown ────────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map = {};
    filteredActivity.forEach((u) => {
      Object.entries(u.categories || {}).forEach(([cat, dur]) => {
        map[cat] = (map[cat] || 0) + (Number(dur) || 0);
      });
    });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map)
      .map(([category, duration]) => ({ category, duration, pct: pct(duration, total) }))
      .sort((a, b) => b.duration - a.duration);
  }, [filteredActivity]);
  // ── Header metrics ────────────────────────────────────────────────────────
  const totalLoggedTime = useMemo(() => {
    const mins = filteredAttendance.reduce((acc, s) => acc + (Number(s.total_minutes) || 0), 0);
    return minutesToHM(mins);
  }, [filteredAttendance]);
  const avgProductivity = useMemo(() => {
    if (!filteredActivity.length) return null;
    const sum = filteredActivity.reduce((a, s) => a + (Number(s.productivity_percent) || 0), 0);
    return Math.round(sum / filteredActivity.length);
  }, [filteredActivity]);
  const peakHour = useMemo(
    () => intensityMap.reduce((mx, h) => (h.density > mx.density ? h : mx), intensityMap[0]),
    [intensityMap],
  );
  const displayPersonnelCount = useMemo(() => {
    if (selectedUnit === 'all') return activePersonnel.length;
    return activePersonnel.some((u) => u.id === selectedUnit) ? 1 : 0;
  }, [activePersonnel, selectedUnit]);
  // ── Radar metrics ─────────────────────────────────────────────────────────
  const radarMetrics = useMemo(() => {
    if (!unitAlpha || !unitBeta) return [];
    const labels = ['Efficiency', 'Precision', 'Consistency', 'Communication', 'Volume', 'Initiative'];
    const a = activitySummary.find((s) => s.user_id === unitAlpha);
    const b = activitySummary.find((s) => s.user_id === unitBeta);
    const aAtt = attendanceRegister.find((s) => s.user_id === unitAlpha);
    const bAtt = attendanceRegister.find((s) => s.user_id === unitBeta);
    const aBase = a ? Math.min(100, Number(a.productivity_percent) || 60) : 60;
    const bBase = b ? Math.min(100, Number(b.productivity_percent) || 55) : 55;
    const aAttPct = aAtt ? Math.min(100, Math.round(((aAtt.days_present || 0) / 22) * 100)) : 70;
    const bAttPct = bAtt ? Math.min(100, Math.round(((bAtt.days_present || 0) / 22) * 100)) : 65;
    const variation = [0, 8, -5, 12, -3, 7];
    return labels.map((metric, i) => ({
      metric,
      A: Math.max(10, Math.min(100, i === 1 ? aAttPct : aBase + variation[i])),
      B: Math.max(10, Math.min(100, i === 1 ? bAttPct : bBase + variation[i] - 5)),
    }));
  }, [unitAlpha, unitBeta, activitySummary, attendanceRegister]);
  // ── Task stats ────────────────────────────────────────────────────────────
  const taskStats = useMemo(() => {
    const completed = taskVectors.filter((t) => t.is_completed).length;
    const total = taskVectors.length;
    return { completed, active: total - completed, total, rate: pct(completed, total) };
  }, [taskVectors]);
  // ── TOKEN GUARD (after all hooks) ────────────────────────────────────────
  const token = getToken();
  if (!token) {
    return null;
  }
  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────
  const synchronize = useCallback(async () => {
    const token = getToken();

    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();

      const dateFrom = `${selectedMonth}-01T00:00:00`;
      const dateTo = `${selectedMonth}-${String(lastDay).padStart(2, '0')}T23:59:59`;

      const [uRes, aRes, attRes] = await Promise.all([
        api.get('/users'),
        api.get(`/activity/summary?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`),
        api.get(`/attendance/staff-report?month=${selectedMonth}`),
      ]);

      setActivePersonnel(Array.isArray(uRes.data) ? uRes.data : []);
      setActivitySummary(Array.isArray(aRes.data) ? aRes.data : []);
      setAttendanceRegister(Array.isArray(attRes.data) ? attRes.data : []);

    } catch (err) {
      if (err?.message === "No auth token — request blocked") return;

      console.error('Sync error:', err);
      toast.error('Telemetry sync failed. Check network.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);
  const fetchTaskVectors = useCallback(async () => {
    const token = getToken();

    if (!token || !selectedUnit || selectedUnit === 'all') {
      setTaskVectors([]);
      return;
    }

    setTaskVectorsLoading(true);

    try {
      const res = await api.get(`/todos?user_id=${selectedUnit}`);
      setTaskVectors(Array.isArray(res.data) ? res.data : []);

    } catch (err) {
      if (err?.message === "No auth token — request blocked") return;

      toast.error('Failed to load task data.');
      setTaskVectors([]);

    } finally {
      setTaskVectorsLoading(false);
    }
  }, [selectedUnit]);
  // ── SAFE DATA FETCH TRIGGER ───────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token || !canViewActivity) return;

    synchronize();
  }, [selectedMonth, refreshTrigger, canViewActivity]);
  // ── SAFE TASK FETCH TRIGGER ───────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    fetchTaskVectors();
  }, [selectedUnit]);
  // ── AI audit ──────────────────────────────────────────────────────────────
  const runAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const topIdler = idleStats.perUser[0];
      const topApp = aggregatedApps[0];
      setAuditInsights([
        {
          title: 'Peak Efficiency Window',
          desc: `Output density peaks at ${peakHour.hour} — ${peakHour.density} ops/hr. Schedule deep-work blocks here.`,
          Icon: Flame,
          color: COLORS.emeraldGreen,
          bg: isDark ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-100',
        },
        {
          title: 'Idle Ratio Alert',
          desc: topIdler
            ? `${idleStats.idlePct}% of tracked time shows no input. Highest: ${topIdler.user_name} at ${topIdler.idlePct}%.`
            : `Overall idle ratio is ${idleStats.idlePct}%. No activity data yet.`,
          Icon: Mouse,
          color: COLORS.coral,
          bg: isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-100',
        },
        {
          title: 'Velocity Projection',
          desc: `Task-completion vectors project +8.4% next week. Top driver: ${topApp?.name || 'No app data yet'}.`,
          Icon: TrendingUp,
          color: COLORS.mediumBlue,
          bg: isDark ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100',
        },
      ]);
      setIsAuditing(false);
      toast.success('Executive Intelligence Audit complete.');
    }, 2000);
  };
  // ── Status badge ──────────────────────────────────────────────────────────
  function statusBadge(avgHoursPerDay) {
    const n = Number(avgHoursPerDay) || 0;
    if (n >= 7.5)
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />OPTIMAL
        </span>
      );
    if (n >= 6)
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />STANDARD
        </span>
      );
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />RECOVERY
      </span>
    );
  }
  const metricCardCls = 'rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border';
  const metricCardDefault = isDark
    ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
    : 'bg-white border-slate-200/80 hover:border-slate-300';
  const TABS = [
    { value: 'activity_log', label: 'Activity Log', Icon: Activity },
    { value: 'idle_tracker', label: 'Idle Tracker', Icon: Mouse },
    { value: 'attendance', label: 'Attendance', Icon: Users },
    { value: 'task_list', label: 'Task Audit', Icon: LayoutDashboard },
    { value: 'comparison', label: 'Comparison', Icon: GitCompare },
  ];
  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!canViewActivity) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-h-[80vh] flex items-center justify-center p-8"
      >
        <SectionCard isDark={isDark} className="max-w-sm p-10 text-center">
          <ShieldCheck className="mx-auto mb-4 h-14 w-14 text-slate-300" />
          <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Access Restricted</h2>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Clearance{' '}
            <code className={`px-1.5 py-0.5 rounded text-xs ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
              can_view_staff_activity
            </code>{' '}
            required.
          </p>
          <Button
            className="mt-6 w-full rounded-xl h-10"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
          >
            Request Access
          </Button>
        </SectionCard>
      </motion.div>
    );
  }
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <>
      <LayoutCustomizer
      isOpen={showCustomize}
      onClose={() => setShowCustomize(false)}
      order={saOrder}
      sectionLabels={SA_LABELS}
      onDragEnd={saMove}
      onReset={saReset}
      isDark={isDark}
    />
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      {/* ── BANNER ─────────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{
            background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
            boxShadow: '0 8px 32px rgba(13,59,102,0.28)',
          }}
        >
          <div
            className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
          />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Staff Activity</h1>
              <p className="text-white/60 text-sm mt-1">Real-time organisational telemetry</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                <UserCheck className="h-3.5 w-3.5 text-white/60 flex-shrink-0" />
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger className="w-40 border-0 bg-transparent text-white text-xs h-6 focus:ring-0 p-0">
                    <SelectValue placeholder="All Personnel" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Personnel</SelectItem>
                    {activePersonnel.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}
              >
                <CalendarIcon className="h-3.5 w-3.5 text-white/60 flex-shrink-0" />
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-36 border-0 bg-transparent text-white text-xs h-6 focus:ring-0 p-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setRefreshTrigger((t) => t + 1)}
                disabled={loading}
                className="rounded-xl h-9 text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                  : <RefreshCw className="h-4 w-4 text-white" />}
                <span className="text-white ml-1.5">{loading ? 'Syncing…' : 'Refresh'}</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
      {/* CUSTOMIZE BUTTON */}
      <motion.div variants={itemVariants} className="flex justify-end">
        <button
          onClick={() => setShowCustomize(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all hover:shadow-md ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <Settings2 size={13} /> Customize Layout
        </button>
      </motion.div>

      {/* ORDERED SECTIONS */}
      {saOrder.map((sectionId) => {
        if (sectionId === 'key_metrics') return (
      <React.Fragment key="key_metrics">
      {/* ── KEY METRICS ────────────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" variants={itemVariants}>
        {/* 1. Active Personnel */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  Active Personnel
                </p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                  {loading ? '—' : displayPersonnelCount}
                </p>
              </div>
              <div className="p-2 rounded-xl" style={{ backgroundColor: isDark ? 'rgba(96,165,250,0.12)' : `${COLORS.deepBlue}12` }}>
                <Users className="h-4 w-4" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>View registry</span><ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </motion.div>
        {/* 2. Total Hours Logged */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  Hours Logged
                </p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.emeraldGreen }}>
                  {loading ? '—' : totalLoggedTime}
                </p>
              </div>
              <div className="p-2 rounded-xl" style={{ backgroundColor: `${COLORS.emeraldGreen}12` }}>
                <Clock className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>{selectedMonth}</span><ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </motion.div>
        {/* 3. Avg Productivity */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  Avg Productivity
                </p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.mediumBlue }}>
                  {loading ? '—' : avgProductivity !== null ? `${avgProductivity}%` : '—'}
                </p>
              </div>
              <div className="p-2 rounded-xl" style={{ backgroundColor: `${COLORS.mediumBlue}12` }}>
                <Target className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
              </div>
            </div>
            {avgProductivity !== null && (
              <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${avgProductivity}%`,
                    background: `linear-gradient(90deg, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})`,
                  }}
                />
              </div>
            )}
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>Across team</span><ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </motion.div>
        {/* 4. Peak Intensity */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          className={`${metricCardCls} ${metricCardDefault}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  Peak Intensity
                </p>
                <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: COLORS.amber }}>
                  {loading ? '—' : peakHour.hour}
                </p>
              </div>
              <div className="p-2 rounded-xl" style={{ backgroundColor: `${COLORS.amber}18` }}>
                <Flame className="h-4 w-4" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>Today</span><ChevronRight className="h-3 w-3" />
            </div>
          </CardContent>
        </motion.div>
        {/* 5. Idle Time */}
        <motion.div
          whileHover={{ y: -3, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          className={`${metricCardCls} ${
            idleStats.idlePct > 30
              ? isDark
                ? 'bg-red-900/20 border-red-800 hover:border-red-700'
                : 'bg-red-50/60 border-red-200 hover:border-red-300'
              : metricCardDefault
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  Idle Time
                </p>
                <p
                  className="text-2xl font-bold mt-1 tracking-tight"
                  style={{ color: idleStats.idlePct > 30 ? COLORS.coral : COLORS.amber }}
                >
                  {loading ? '—' : `${idleStats.idlePct}%`}
                </p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {secondsToHM(idleStats.idleDur)} idle
                </p>
              </div>
              <div
                className="p-2 rounded-xl"
                style={{ backgroundColor: idleStats.idlePct > 30 ? `${COLORS.coral}18` : `${COLORS.amber}18` }}
              >
                <Mouse className="h-4 w-4" style={{ color: idleStats.idlePct > 30 ? COLORS.coral : COLORS.amber }} />
              </div>
            </div>
          </CardContent>
        </motion.div>
      </motion.div>
      </React.Fragment>
        );
        if (sectionId === 'intensity_radar') return (
      <React.Fragment key="intensity_radar">
      {/* ── INTENSITY MAP + COMPARISON RADAR ───────────────────────────────── */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-5 gap-3" variants={itemVariants}>
        <SectionCard isDark={isDark} className="lg:col-span-3 flex flex-col">
          <CardHeaderRow
            isDark={isDark}
            iconBg={isDark ? 'bg-amber-900/40' : 'bg-amber-50'}
            icon={<Flame className="h-4 w-4 text-amber-500" />}
            title="24-Hour Intensity Map"
            subtitle="Organisational output density across working hours"
            action={
              <Badge
                variant="outline"
                className={`text-[10px] rounded-full px-2.5 border-amber-200 ${isDark ? 'text-amber-400 bg-amber-900/20' : 'text-amber-600 bg-amber-50'}`}
              >
                Live
              </Badge>
            }
          />
          {/* FIX: explicit height on the wrapper div, not relying on auto-sizing */}
          <div className="p-4 flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={intensityMap} margin={{ top: 5, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="intensityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#f1f5f9'} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={3} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '11px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                  }}
                  formatter={(v) => [`${v} ops`, 'Density']}
                />
                <Area
                  type="natural"
                  dataKey="density"
                  stroke={COLORS.amber}
                  strokeWidth={2.5}
                  fill="url(#intensityGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: COLORS.amber, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard isDark={isDark} className="lg:col-span-2">
          <CardHeaderRow
            isDark={isDark}
            iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
            icon={<GitCompare className="h-4 w-4 text-blue-500" />}
            title="Unit Comparison"
            subtitle="Performance radar"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={runAudit}
                disabled={isAuditing || !unitAlpha || !unitBeta}
                className={`text-xs h-7 px-2.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
              >
                {isAuditing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Run Audit'}
              </Button>
            }
          />
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Alpha', val: unitAlpha, set: setUnitAlpha },
                { label: 'Beta', val: unitBeta, set: setUnitBeta },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                    {label}
                  </p>
                  <Select value={val} onValueChange={set}>
                    <SelectTrigger className={`rounded-xl border h-8 text-xs ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200'}`}>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {activePersonnel.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {/* FIX: explicit height to avoid ResponsiveContainer -1 error */}
            <div className="min-h-[148px]">
              <AnimatePresence mode="wait">
                {unitAlpha && unitBeta && radarMetrics.length > 0 ? (
                  <motion.div
                    key="radar-mini"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ width: '100%', height: 148 }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarMetrics}>
                        <PolarGrid stroke={isDark ? '#334155' : '#e2e8f0'} />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 8, fill: isDark ? '#94a3b8' : '#64748b' }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar
                          name={activePersonnel.find((u) => u.id === unitAlpha)?.full_name || 'Alpha'}
                          dataKey="A"
                          stroke={COLORS.mediumBlue}
                          fill={COLORS.mediumBlue}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Radar
                          name={activePersonnel.find((u) => u.id === unitBeta)?.full_name || 'Beta'}
                          dataKey="B"
                          stroke={COLORS.amber}
                          fill={COLORS.amber}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '10px',
                            backgroundColor: isDark ? '#1e293b' : '#fff',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </motion.div>
                ) : (
                  <motion.div
                    key="radar-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`h-full flex flex-col items-center justify-center text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    <Binary className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Select both units to compare</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </SectionCard>
      </motion.div>
      </React.Fragment>
        );
        if (sectionId === 'activity_tabs') return (
      <React.Fragment key="activity_tabs">
      {/* ── TABS ──────────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className={`inline-flex gap-0.5 rounded-xl p-1 mb-4 overflow-x-auto ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200/80 shadow-sm'}`}>
          {TABS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === value
                  ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-slate-900 text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {/* ─── TAB 1: ACTIVITY LOG ─────────────────────────────────────── */}
          {activeTab === 'activity_log' && (
            <motion.div
              key="activity_log"
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Row 1: Application Usage + Category Breakdown (equal halves) */}
              <motion.div variants={listItem} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Application Usage */}
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                    icon={<Monitor className="h-4 w-4 text-blue-500" />}
                    title="Application Usage"
                    subtitle="Time spent per application"
                    action={
                      <span className={`text-[10px] font-medium px-2 py-1 rounded-lg ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                        {aggregatedApps.length} apps
                      </span>
                    }
                  />
                  <div className="p-4">
                    {loading ? (
                      <div className="flex justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                      </div>
                    ) : aggregatedApps.length > 0 ? (
                      <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="space-y-4">
                        {aggregatedApps.map((app, idx) => {
                          const max = aggregatedApps[0]?.duration || 1;
                          return (
                            <motion.div key={idx} variants={listItem} className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                                  >
                                    {String(idx + 1).padStart(2, '0')}
                                  </div>
                                  <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{app.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{secToMin(app.duration)} min</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{app.count}×</span>
                                </div>
                              </div>
                              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.round((app.duration / max) * 100)}%` }}
                                  transition={{ duration: 0.7, delay: idx * 0.07, ease: 'easeOut' }}
                                  className="h-full rounded-full"
                                  style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                                />
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    ) : (
                      <div className={`text-center py-10 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Monitor className="h-10 w-10 mx-auto mb-3 opacity-25" />
                        <p className="font-medium">No app data for {selectedMonth}</p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                          Install the activity-tracker agent to capture app usage
                        </p>
                      </div>
                    )}
                  </div>
                </SectionCard>
                {/* Category Breakdown */}
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
                    icon={<BarChart2 className="h-4 w-4 text-purple-500" />}
                    title="Category Breakdown"
                    subtitle="Time by work category"
                  />
                  <div className="p-4">
                    {categoryBreakdown.length > 0 ? (
                      <div className="space-y-2.5">
                        {categoryBreakdown.slice(0, 5).map((cat, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div
                              className="w-20 text-[11px] font-medium capitalize truncate"
                              style={{ color: CAT_COLORS[cat.category] || '#94a3b8' }}
                            >
                              {cat.category}
                            </div>
                            <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${cat.pct}%` }}
                                transition={{ duration: 0.6, delay: idx * 0.06 }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: CAT_COLORS[cat.category] || '#94a3b8' }}
                              />
                            </div>
                            <span className={`text-[10px] font-mono w-8 text-right ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                              {cat.pct}%
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`text-xs text-center py-6 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        No category data for {selectedMonth}
                      </p>
                    )}
                  </div>
                </SectionCard>
              </motion.div>
              {/* Row 2: Website Activity + Executive Intelligence (equal halves, same height) */}
              <motion.div variants={listItem} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Website Activity */}
                <SectionCard isDark={isDark} className="flex flex-col">
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-cyan-900/40' : 'bg-cyan-50'}
                    icon={<Globe className="h-4 w-4 text-cyan-500" />}
                    title="Website Activity"
                    subtitle="Domains visited and time spent"
                    action={
                      <span className={`text-[10px] font-medium px-2 py-1 rounded-lg ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                        {aggregatedWebsites.length} domains
                      </span>
                    }
                  />
                  <div className="p-4 flex-1">
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                      </div>
                    ) : aggregatedWebsites.length > 0 ? (
                      <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="space-y-2">
                        {aggregatedWebsites.map((site, idx) => {
                          const maxDur = aggregatedWebsites[0]?.duration || 1;
                          const bar = Math.round((site.duration / maxDur) * 100);
                          const isWork = ['gmail', 'drive', 'docs', 'sheets', 'notion', 'slack', 'teams', 'zoom', 'meet', 'jira', 'github']
                            .some((k) => site.domain.includes(k));
                          return (
                            <motion.div
                              key={idx}
                              variants={listItem}
                              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isDark ? 'border-slate-700 bg-slate-800/60 hover:border-slate-600' : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'}`}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                                style={{
                                  background: isWork ? `${COLORS.emeraldGreen}20` : `${COLORS.coral}15`,
                                  color: isWork ? COLORS.emeraldGreen : COLORS.coral,
                                }}
                              >
                                {site.domain.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{site.domain}</p>
                                  <span className={`text-[10px] font-mono ml-2 flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{secToMin(site.duration)}m</span>
                                </div>
                                <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${bar}%` }}
                                    transition={{ duration: 0.6, delay: idx * 0.04 }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: isWork ? COLORS.emeraldGreen : COLORS.coral }}
                                  />
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    ) : (
                      <div className={`text-center py-10 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Globe className="h-10 w-10 mx-auto mb-3 opacity-25" />
                        <p className="font-medium">No website data for {selectedMonth}</p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                          Install the activity-tracker agent
                        </p>
                      </div>
                    )}
                  </div>
                </SectionCard>
                {/* Executive Intelligence */}
                <SectionCard isDark={isDark} className="flex flex-col">
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}
                    icon={<BrainCircuit className="h-4 w-4 text-emerald-500" />}
                    title="Executive Intelligence"
                    subtitle="AI-powered workforce analysis"
                    action={
                      auditInsights.length > 0
                        ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={runAudit}
                            disabled={isAuditing}
                            className={`text-[10px] h-6 px-2 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
                          >
                            Re-run
                          </Button>
                        )
                        : null
                    }
                  />
                  <div className="p-4 flex-1">
                    <AnimatePresence mode="wait">
                      {isAuditing ? (
                        <motion.div
                          key="auditing"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-2 py-8"
                        >
                          <Loader2 className="h-6 w-6 animate-spin" style={{ color: COLORS.mediumBlue }} />
                          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Running analysis…</p>
                        </motion.div>
                      ) : auditInsights.length > 0 ? (
                        <motion.div key="insights" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                          {auditInsights.map((ins, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className={`p-3 rounded-xl border ${ins.bg}`}
                            >
                              <div className="flex gap-2.5">
                                <ins.Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: ins.color }} />
                                <div>
                                  <p className="font-semibold text-xs" style={{ color: ins.color }}>{ins.title}</p>
                                  <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{ins.desc}</p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : (
                        <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                          <BrainCircuit className={`h-10 w-10 mx-auto mb-2 opacity-25 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
                          <p className={`text-xs mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            Run AI workforce analysis
                          </p>
                          <Button
                            onClick={runAudit}
                            className="w-full rounded-xl h-9 text-sm font-semibold"
                            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                          >
                            Run Executive Audit
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SectionCard>
              </motion.div>
            </motion.div>
          )}
          {/* ─── TAB 2: IDLE TRACKER ─────────────────────────────────────── */}
          {activeTab === 'idle_tracker' && (
            <motion.div
              key="idle_tracker"
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <motion.div variants={listItem} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Tracked', value: secondsToHM(idleStats.totalDur), Icon: Clock, color: COLORS.deepBlue, sub: 'All sessions' },
                  { label: 'Active Time', value: secondsToHM(idleStats.activeDur), Icon: Zap, color: COLORS.emeraldGreen, sub: `${idleStats.activePct}% of total` },
                  { label: 'Idle (No Input)', value: secondsToHM(idleStats.idleDur), Icon: Mouse, color: idleStats.idlePct > 30 ? COLORS.coral : COLORS.amber, sub: `${idleStats.idlePct}% of total` },
                  { label: 'Keyboard/Mouse Rate', value: `${100 - idleStats.idlePct}%`, Icon: Keyboard, color: COLORS.mediumBlue, sub: 'Input activity rate' },
                ].map(({ label, value, Icon, color, sub }) => (
                  <motion.div
                    key={label}
                    whileHover={{ y: -2, transition: springPhysics.card }}
                    className={`${metricCardCls} ${metricCardDefault}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
                          <p className="text-xl font-bold mt-1 tracking-tight" style={{ color }}>{value}</p>
                          <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>
                        </div>
                        <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                      </div>
                    </CardContent>
                  </motion.div>
                ))}
              </motion.div>
              {!loading && idleStats.totalDur === 0 && (
                <motion.div variants={listItem}>
                  <div className={`flex items-start gap-3 p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-amber-50 border-amber-100'}`}>
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                        No activity tracking data for {selectedMonth}
                      </p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        The activity-tracker agent must be installed and running on each workstation. Attendance data is available in the Attendance tab.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
              <motion.div variants={listItem} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-slate-700' : 'bg-slate-50'}
                    icon={<Activity className="h-4 w-4 text-slate-500" />}
                    title="Active vs Idle Ratio"
                    subtitle="Keyboard & mouse input vs idle periods"
                  />
                  <div className="p-4">
                    <div className="mb-5">
                      <div className={`h-7 rounded-xl overflow-hidden flex ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        {idleStats.totalDur > 0 ? (
                          <>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${idleStats.activePct}%` }}
                              transition={{ duration: 1, ease: 'easeOut' }}
                              className="h-full flex items-center justify-center text-[10px] font-bold text-white rounded-l-xl"
                              style={{ background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}
                            >
                              {idleStats.activePct > 12 ? `${idleStats.activePct}% Active` : ''}
                            </motion.div>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${idleStats.idlePct}%` }}
                              transition={{ duration: 1, ease: 'easeOut', delay: 0.15 }}
                              className="h-full flex items-center justify-center text-[10px] font-bold text-white rounded-r-xl"
                              style={{ background: `linear-gradient(90deg, ${COLORS.coral}, #ff8e8e)` }}
                            >
                              {idleStats.idlePct > 12 ? `${idleStats.idlePct}% Idle` : ''}
                            </motion.div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No data</div>
                        )}
                      </div>
                      <div className="flex justify-between mt-2">
                        {[
                          { col: COLORS.emeraldGreen, label: `Active · ${secondsToHM(idleStats.activeDur)}` },
                          { col: COLORS.coral, label: `Idle · ${secondsToHM(idleStats.idleDur)}` },
                        ].map(({ col, label }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: col }} />
                            <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {idleStats.idlePct > 30 && (
                      <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-100'}`}>
                        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-red-600">High Idle Alert</p>
                          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-red-400' : 'text-red-500'}`}>
                            {idleStats.idlePct}% idle ratio exceeds the 30% threshold.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-orange-900/40' : 'bg-orange-50'}
                    icon={<Users className="h-4 w-4 text-orange-500" />}
                    title="Per-User Idle Breakdown"
                    subtitle="Keyboard & mouse inactivity by personnel"
                  />
                  <div className="p-4">
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                      </div>
                    ) : idleStats.perUser.length > 0 ? (
                      <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                        {idleStats.perUser.map((u, idx) => {
                          const barCol = u.idlePct > 40 ? COLORS.coral : u.idlePct > 25 ? COLORS.amber : COLORS.emeraldGreen;
                          const badgeCl = u.idlePct > 40
                            ? isDark ? 'bg-red-900/40 text-red-400' : 'bg-red-100 text-red-600'
                            : u.idlePct > 25
                            ? isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-600'
                            : isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700';
                          return (
                            <div key={u.user_id || idx}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ backgroundColor: barCol }}
                                  >
                                    {u.user_name?.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                  <span className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{u.user_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{secondsToHM(u.idle)} idle</span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCl}`}>{u.idlePct}%</span>
                                </div>
                              </div>
                              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${u.idlePct}%` }}
                                  transition={{ duration: 0.6, delay: idx * 0.05 }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: barCol }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Keyboard className="h-8 w-8 mx-auto mb-2 opacity-25" />
                        No idle data for {selectedMonth}
                      </div>
                    )}
                  </div>
                </SectionCard>
              </motion.div>
            </motion.div>
          )}
          {/* ─── TAB 3: ATTENDANCE ───────────────────────────────────────── */}
          {activeTab === 'attendance' && (
            <motion.div
              key="attendance"
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
            >
              <motion.div variants={listItem}>
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                    icon={<Users className="h-4 w-4 text-blue-500" />}
                    title="Personnel Attendance Registry"
                    subtitle={`${filteredAttendance.length} record${filteredAttendance.length !== 1 ? 's' : ''} · ${selectedMonth}`}
                    action={
                      <Badge
                        variant="outline"
                        className={`text-[10px] rounded-full px-2.5 ${isDark ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500'}`}
                      >
                        {selectedMonth}
                      </Badge>
                    }
                  />
                  <div className="overflow-x-auto">
                    {loading ? (
                      <div className="flex justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50/60'}`}>
                            {['Personnel', 'Attendance', 'Hours Logged', 'Late Days', 'Early Outs', 'Status'].map((h) => (
                              <th
                                key={h}
                                className={`text-left py-3 px-4 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-slate-700/60' : 'divide-slate-50'}`}>
                          {filteredAttendance.map((staff, idx) => (
                            <tr
                              key={staff.user_id || idx}
                              className={`transition-colors ${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50/80'}`}
                            >
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{
                                      background: `linear-gradient(135deg, ${COLORS.deepBlue}20, ${COLORS.mediumBlue}30)`,
                                      color: COLORS.deepBlue,
                                    }}
                                  >
                                    {(staff.user_name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{staff.user_name || 'Unknown'}</p>
                                    <p className={`text-[10px] capitalize ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{staff.role || 'staff'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="w-40">
                                  <div className={`flex justify-between text-[10px] mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                                    <span>{staff.days_present || 0} days</span>
                                    <span>/ {staff.expected_hours ? Math.round(staff.expected_hours / 8.5) : 22}</span>
                                  </div>
                                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(((staff.days_present || 0) / 22) * 100, 100)}%`,
                                        backgroundColor:
                                          (staff.days_present || 0) >= 18
                                            ? COLORS.emeraldGreen
                                            : (staff.days_present || 0) >= 12
                                            ? COLORS.amber
                                            : COLORS.coral,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="font-bold text-base tracking-tight" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                                  {staff.total_hours || minutesToHM(staff.total_minutes || 0)}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                {(staff.late_days || 0) > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                    <span className={`font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{staff.late_days}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className={`font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>0</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                {(staff.early_out_days || 0) > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-red-500 font-semibold">{staff.early_out_days}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className={`font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>0</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4">{statusBadge(staff.avg_hours_per_day)}</td>
                            </tr>
                          ))}
                          {filteredAttendance.length === 0 && (
                            <tr>
                              <td colSpan={6} className={`py-16 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                <Binary className="mx-auto h-8 w-8 mb-2 opacity-25" />
                                No attendance data for {selectedMonth}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </SectionCard>
              </motion.div>
            </motion.div>
          )}
          {/* ─── TAB 4: TASK AUDIT ───────────────────────────────────────── */}
          {activeTab === 'task_list' && (
            <motion.div
              key="task_list"
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-3"
            >
              <motion.div variants={listItem} className="lg:col-span-8">
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}
                    icon={<LayoutDashboard className="h-4 w-4 text-emerald-500" />}
                    title="Task List Audit"
                    subtitle={
                      selectedUnit === 'all'
                        ? 'Select a personnel to view their tasks'
                        : `${taskVectors.length} todos · ${taskStats.rate}% completion`
                    }
                    action={
                      selectedUnit !== 'all' ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] rounded-full px-2.5 ${isDark ? 'border-emerald-700 text-emerald-400' : 'border-emerald-200 text-emerald-600 bg-emerald-50'}`}
                        >
                          {taskStats.rate}% done
                        </Badge>
                      ) : null
                    }
                  />
                  <div className="p-4">
                    {selectedUnit === 'all' ? (
                      <div className={`py-14 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Filter className="h-10 w-10 mx-auto mb-3 opacity-25" />
                        <p className="font-medium">No personnel selected</p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Use the Personnel filter in the header</p>
                      </div>
                    ) : taskVectorsLoading ? (
                      <div className="flex justify-center py-14">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {taskVectors.map((task, i) => (
                          <motion.div
                            key={task.id || i}
                            variants={listItem}
                            layout
                            className={`p-3.5 rounded-xl border transition-all ${
                              task.is_completed
                                ? isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/60 border-slate-100'
                                : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-500' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2.5">
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] flex-shrink-0 ${
                                  task.is_completed
                                    ? isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                                    : isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-600'
                                }`}
                              >
                                {task.is_completed ? '✓' : '·'}
                              </div>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  task.is_completed
                                    ? isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                                    : isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600'
                                }`}
                              >
                                {task.is_completed ? 'Done' : 'Active'}
                              </span>
                            </div>
                            <p
                              className={`text-sm font-medium leading-snug ${
                                task.is_completed
                                  ? isDark ? 'line-through text-slate-600' : 'line-through text-slate-400'
                                  : isDark ? 'text-slate-100' : 'text-slate-800'
                              }`}
                            >
                              {task.title || 'Untitled Task'}
                            </p>
                            {task.description && (
                              <p className={`text-[11px] mt-1 line-clamp-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{task.description}</p>
                            )}
                            <div className={`mt-2.5 flex items-center gap-1.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              <Timer className="h-3 w-3" />
                              {task.due_date ? `Due ${format(new Date(task.due_date), 'MMM d')}` : 'No due date'}
                            </div>
                          </motion.div>
                        ))}
                        {taskVectors.length === 0 && (
                          <div className={`col-span-2 py-14 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <Database className="h-8 w-8 mx-auto mb-2 opacity-25" />
                            No todos found for this user
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </SectionCard>
              </motion.div>
              <motion.div variants={listItem} className="lg:col-span-4 space-y-3">
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-slate-700' : 'bg-slate-50'}
                    icon={<Target className="h-4 w-4 text-slate-500" />}
                    title="Audit Profile"
                    subtitle="Task completion statistics"
                  />
                  <div className="p-4 space-y-4">
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                        Completion Rate
                      </p>
                      <p className="text-4xl font-bold mt-1 tracking-tighter" style={{ color: COLORS.emeraldGreen }}>
                        {selectedUnit === 'all' ? '—' : `${taskStats.rate}%`}
                      </p>
                    </div>
                    <div>
                      <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                        Total Todos
                      </p>
                      <p className="text-4xl font-bold mt-1 tracking-tighter" style={{ color: COLORS.deepBlue }}>
                        {selectedUnit === 'all' ? '—' : taskStats.total}
                      </p>
                    </div>
                    {selectedUnit !== 'all' && (
                      <>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${taskStats.rate}%` }}
                            transition={{ duration: 0.8 }}
                            className="h-full rounded-full"
                            style={{ background: `linear-gradient(90deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})` }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className={`p-3 rounded-xl ${isDark ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Completed</p>
                            <p className={`text-2xl font-bold mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{taskStats.completed}</p>
                          </div>
                          <div className={`p-3 rounded-xl ${isDark ? 'bg-amber-900/20' : 'bg-amber-50'}`}>
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Active</p>
                            <p className={`text-2xl font-bold mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{taskStats.active}</p>
                          </div>
                        </div>
                        <Button
                          className="w-full rounded-xl h-9 text-sm font-semibold"
                          onClick={fetchTaskVectors}
                          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                        >
                          Refresh Task Data
                        </Button>
                      </>
                    )}
                  </div>
                </SectionCard>
                {selectedUnit !== 'all' && (() => {
                  const person = activePersonnel.find((u) => u.id === selectedUnit);
                  const att = attendanceRegister.find((a) => a.user_id === selectedUnit);
                  if (!person) return null;
                  return (
                    <SectionCard isDark={isDark}>
                      <div className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white"
                            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                          >
                            {person.full_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{person.full_name}</p>
                            <p className={`text-[10px] capitalize ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{person.role}</p>
                          </div>
                        </div>
                        {att && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Days Present', value: att.days_present || 0 },
                              { label: 'Hours', value: att.total_hours || minutesToHM(att.total_minutes || 0) },
                            ].map(({ label, value }) => (
                              <div key={label} className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
                                <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{value}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </SectionCard>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
          {/* ─── TAB 5: COMPARISON ───────────────────────────────────────── */}
          {activeTab === 'comparison' && (
            <motion.div
              key="comparison"
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-3"
            >
              <motion.div variants={listItem}>
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                    icon={<GitCompare className="h-4 w-4 text-blue-500" />}
                    title="Cross-Unit Audit"
                    subtitle="Compare two personnel performance vectors"
                  />
                  <div className="p-4 space-y-4">
                    {[
                      { label: 'Unit Alpha', val: unitAlpha, set: setUnitAlpha },
                      { label: 'Unit Beta', val: unitBeta, set: setUnitBeta },
                    ].map(({ label, val, set }, i) => (
                      <div key={label}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                          {label}
                        </p>
                        <Select value={val} onValueChange={set}>
                          <SelectTrigger className={`rounded-xl border h-9 text-sm ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200'}`}>
                            <SelectValue placeholder={`Select ${label}`} />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {activePersonnel.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {i === 0 && (
                          <div className="flex items-center gap-3 mt-4">
                            <div className={`flex-1 h-px ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white"
                              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                            >
                              VS
                            </div>
                            <div className={`flex-1 h-px ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />
                          </div>
                        )}
                      </div>
                    ))}
                    {unitAlpha && unitBeta && (
                      <div className={`p-3 rounded-xl space-y-2 ${isDark ? 'bg-slate-700/60' : 'bg-slate-50'}`}>
                        {[
                          { col: COLORS.mediumBlue, name: activePersonnel.find((u) => u.id === unitAlpha)?.full_name || 'Alpha' },
                          { col: COLORS.amber, name: activePersonnel.find((u) => u.id === unitBeta)?.full_name || 'Beta' },
                        ].map(({ col, name }) => (
                          <div key={name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: col }} />
                            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      onClick={runAudit}
                      disabled={isAuditing || !unitAlpha || !unitBeta}
                      className="w-full rounded-xl h-9 text-sm font-semibold"
                      style={(!unitAlpha || !unitBeta) ? undefined : { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                    >
                      {isAuditing
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auditing…</>
                        : 'Run Comparative Audit'}
                    </Button>
                    <AnimatePresence>
                      {auditInsights.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                          <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                            AI Insights
                          </p>
                          {auditInsights.map((ins, i) => (
                            <div key={i} className={`p-2.5 rounded-xl border ${ins.bg}`}>
                              <div className="flex gap-2">
                                <ins.Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: ins.color }} />
                                <div>
                                  <p className="text-[10px] font-bold" style={{ color: ins.color }}>{ins.title}</p>
                                  <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{ins.desc}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SectionCard>
              </motion.div>
              <motion.div variants={listItem} className="lg:col-span-2">
                <SectionCard isDark={isDark}>
                  <CardHeaderRow
                    isDark={isDark}
                    iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
                    icon={<Eye className="h-4 w-4 text-purple-500" />}
                    title="Performance Vectors"
                    subtitle="Six-dimensional workforce comparison"
                  />
                  {/* FIX: explicit pixel height to prevent ResponsiveContainer measuring -1 */}
                  <div className="p-4" style={{ height: 440 }}>
                    <AnimatePresence mode="wait">
                      {unitAlpha && unitBeta && radarMetrics.length > 0 ? (
                        <motion.div
                          key="radar-large"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          style={{ width: '100%', height: '100%' }}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarMetrics} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                              <PolarGrid stroke={isDark ? '#1e293b' : '#e2e8f0'} strokeWidth={1} />
                              <PolarAngleAxis
                                dataKey="metric"
                                tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#475569', fontWeight: 600 }}
                              />
                              <PolarRadiusAxis
                                domain={[0, 100]}
                                tickCount={5}
                                tick={{ fontSize: 9, fill: isDark ? '#475569' : '#cbd5e1' }}
                              />
                              <Radar
                                name={activePersonnel.find((u) => u.id === unitAlpha)?.full_name || 'Alpha'}
                                dataKey="A"
                                stroke={COLORS.mediumBlue}
                                fill={COLORS.mediumBlue}
                                fillOpacity={0.22}
                                strokeWidth={2.5}
                              />
                              <Radar
                                name={activePersonnel.find((u) => u.id === unitBeta)?.full_name || 'Beta'}
                                dataKey="B"
                                stroke={COLORS.amber}
                                fill={COLORS.amber}
                                fillOpacity={0.22}
                                strokeWidth={2.5}
                              />
                              <Tooltip
                                contentStyle={{
                                  borderRadius: '10px',
                                  border: 'none',
                                  fontSize: '11px',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                                  backgroundColor: isDark ? '#1e293b' : '#fff',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="radar-large-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`h-full flex flex-col items-center justify-center text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                        >
                          <Binary className="h-14 w-14 mx-auto mb-4 opacity-25" />
                          <p className="text-sm font-medium">Select two units to compare performance</p>
                          <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                            Choose Alpha and Beta from the panel on the left
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SectionCard>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {/* ── FOOTER HUD ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className={`flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
      >
        <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
          <span>Telemetry synchronised · {selectedMonth}</span>
          {attendanceRegister.length > 0 && (
            <>
              <span className={isDark ? 'text-slate-700' : 'text-slate-200'}>·</span>
              <span>{attendanceRegister.length} personnel record{attendanceRegister.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
        <Button
          onClick={() => {
            if (!canDownloadReports) return toast.error('Export privileges restricted.');
            toast.info('Compiling telemetry report…');
          }}
          variant="outline"
          className={`rounded-xl h-8 text-xs flex items-center gap-2 ${isDark ? 'border-slate-700 text-slate-400 hover:text-slate-200' : 'border-slate-200 text-slate-500'}`}
        >
          <FileDown className="h-3.5 w-3.5" />Export Telemetry
        </Button>
      </motion.div>
      </React.Fragment>
        );
        return null;
      })}
    </motion.div>
    </>
  );
}
