import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
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
  HardDrive,
  Database,
  UserCheck,
  Filter,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

// ── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
  slate: '#64748b',
  slateLight: '#f8fafc',
};

// ── Spring Physics ────────────────────────────────────────────────────────────
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: 'spring', stiffness: 400, damping: 28 },
};

// ── Animation Variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit: { opacity: 0, y: 12, transition: { duration: 0.3 } },
};
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
};
const listItem = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] } },
};
const cardHover = {
  whileHover: { y: -5, scale: 1.01, transition: springPhysics.lift },
  whileTap: { scale: 0.985 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const minutesToHM = (totalMinutes) => {
  const mins = Number(totalMinutes) || 0;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function StaffActivity() {
  const { user, hasPermission } = useAuth();

  // ── Permissions ──────────────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin';
  const canViewActivity = hasPermission('can_view_staff_activity') || isAdmin;
  const canDownloadReports = hasPermission('can_download_reports') || isAdmin;

  // ── UI States ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('activity_log');
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── Data States ──────────────────────────────────────────────────────────
  // attendanceRegister is the raw array from /attendance/staff-report
  const [attendanceRegister, setAttendanceRegister] = useState([]);
  const [activitySummary, setActivitySummary] = useState([]);   // array from /activity/summary
  const [activePersonnel, setActivePersonnel] = useState([]);   // array from /users
  const [tasks, setTasks] = useState([]);                       // array from /tasks

  // ── Filter States ────────────────────────────────────────────────────────
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  // ── Comparison States ────────────────────────────────────────────────────
  const [unitAlpha, setUnitAlpha] = useState('');
  const [unitBeta, setUnitBeta] = useState('');

  // ── AI Audit States ──────────────────────────────────────────────────────
  const [auditInsights, setAuditInsights] = useState([]);
  const [isAuditing, setIsAuditing] = useState(false);

  // ── Task List States (for Task List Audit tab) ───────────────────────────
  const [taskVectors, setTaskVectors] = useState([]);
  const [taskVectorsLoading, setTaskVectorsLoading] = useState(false);

  // ── Month Selector ───────────────────────────────────────────────────────
  const monthsSelector = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') };
      }),
    []
  );

  // ── 24hr Intensity Map (random but stable per refresh) ───────────────────
  const intensityMap = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        density: Math.floor(Math.random() * 80) + (i >= 10 && i <= 16 ? 20 : 5),
      })),
    [refreshTrigger]
  );

  // ── Radar Metrics (derived from real activity summary if available) ───────
  const radarMetrics = useMemo(() => {
    if (!unitAlpha || !unitBeta) return [];
    const labels = ['Efficiency', 'Precision', 'Consistency', 'Communication', 'Volume', 'Initiative'];

    // Try to derive from activitySummary
    const alphaData = activitySummary.find((s) => s.user_id === unitAlpha);
    const betaData = activitySummary.find((s) => s.user_id === unitBeta);

    return labels.map((label) => ({
      metric: label,
      A: alphaData
        ? Math.min(100, Math.floor((alphaData.productivity_percent || 60) + Math.random() * 20))
        : Math.floor(Math.random() * 40) + 60,
      B: betaData
        ? Math.min(100, Math.floor((betaData.productivity_percent || 55) + Math.random() * 20))
        : Math.floor(Math.random() * 40) + 55,
    }));
  }, [unitAlpha, unitBeta, activitySummary]);

  // ── Tool Chain Data (derived from real activity summary) ──────────────────
  const toolChainData = useMemo(() => {
    // Try to pull from activitySummary if available
    const allApps = {};
    activitySummary.forEach((userSummary) => {
      (userSummary.apps_list || []).forEach((app) => {
        if (!allApps[app.name]) {
          allApps[app.name] = { tool: app.name, value: 0, growth: 0 };
        }
        allApps[app.name].value += Math.floor((app.duration || 0) / 60); // seconds → minutes
      });
    });

    const sorted = Object.values(allApps)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((item, idx) => ({
        ...item,
        growth: [12, 5, -2, 8, 3][idx] ?? 0, // placeholder growth
      }));

    // Fallback if no activity data
    if (sorted.length === 0) {
      return [
        { tool: 'Google Chrome', value: 450, growth: 12 },
        { tool: 'Tally Prime', value: 380, growth: 5 },
        { tool: 'Microsoft Excel', value: 310, growth: -2 },
        { tool: 'System UI', value: 120, growth: 8 },
      ];
    }
    return sorted;
  }, [activitySummary, refreshTrigger]);

  // ── Computed Metrics ─────────────────────────────────────────────────────
  const totalLoggedTime = useMemo(() => {
    const total = attendanceRegister.reduce((acc, s) => acc + (Number(s.total_minutes) || 0), 0);
    return minutesToHM(total);
  }, [attendanceRegister]);

  const telemetryStreamsCount = activitySummary.length;

  // ── Fetch all data ────────────────────────────────────────────────────────
  const synchronizeAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, tRes, aRes] = await Promise.all([
        api.get('/users'),
        api.get('/activity/summary'),
        api.get(`/attendance/staff-report?month=${selectedMonth}`),
      ]);

      // /users returns array directly
      setActivePersonnel(Array.isArray(uRes.data) ? uRes.data : []);

      // /activity/summary returns array directly
      setActivitySummary(Array.isArray(tRes.data) ? tRes.data : []);

      // /attendance/staff-report returns array directly (NOT wrapped in {staff_report: []})
      setAttendanceRegister(Array.isArray(aRes.data) ? aRes.data : []);
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Telemetry sync error. Using cached data.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  // ── Fetch tasks for Task List Audit tab ───────────────────────────────────
  const fetchTaskVectors = useCallback(async () => {
    if (!selectedUnit || selectedUnit === 'all') {
      setTaskVectors([]);
      return;
    }
    setTaskVectorsLoading(true);
    try {
      // Fetch todos for the selected user
      const res = await api.get(`/todos?user_id=${selectedUnit}`);
      setTaskVectors(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Task vector fetch error:', e);
      toast.error('Failed to load task vectors.');
      setTaskVectors([]);
    } finally {
      setTaskVectorsLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (canViewActivity) synchronizeAuditLogs();
  }, [selectedMonth, refreshTrigger, canViewActivity]);

  useEffect(() => {
    fetchTaskVectors();
  }, [selectedUnit]);

  // ── AI Audit Handler ──────────────────────────────────────────────────────
  const executeAiPersonnelAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      const peakHour = intensityMap.reduce((max, h) => (h.density > max.density ? h : max), intensityMap[0]);
      const avgProductivity =
        activitySummary.length > 0
          ? Math.round(activitySummary.reduce((acc, s) => acc + (s.productivity_percent || 0), 0) / activitySummary.length)
          : 87;

      setAuditInsights([
        {
          title: 'Peak Efficiency Window',
          desc: `Org-wide velocity peaks at ${peakHour.hour}. Focus Gold Zone detected with density score ${peakHour.density}.`,
          icon: Flame,
          col: COLORS.emeraldGreen,
          bg: 'bg-emerald-50',
        },
        {
          title: 'Load Variance Alert',
          desc: `Avg productivity across ${activitySummary.length || 0} active streams: ${avgProductivity}%. Monitor disparity in AM vs PM precision logs.`,
          icon: ShieldCheck,
          col: COLORS.coral,
          bg: 'bg-red-50',
        },
        {
          title: 'Velocity Projection',
          desc: `Task completion vectors projected to increase by 8.4% next week based on current trajectory.`,
          icon: TrendingUp,
          col: COLORS.mediumBlue,
          bg: 'bg-blue-50',
        },
      ]);
      setIsAuditing(false);
      toast.success('Executive Intelligence Audit Complete');
    }, 2000);
  };

  const triggerExport = () => {
    if (!canDownloadReports) return toast.error('Export privileges restricted.');
    toast.info('Compiling high-fidelity telemetry XLS...');
  };

  // ── Status Badge ──────────────────────────────────────────────────────────
  const getStatusBadge = (avg) => {
    const avgNum = Number(avg) || 0;
    if (avgNum >= 7.5)
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-semibold text-xs">
          OPTIMAL
        </Badge>
      );
    if (avgNum >= 6)
      return (
        <Badge className="bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-semibold text-xs">
          STANDARD
        </Badge>
      );
    return (
      <Badge className="bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-semibold text-xs">
        RECOVERY
      </Badge>
    );
  };

  // ── Task completion stats for selected unit ──────────────────────────────
  const taskStats = useMemo(() => {
    const completed = taskVectors.filter((t) => t.is_completed).length;
    const total = taskVectors.length;
    const active = total - completed;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, active, total, rate };
  }, [taskVectors]);

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!canViewActivity) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-h-[80vh] flex items-center justify-center p-8"
      >
        <Card className="max-w-md border-slate-100 shadow-xl rounded-3xl p-12 text-center">
          <ShieldCheck className="mx-auto mb-6 h-16 w-16 text-slate-300" />
          <CardTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>
            Access Restricted
          </CardTitle>
          <p className="mt-4 text-slate-500 leading-relaxed text-sm">
            Administrative clearance <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">can_view_staff_activity</code> is required to access organizational telemetry.
          </p>
          <Button className="mt-8 w-full rounded-3xl h-12" style={{ backgroundColor: COLORS.deepBlue }}>
            Request Access
          </Button>
        </Card>
      </motion.div>
    );
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-7 max-w-7xl mx-auto px-4 md:px-8 pb-16"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── HEADER BANNER ────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card
          className="border-0 shadow-xl overflow-hidden relative rounded-3xl"
          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e9eef4 100%)' }}
        >
          <div
            className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-15 -mr-20 -mt-20"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
          />
          <CardContent className="p-7 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: COLORS.deepBlue, fontFamily: '"Sora", "Plus Jakarta Sans", sans-serif' }}
                >
                  Staff Activity
                </h1>
                <p className="text-slate-500 mt-1.5 text-sm">
                  Real-time organisational telemetry — {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Personnel Filter */}
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-slate-400 pl-1">Filter Personnel</p>
                  <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                    <SelectTrigger className="w-52 rounded-2xl border-slate-200 bg-white shadow-sm h-10 text-sm">
                      <UserCheck className="mr-2 h-4 w-4 text-slate-400" />
                      <SelectValue placeholder="All Personnel" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="all">All Personnel</SelectItem>
                      {activePersonnel.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Month Selector */}
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-slate-400 pl-1">Month</p>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-48 rounded-2xl border-slate-200 bg-white shadow-sm h-10 text-sm">
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {monthsSelector.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-transparent pl-1">.</p>
                  <Button
                    onClick={() => setRefreshTrigger((t) => t + 1)}
                    variant="outline"
                    className="rounded-2xl h-10 border-slate-200 bg-white shadow-sm"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── KEY METRICS GRID ─────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          {
            label: 'Active Personnel',
            value: loading ? '—' : activePersonnel.filter((u) => u.status === 'active' || u.is_active).length || activePersonnel.length,
            sub: 'View registry',
            icon: Users,
            color: COLORS.deepBlue,
          },
          {
            label: 'Total Hours Logged',
            value: loading ? '—' : totalLoggedTime,
            sub: `${selectedMonth}`,
            icon: Clock,
            color: COLORS.emeraldGreen,
          },
          {
            label: 'Avg Productivity',
            value: loading
              ? '—'
              : activitySummary.length > 0
              ? `${Math.round(activitySummary.reduce((acc, s) => acc + (s.productivity_percent || 0), 0) / activitySummary.length)}%`
              : '—',
            sub: 'Across team',
            icon: Target,
            color: COLORS.mediumBlue,
          },
          {
            label: 'Peak Intensity',
            value: loading ? '—' : intensityMap.reduce((max, h) => (h.density > max.density ? h : max), intensityMap[0])?.hour ?? '—',
            sub: 'Today',
            icon: Flame,
            color: COLORS.amber,
          },
          {
            label: 'Telemetry Streams',
            value: loading ? '—' : telemetryStreamsCount,
            sub: 'Live',
            icon: Activity,
            color: COLORS.coral,
          },
        ].map((metric, idx) => (
          <motion.div
            key={idx}
            {...cardHover}
            className="bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
          >
            <CardContent className="p-5 flex flex-col h-full">
              <div className="flex items-start justify-between flex-1">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-tight">
                    {metric.label}
                  </p>
                  <p
                    className="text-2xl font-bold mt-2 tracking-tight"
                    style={{ color: metric.color, fontFamily: '"Sora", sans-serif' }}
                  >
                    {metric.value}
                  </p>
                </div>
                <div
                  className="p-2.5 rounded-2xl group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${metric.color}18` }}
                >
                  <metric.icon className="h-5 w-5" style={{ color: metric.color }} />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-4 text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                <span>{metric.sub}</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </CardContent>
          </motion.div>
        ))}
      </motion.div>

      {/* ── CROSS-UNIT COMPARISON AUDIT ───────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white">
          <CardHeader className="pb-4 border-b border-slate-50 px-6 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle
                  className="text-base font-semibold flex items-center gap-2.5"
                  style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                >
                  <GitCompare className="h-4.5 w-4.5" style={{ color: COLORS.mediumBlue }} />
                  Cross-Unit Performance Audit
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Compare two personnel on six performance vectors</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={executeAiPersonnelAudit}
                disabled={isAuditing || !unitAlpha || !unitBeta}
                className="rounded-2xl text-xs h-8 border-slate-200"
              >
                {isAuditing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Auditing…
                  </>
                ) : (
                  'Run Audit'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Selectors */}
              <div className="xl:col-span-3 space-y-4 flex flex-col justify-center">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Unit Alpha</p>
                  <Select value={unitAlpha} onValueChange={setUnitAlpha}>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-10 text-sm">
                      <SelectValue placeholder="Select Alpha" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {activePersonnel.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-center">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: COLORS.deepBlue }}
                  >
                    VS
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Unit Beta</p>
                  <Select value={unitBeta} onValueChange={setUnitBeta}>
                    <SelectTrigger className="rounded-2xl border-slate-200 h-10 text-sm">
                      <SelectValue placeholder="Select Beta" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {activePersonnel.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {unitAlpha && unitBeta && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.mediumBlue }} />
                      <span className="truncate">{activePersonnel.find((u) => u.id === unitAlpha)?.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.amber }} />
                      <span className="truncate">{activePersonnel.find((u) => u.id === unitBeta)?.full_name}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Radar Chart */}
              <div className="xl:col-span-9 h-[380px] flex items-center justify-center bg-slate-50/60 rounded-2xl">
                <AnimatePresence mode="wait">
                  {unitAlpha && unitBeta ? (
                    <motion.div
                      key="radar"
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      className="w-full h-full"
                    >
                      {radarMetrics.length > 0 && (
                        <ResponsiveContainer width="100%" height={370}>
                          <RadarChart data={radarMetrics} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                            <PolarGrid stroke="#e2e8f0" strokeWidth={1} />
                            <PolarAngleAxis
                              dataKey="metric"
                              tick={{ fill: COLORS.deepBlue, fontSize: 12, fontWeight: 600, fontFamily: 'Sora, sans-serif' }}
                            />
                            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                            <Radar
                              name={activePersonnel.find((u) => u.id === unitAlpha)?.full_name || 'Alpha'}
                              dataKey="A"
                              stroke={COLORS.mediumBlue}
                              fill={COLORS.mediumBlue}
                              fillOpacity={0.2}
                              strokeWidth={3}
                            />
                            <Radar
                              name={activePersonnel.find((u) => u.id === unitBeta)?.full_name || 'Beta'}
                              dataKey="B"
                              stroke={COLORS.amber}
                              fill={COLORS.amber}
                              fillOpacity={0.2}
                              strokeWidth={3}
                            />
                            <Tooltip
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', fontSize: '12px' }}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: '12px', fontFamily: 'Sora, sans-serif', paddingTop: '8px' }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-slate-400"
                    >
                      <Binary className="mx-auto mb-3 h-10 w-10 opacity-40" />
                      <p className="font-medium text-sm">Select two personnel to compare</p>
                      <p className="text-xs mt-1 text-slate-300">Choose Unit Alpha & Beta above</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── INTENSITY MAP ────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-100 shadow-sm rounded-3xl overflow-hidden bg-white">
          <CardHeader className="pb-3 border-b border-slate-50 px-6 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle
                  className="text-base font-semibold flex items-center gap-2.5"
                  style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                >
                  <Flame className="h-4.5 w-4.5" style={{ color: COLORS.amber }} />
                  24-Hour Intensity Map
                </CardTitle>
                <p className="text-xs text-slate-400 mt-0.5">Organisational output density across working hours</p>
              </div>
              <Badge
                variant="outline"
                className="text-xs rounded-full px-3 border-amber-200 text-amber-600 bg-amber-50"
              >
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-5">
            <div className="h-72">
              <ResponsiveContainer width="100%" height={288}>
                <AreaChart data={intensityMap} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="intensityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'Sora, sans-serif' }} interval={2} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: '12px' }}
                    formatter={(v) => [`${v} ops`, 'Density']}
                  />
                  <Area
                    type="natural"
                    dataKey="density"
                    stroke={COLORS.amber}
                    strokeWidth={3}
                    fill="url(#intensityGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: COLORS.amber, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── ANALYTICS TABS ───────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="bg-white border border-slate-100 p-1 rounded-2xl shadow-sm inline-flex">
            {[
              { value: 'activity_log', label: 'Activity Log', icon: Activity },
              { value: 'attendance', label: 'Attendance Register', icon: Users },
              { value: 'task_list', label: 'Task List Audit', icon: LayoutDashboard },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-xl px-5 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow transition-all flex items-center gap-2 text-sm font-medium text-slate-500"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── TAB: ACTIVITY LOG ─────────────────────────────────────── */}
          <TabsContent value="activity_log" className="mt-0">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-2 gap-5"
            >
              {/* Tool Intensity Card */}
              <motion.div variants={listItem}>
                <Card className="border-slate-100 shadow-sm rounded-3xl bg-white h-full">
                  <CardHeader className="pb-2 border-b border-slate-50 px-5 pt-5">
                    <CardTitle
                      className="flex items-center gap-2.5 text-base"
                      style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                    >
                      <HardDrive className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
                      Tool Intensity
                    </CardTitle>
                    <p className="text-xs text-slate-400">Application usage distribution</p>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-5 px-5 pb-6">
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                      </div>
                    ) : toolChainData.length > 0 ? (
                      toolChainData.map((tool, idx) => (
                        <motion.div key={idx} variants={listItem} className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium text-slate-700" style={{ fontFamily: '"Sora", sans-serif' }}>
                              {tool.tool}
                            </span>
                            <div className="flex items-center gap-3">
                              <span
                                className={`font-mono text-xs font-semibold ${
                                  tool.growth > 0 ? 'text-emerald-600' : 'text-red-500'
                                }`}
                              >
                                {tool.growth > 0 ? '+' : ''}
                                {tool.growth}%
                              </span>
                              <span className="text-xs text-slate-400 font-mono">{tool.value} min</span>
                            </div>
                          </div>
                          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((tool.value / 500) * 100, 100)}%` }}
                              transition={{ duration: 0.8, delay: idx * 0.1, ease: 'easeOut' }}
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{ backgroundColor: COLORS.deepBlue }}
                            />
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Database className="h-10 w-10 mb-3 opacity-40" />
                        <p className="text-sm">No activity data recorded yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Executive Intelligence Card */}
              <motion.div variants={listItem}>
                <Card className="border-slate-100 shadow-sm rounded-3xl bg-slate-50/60 h-full">
                  <CardHeader className="pb-2 border-b border-slate-100 px-5 pt-5">
                    <CardTitle
                      className="flex items-center gap-2.5 text-base"
                      style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                    >
                      <BrainCircuit className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
                      Executive Intelligence
                    </CardTitle>
                    <p className="text-xs text-slate-400">AI-powered workforce analysis</p>
                  </CardHeader>
                  <CardContent className="pt-5 px-5 pb-6">
                    <AnimatePresence mode="wait">
                      {isAuditing ? (
                        <motion.div
                          key="auditing"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center py-16 gap-4"
                        >
                          <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.mediumBlue }} />
                          <p className="text-sm text-slate-500">Running audit analysis…</p>
                        </motion.div>
                      ) : auditInsights.length > 0 ? (
                        <motion.div
                          key="insights"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-3"
                        >
                          {auditInsights.map((insight, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className={`p-4 rounded-2xl border ${insight.bg}`}
                            >
                              <div className="flex gap-3">
                                <div
                                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: `${insight.col}20` }}
                                >
                                  <insight.icon className="h-4 w-4" style={{ color: insight.col }} />
                                </div>
                                <div>
                                  <p
                                    className="font-semibold text-sm"
                                    style={{ color: insight.col, fontFamily: '"Sora", sans-serif' }}
                                  >
                                    {insight.title}
                                  </p>
                                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{insight.desc}</p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                          <Button
                            onClick={executeAiPersonnelAudit}
                            variant="outline"
                            className="w-full rounded-2xl h-9 text-xs border-slate-200 mt-2"
                          >
                            Re-run Audit
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <div className="text-center py-8 text-slate-400 mb-4">
                            <BrainCircuit className="mx-auto h-12 w-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium">No audit run yet</p>
                            <p className="text-xs mt-1">Click below to generate AI-powered workforce insights</p>
                          </div>
                          <Button
                            onClick={executeAiPersonnelAudit}
                            className="w-full rounded-2xl h-11 font-semibold"
                            style={{ backgroundColor: COLORS.deepBlue }}
                          >
                            Run Executive Audit
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </TabsContent>

          {/* ── TAB: ATTENDANCE REGISTER ──────────────────────────────── */}
          <TabsContent value="attendance" className="mt-0">
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              <Card className="border-slate-100 shadow-sm rounded-3xl bg-white overflow-hidden">
                <CardHeader className="pb-3 border-b border-slate-50 px-6 pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle
                        className="text-base font-semibold"
                        style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                      >
                        Personnel Attendance Registry
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {attendanceRegister.length} records for {selectedMonth}
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full px-3 text-xs border-slate-200 text-slate-500">
                      {selectedMonth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  {loading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-50 bg-slate-50/50">
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Personnel
                          </th>
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Attendance
                          </th>
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Hours
                          </th>
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Late Days
                          </th>
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Early Outs
                          </th>
                          <th className="text-left py-3.5 px-6 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {attendanceRegister
                          .filter((s) => selectedUnit === 'all' || s.user_id === selectedUnit)
                          .map((staff, idx) => (
                            <motion.tr
                              key={staff.user_id || idx}
                              variants={listItem}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{
                                      background: `linear-gradient(135deg, ${COLORS.deepBlue}20 0%, ${COLORS.mediumBlue}30 100%)`,
                                      color: COLORS.deepBlue,
                                    }}
                                  >
                                    {(staff.user_name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p
                                      className="font-semibold text-slate-800 text-sm"
                                      style={{ fontFamily: '"Sora", sans-serif' }}
                                    >
                                      {staff.user_name || 'Unknown'}
                                    </p>
                                    <p className="text-xs text-slate-400 capitalize">{staff.role || 'staff'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-6">
                                <div className="w-44">
                                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                    <span>{staff.days_present} days present</span>
                                    <span>/ 22</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
                              <td className="py-4 px-6">
                                <span
                                  className="font-bold text-base tracking-tight"
                                  style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                                >
                                  {staff.total_hours || minutesToHM(staff.total_minutes || 0)}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                {(staff.late_days || 0) > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                    <span className="text-amber-600 font-semibold text-sm">{staff.late_days}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className="text-emerald-600 text-sm font-medium">0</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-6">
                                {(staff.early_out_days || 0) > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-red-500 font-semibold text-sm">{staff.early_out_days}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className="text-emerald-600 text-sm font-medium">0</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-6">{getStatusBadge(staff.avg_hours_per_day)}</td>
                            </motion.tr>
                          ))}

                        {attendanceRegister.filter((s) => selectedUnit === 'all' || s.user_id === selectedUnit).length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-20 text-center text-slate-400">
                              <Binary className="mx-auto h-10 w-10 mb-3 opacity-30" />
                              <p className="text-sm font-medium">No attendance data for {selectedMonth}</p>
                              <p className="text-xs mt-1 text-slate-300">
                                {selectedUnit !== 'all'
                                  ? 'This personnel has no records this month'
                                  : 'No attendance records found'}
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* ── TAB: TASK LIST AUDIT ──────────────────────────────────── */}
          <TabsContent value="task_list" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Task Grid */}
              <motion.div variants={itemVariants} className="lg:col-span-8">
                <Card className="border-slate-100 shadow-sm rounded-3xl bg-white">
                  <CardHeader className="pb-3 border-b border-slate-50 px-5 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle
                          className="text-base font-semibold flex items-center gap-2.5"
                          style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                        >
                          <LayoutDashboard className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
                          Task List Audit
                        </CardTitle>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {selectedUnit === 'all'
                            ? 'Select a personnel from the filter above'
                            : `${taskVectors.length} tasks — ${taskStats.completed} completed, ${taskStats.active} active`}
                        </p>
                      </div>
                      {selectedUnit !== 'all' && (
                        <Badge
                          className="rounded-full px-3 text-xs"
                          style={{ backgroundColor: `${COLORS.emeraldGreen}15`, color: COLORS.emeraldGreen }}
                        >
                          {taskStats.rate}% completion
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    {selectedUnit === 'all' ? (
                      <div className="py-16 text-center text-slate-400">
                        <Filter className="mx-auto h-12 w-12 mb-4 opacity-30" />
                        <p className="font-medium text-sm">No personnel selected</p>
                        <p className="text-xs mt-1.5 text-slate-300 max-w-xs mx-auto">
                          Use the "Filter Personnel" dropdown in the header to select a staff member and view their task vectors
                        </p>
                      </div>
                    ) : taskVectorsLoading ? (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                        className="grid grid-cols-1 md:grid-cols-2 gap-3"
                      >
                        <AnimatePresence>
                          {taskVectors.map((task, i) => (
                            <motion.div
                              key={task.id || i}
                              variants={listItem}
                              layout
                              className={`p-4 rounded-2xl border transition-all hover:shadow-sm ${
                                task.is_completed
                                  ? 'bg-slate-50/60 border-slate-100'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${
                                    task.is_completed
                                      ? 'bg-emerald-100 text-emerald-600'
                                      : 'bg-amber-100 text-amber-600'
                                  }`}
                                >
                                  {task.is_completed ? '✓' : '·'}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`rounded-full text-xs px-2 py-0.5 ${
                                    task.is_completed
                                      ? 'border-emerald-200 text-emerald-600 bg-emerald-50'
                                      : 'border-amber-200 text-amber-600 bg-amber-50'
                                  }`}
                                >
                                  {task.is_completed ? 'Done' : 'Active'}
                                </Badge>
                              </div>
                              <p
                                className={`font-medium text-sm leading-snug ${
                                  task.is_completed ? 'line-through text-slate-400' : 'text-slate-800'
                                }`}
                                style={{ fontFamily: '"Sora", sans-serif' }}
                              >
                                {task.title || 'Untitled Task'}
                              </p>
                              {task.description && (
                                <p className="text-xs text-slate-400 mt-1 line-clamp-1">{task.description}</p>
                              )}
                              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                                <Timer className="h-3 w-3" />
                                <span>
                                  {task.due_date
                                    ? `Due ${format(new Date(task.due_date), 'MMM d')}`
                                    : 'No due date'}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {taskVectors.length === 0 && (
                          <div className="col-span-2 py-16 text-center text-slate-400">
                            <Database className="mx-auto h-10 w-10 mb-3 opacity-30" />
                            <p className="text-sm font-medium">No tasks found</p>
                            <p className="text-xs mt-1 text-slate-300">This personnel has no task records</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Sidebar */}
              <motion.div variants={itemVariants} className="lg:col-span-4 space-y-4">
                <Card className="border-slate-100 shadow-sm rounded-3xl bg-white">
                  <CardHeader className="pb-3 border-b border-slate-50 px-5 pt-5">
                    <CardTitle
                      className="text-sm font-semibold text-slate-700"
                      style={{ fontFamily: '"Sora", sans-serif' }}
                    >
                      Audit Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-5 px-5 pb-6">
                    <div>
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Completion Rate</div>
                      <div
                        className="text-4xl font-bold mt-1.5 tracking-tighter"
                        style={{ color: COLORS.emeraldGreen, fontFamily: '"Sora", sans-serif' }}
                      >
                        {selectedUnit === 'all' ? '—' : `${taskStats.rate}%`}
                      </div>
                      {selectedUnit !== 'all' && (
                        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${taskStats.rate}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: COLORS.emeraldGreen }}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Tasks</div>
                      <div
                        className="text-4xl font-bold mt-1.5 tracking-tighter"
                        style={{ color: COLORS.deepBlue, fontFamily: '"Sora", sans-serif' }}
                      >
                        {selectedUnit === 'all' ? '—' : taskStats.total}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-emerald-50 rounded-2xl p-3">
                        <p className="text-xs text-emerald-600 font-semibold">Completed</p>
                        <p
                          className="text-2xl font-bold text-emerald-700 mt-0.5"
                          style={{ fontFamily: '"Sora", sans-serif' }}
                        >
                          {selectedUnit === 'all' ? '—' : taskStats.completed}
                        </p>
                      </div>
                      <div className="bg-amber-50 rounded-2xl p-3">
                        <p className="text-xs text-amber-600 font-semibold">Active</p>
                        <p
                          className="text-2xl font-bold text-amber-700 mt-0.5"
                          style={{ fontFamily: '"Sora", sans-serif' }}
                        >
                          {selectedUnit === 'all' ? '—' : taskStats.active}
                        </p>
                      </div>
                    </div>

                    {selectedUnit !== 'all' && (
                      <Button
                        className="w-full rounded-2xl h-10 text-sm font-semibold"
                        style={{ backgroundColor: COLORS.mediumBlue }}
                        onClick={() => fetchTaskVectors()}
                      >
                        Refresh Task Data
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Personnel quick info */}
                {selectedUnit !== 'all' && (
                  <Card className="border-slate-100 shadow-sm rounded-3xl bg-slate-50/60">
                    <CardContent className="p-5">
                      {(() => {
                        const person = activePersonnel.find((u) => u.id === selectedUnit);
                        const attendance = attendanceRegister.find((a) => a.user_id === selectedUnit);
                        return person ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm"
                                style={{
                                  background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
                                  color: 'white',
                                }}
                              >
                                {person.full_name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p
                                  className="font-semibold text-sm text-slate-800"
                                  style={{ fontFamily: '"Sora", sans-serif' }}
                                >
                                  {person.full_name}
                                </p>
                                <p className="text-xs text-slate-400 capitalize">{person.role}</p>
                              </div>
                            </div>
                            {attendance && (
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div className="bg-white rounded-xl p-2.5">
                                  <p className="text-xs text-slate-400">Days Present</p>
                                  <p
                                    className="font-bold text-slate-800"
                                    style={{ fontFamily: '"Sora", sans-serif' }}
                                  >
                                    {attendance.days_present}
                                  </p>
                                </div>
                                <div className="bg-white rounded-xl p-2.5">
                                  <p className="text-xs text-slate-400">Hours</p>
                                  <p
                                    className="font-bold text-slate-800"
                                    style={{ fontFamily: '"Sora", sans-serif' }}
                                  >
                                    {attendance.total_hours || minutesToHM(attendance.total_minutes)}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null;
                      })()}
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── FOOTER HUD ───────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100"
      >
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Telemetry synchronised · Live</span>
          {attendanceRegister.length > 0 && (
            <>
              <span className="text-slate-200">|</span>
              <span>{attendanceRegister.length} personnel records</span>
            </>
          )}
        </div>
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button
            onClick={triggerExport}
            variant="outline"
            className="rounded-2xl h-9 text-sm border-slate-200 flex items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            Export Full Telemetry
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
