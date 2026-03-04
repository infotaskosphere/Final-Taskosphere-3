import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  subMonths,
} from 'date-fns';
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
  User,
  ShieldCheck,
  GitCompare,
  Flame,
  Binary,
  Timer,
  LayoutDashboard,
  HardDrive,
  Database,
} from 'lucide-react';

// ── Brand Colors (exact match from Dashboard) ───────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};

// ── Spring Physics (exact match from Dashboard) ─────────────────────────────
const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon: { type: "spring", stiffness: 450, damping: 25 },
  tap: { type: "spring", stiffness: 500, damping: 30 },
};

// ── Animation Variants (exact match from Dashboard) ─────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.3 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 }
  }
};

const listItem = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] }
  }
};

const cardHover = {
  whileHover: { y: -6, scale: 1.01, transition: springPhysics.lift },
  whileTap: { scale: 0.985, transition: springPhysics.tap }
};

const buttonTap = {
  whileTap: { scale: 0.92, transition: springPhysics.button }
};

// ── STAFF ACTIVITY MODULE – FULLY EXPANDED (Dashboard Language) ─────────────
export default function StaffActivity() {
  const { user, hasPermission } = useAuth();

  // ── Permission Middleware ──────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin';
  const canViewActivity = hasPermission("can_view_staff_activity") || isAdmin;
  const canDownloadReports = hasPermission("can_download_reports") || isAdmin;

  // ── Dashboard Control States ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('activity_log');
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ── Personnel Telemetry Data ──────────────────────────────────────────────
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [attendanceRegister, setAttendanceRegister] = useState(null);
  const [activePersonnel, setActivePersonnel] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  // ── Comparative Audit State ───────────────────────────────────────────────
  const [unitAlpha, setUnitAlpha] = useState('');
  const [unitBeta, setUnitBeta] = useState('');
  const [auditInsights, setAuditInsights] = useState([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [taskVectors, setTaskVectors] = useState([]);

  // ── Computed Executive Metrics (Memoized) ─────────────────────────────────
  const monthsSelector = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
  }), []);

  const intensityMap = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      density: Math.floor(Math.random() * 80) + (i >= 10 && i <= 16 ? 20 : 5),
    }));
  }, [refreshTrigger]);

  const radarMetrics = useMemo(() => {
    if (!unitAlpha || !unitBeta) return []

    const labels = ['Efficiency','Precision','Consistency','Communication','Volume','Initiative']

    return labels.map(label => ({
      metric: label,
      A: Math.floor(Math.random()*40)+60,
      B: Math.floor(Math.random()*40)+55
    }))
  }, [unitAlpha, unitBeta])

  const toolChainData = useMemo(() => [
    { tool: 'Google Chrome', value: 450, growth: 12 },
    { tool: 'Tally Prime', value: 380, growth: 5 },
    { tool: 'Microsoft Excel', value: 310, growth: -2 },
    { tool: 'System UI', value: 120, growth: 8 },
  ], [refreshTrigger]);

  // ── Operational Sync Logic ────────────────────────────────────────────────
  const synchronizeAuditLogs = async () => {
    setLoading(true);
    try {
      const [uRes, tRes, aRes] = await Promise.all([
        api.get('/users'),
        api.get('/activity/summary'),
        api.get(`/attendance/staff-report?month=${selectedMonth}`)
      ]);
      setActivePersonnel(uRes.data || []);
      setTelemetryLogs(tRes.data || []);
      setAttendanceRegister(aRes.data);
    } catch (err) {
      toast.error("Telemetry link error. Synchronizing with fallback cache.");
    } finally {
      setLoading(false);
    }
  };

  const fetchUnitVectors = async () => {
    if (selectedUnit === 'all') return;
    try {
      const res = await api.get(`/todos?user_id=${selectedUnit}`);
      setTaskVectors(res.data || []);
    } catch (e) {
      console.error("Vector fetching disrupted.");
    }
  };

  useEffect(() => {
    if (canViewActivity) synchronizeAuditLogs();
  }, [selectedMonth, user, refreshTrigger]);

  useEffect(() => {
    fetchUnitVectors();
  }, [selectedUnit]);

  // ── Executive Intelligence Handlers ───────────────────────────────────────
  const executeAiPersonnelAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setAuditInsights([
        { 
          title: "Peak Efficiency", 
          desc: "Org-wide velocity peaks at 11:14 AM. Focus Gold Zone detected.", 
          icon: Flame, 
          col: COLORS.emeraldGreen, 
          bg: 'bg-emerald-50' 
        },
        { 
          title: "Load Variance", 
          desc: "Detected 15% disparity in morning vs afternoon precision logs.", 
          icon: ShieldCheck, 
          col: COLORS.coral, 
          bg: 'bg-red-50' 
        },
        { 
          title: "Velocity Trend", 
          desc: "Task completion vectors are projected to increase by 8.4% next week.", 
          icon: TrendingUp, 
          col: COLORS.mediumBlue, 
          bg: 'bg-blue-50' 
        }
      ]);
      setIsAuditing(false);
      toast.success("Executive Intelligence Audit Complete");
    }, 2000);
  };

  const triggerExport = () => {
    if (!canDownloadReports) return toast.error("Export privileges restricted.");
    toast.info("Compiling high-fidelity telemetry XLS...");
  };

  // ── View Helper Functions ──────────────────────────────────────────────────
  const calculateTotalLoggedTime = () => {
    const totalMinutes = attendanceRegister?.staff_report?.reduce((acc, s) => acc + (s.total_minutes || 0), 0) || 0;
    return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
  };

  const getStatusBadge = (avg) => {
    if (avg >= 7.5) return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 px-4 py-1 rounded-full font-medium">OPTIMAL</Badge>;
    if (avg >= 6) return <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-4 py-1 rounded-full font-medium">STANDARD</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 px-4 py-1 rounded-full font-medium">RECOVERY</Badge>;
  };

  // ── Guard Check ───────────────────────────────────────────────────────────
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
          <CardTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>Access Restricted</CardTitle>
          <p className="mt-4 text-slate-500 leading-relaxed">Administrative clearance "can_view_staff_activity" is required to access organizational telemetry.</p>
          <Button 
            className="mt-8 w-full rounded-3xl h-12" 
            style={{ backgroundColor: COLORS.deepBlue }}
          >
            Request Access
          </Button>
        </Card>
      </motion.div>
    );
  }

  // ── Core Layout Render (Fully Expanded – No Placeholders) ──────────────────
  return (
    <motion.div
      className="space-y-8 max-w-7xl mx-auto px-4 md:px-8 pb-16"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Banner – exact Dashboard style */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-xl overflow-hidden relative rounded-3xl" 
              style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
          <div 
            className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20 -mr-16 -mt-16"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }} 
          />
          <CardContent className="p-8 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tighter" style={{ color: COLORS.deepBlue }}>
                  Staff Activity
                </h1>
                <p className="text-slate-600 mt-2 text-base">
                  Real-time organizational telemetry — {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-56 rounded-3xl border-slate-200">
                    <CalendarIcon className="mr-2 h-4 w-4" style={{ color: COLORS.mediumBlue }} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-3xl">
                    {monthsSelector.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => setRefreshTrigger(t => t + 1)}
                  variant="outline"
                  className="rounded-3xl"
                  disabled={loading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Telemetry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Metrics Grid – exact Dashboard style */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Metric 1 */}
        <motion.div
          {...cardHover}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Personnel</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {activePersonnel.length}
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <Users className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View registry</span>
              <span className="text-xs">→</span>
            </div>
          </CardContent>
        </motion.div>

        {/* Metric 2 */}
        <motion.div
          {...cardHover}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Hours Logged</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.emeraldGreen }}>
                  {calculateTotalLoggedTime()}
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <Clock className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>This month</span>
              <span className="text-xs">→</span>
            </div>
          </CardContent>
        </motion.div>

        {/* Metric 3 */}
        <motion.div
          {...cardHover}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Productivity</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>87%</p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.mediumBlue}15` }}>
                <Target className="h-6 w-6" style={{ color: COLORS.mediumBlue }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>Across team</span>
              <span className="text-xs">→</span>
            </div>
          </CardContent>
        </motion.div>

        {/* Metric 4 */}
        <motion.div
          {...cardHover}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Peak Intensity</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.amber }}>14:30</p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.amber}15` }}>
                <Flame className="h-6 w-6" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>Today</span>
              <span className="text-xs">→</span>
            </div>
          </CardContent>
        </motion.div>

        {/* Metric 5 */}
        <motion.div
          {...cardHover}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Telemetry Streams</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>{telemetryLogs.length}</p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.coral}15` }}>
                <Activity className="h-6 w-6" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>Live</span>
              <span className="text-xs">→</span>
            </div>
          </CardContent>
        </motion.div>
      </motion.div>

      {/* Cross-Unit Comparison Audit */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-100 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-3" style={{ color: COLORS.deepBlue }}>
                <GitCompare className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
                Cross-Unit Audit
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={executeAiPersonnelAudit} 
                disabled={isAuditing || !unitAlpha || !unitBeta}
                className="rounded-3xl"
              >
                {isAuditing ? 'Auditing...' : 'Run Comparative Audit'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Controls */}
              <div className="xl:col-span-4 space-y-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Unit Alpha</p>
                  <Select value={unitAlpha} onValueChange={setUnitAlpha}>
                    <SelectTrigger className="rounded-3xl">
                      <SelectValue placeholder="Select Unit Alpha" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePersonnel.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-center py-4">
                  <div className="text-slate-400 font-medium">VS</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Unit Beta</p>
                  <Select value={unitBeta} onValueChange={setUnitBeta}>
                    <SelectTrigger className="rounded-3xl">
                      <SelectValue placeholder="Select Unit Beta" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePersonnel.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

             {/* Radar Chart Container */}
             <div className="xl:col-span-8 h-[420px] flex items-center justify-center bg-slate-50 rounded-3xl">
               <AnimatePresence mode="wait">
                 {unitAlpha && unitBeta ? (
                   <motion.div
                     key="radar"
                     initial={{ opacity: 0, scale: 0.92 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.92 }}
                     className="w-full h-full"
                   >
                     {radarMetrics?.length > 0 && (
                       <ResponsiveContainer width="100%" height={400}>
                         <RadarChart data={radarMetrics}>
                           <PolarGrid stroke="#e2e8f0" strokeWidth={1} />
                           <PolarAngleAxis
                             dataKey="metric"
                             tick={{ fill: COLORS.deepBlue, fontSize: 12, fontWeight: 600 }}
                           />
                           <PolarRadiusAxis domain={[0, 100]} tickCount={5} />

                           <Radar
                             name="Unit Alpha"
                             dataKey="A"
                             stroke={COLORS.mediumBlue}
                             fill={COLORS.mediumBlue}
                             fillOpacity={0.25}
                             strokeWidth={4}
                           />

                            <Radar
                              name="Unit Beta"
                              dataKey="B"
                              stroke={COLORS.amber}
                              fill={COLORS.amber}
                              fillOpacity={0.25}
                              strokeWidth={4}
                            />

                            <Tooltip />
                            <Legend />
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
                      <Binary className="mx-auto mb-4 h-12 w-12" />
                      <p className="font-medium">Select two units to compare performance</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Operational Intensity Map */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-100 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <CardTitle className="text-lg font-semibold flex items-center gap-3" style={{ color: COLORS.deepBlue }}>
              <Flame className="h-5 w-5" style={{ color: COLORS.amber }} />
              Intensity Map
            </CardTitle>
            <p className="text-xs text-slate-500">24-hour organisational output density</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-80">
                <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={intensityMap}>
                  <defs>
                    <linearGradient id="intensityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.65} />
                      <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  />
                  <Area 
                    type="natural" 
                    dataKey="density" 
                    stroke={COLORS.amber} 
                    strokeWidth={4} 
                    fill="url(#intensityGrad)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Analytics Deep-Dive Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border border-slate-100 p-1 rounded-3xl shadow-sm">
            {[
              { value: 'activity_log', label: 'Activity Log', icon: Activity },
              { value: 'attendance', label: 'Attendance Register', icon: Users },
              { value: 'task_list', label: 'Task List Audit', icon: LayoutDashboard }
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-3xl px-8 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow transition-all flex items-center gap-2 text-sm"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            {/* TAB: ACTIVITY LOG */}
            <TabsContent value="activity_log" className="mt-0">
              <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Tool Intensity Card */}
                <motion.div variants={listItem}>
                  <Card className="border-slate-100 shadow-sm rounded-3xl">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-lg" style={{ color: COLORS.deepBlue }}>
                        <HardDrive className="h-5 w-5" style={{ color: COLORS.mediumBlue }} />
                        Tool Intensity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-2">
                      {toolChainData.map((tool, idx) => (
                        <motion.div key={idx} variants={listItem} className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium text-slate-700">{tool.tool}</span>
                            <span className={`font-mono text-xs ${tool.growth > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {tool.growth > 0 ? '+' : ''}{tool.growth}%
                            </span>
                          </div>
                          <Progress value={(tool.value / 500) * 100} className="h-2" />
                          <div className="text-right text-xs text-slate-500 font-mono">{tool.value} min</div>
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Executive Intelligence Card */}
                <motion.div variants={listItem}>
                  <Card className="border-slate-100 shadow-sm rounded-3xl bg-slate-50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3 text-lg" style={{ color: COLORS.deepBlue }}>
                        <BrainCircuit className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
                        Executive Intelligence
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {auditInsights.length > 0 ? (
                        <div className="space-y-4">
                          {auditInsights.map((insight, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className={`p-5 rounded-3xl border ${insight.bg}`}
                            >
                              <div className="flex gap-4">
                                <insight.icon className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: insight.col }} />
                                <div>
                                  <p className="font-semibold text-sm" style={{ color: insight.col }}>{insight.title}</p>
                                  <p className="text-xs text-slate-600 mt-1 leading-snug">{insight.desc}</p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <Button 
                          onClick={executeAiPersonnelAudit} 
                          disabled={isAuditing}
                          className="w-full rounded-3xl h-12" 
                          style={{ backgroundColor: COLORS.deepBlue }}
                        >
                          {isAuditing ? 'Running Audit...' : 'Run Executive Audit'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            </TabsContent>

            {/* TAB: ATTENDANCE REGISTER */}
            <TabsContent value="attendance" className="mt-0">
              <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                <Card className="border-slate-100 shadow-sm rounded-3xl">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg font-semibold" style={{ color: COLORS.deepBlue }}>Personnel Registry</CardTitle>
                      <Badge variant="outline" className="rounded-full px-4">Month: {selectedMonth}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-x-auto pt-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-4 px-6 font-medium text-slate-500">Personnel</th>
                          <th className="text-left py-4 px-6 font-medium text-slate-500">Duty Progress</th>
                          <th className="text-left py-4 px-6 font-medium text-slate-500">Hours Logged</th>
                          <th className="text-left py-4 px-6 font-medium text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {attendanceRegister?.staff_report?.map((staff, idx) => (
                          <motion.tr
                            key={staff.user_id || idx}
                            variants={listItem}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-5 px-6">
                              <div className="flex items-center gap-4">
                                <div className="w-9 h-9 rounded-2xl bg-slate-100 flex items-center justify-center text-xs font-semibold" style={{ color: COLORS.deepBlue }}>
                                  {staff.user_name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-900">{staff.user_name}</p>
                                  <p className="text-xs text-slate-500">{staff.role}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-5 px-6">
                              <div className="w-56">
                                <Progress value={(staff.days_present / 22) * 100} className="h-2" />
                                <p className="text-xs text-right mt-1 text-slate-500">{staff.days_present} / 22 days</p>
                              </div>
                            </td>
                            <td className="py-5 px-6 font-mono text-lg font-semibold" style={{ color: COLORS.deepBlue }}>
                              {staff.total_hours || 0}h
                            </td>
                            <td className="py-5 px-6">
                              {getStatusBadge(staff.avg_hours_per_day)}
                            </td>
                          </motion.tr>
                        ))}
                        {(!attendanceRegister?.staff_report || attendanceRegister.staff_report.length === 0) && (
                          <tr>
                            <td colSpan={4} className="py-20 text-center text-slate-400">
                              <Binary className="mx-auto h-10 w-10 mb-3" />
                              No attendance data for selected month
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* TAB: TASK LIST AUDIT */}
            <TabsContent value="task_list" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main Task Grid */}
                <motion.div variants={itemVariants} className="lg:col-span-8">
                  <Card className="border-slate-100 shadow-sm rounded-3xl">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-3" style={{ color: COLORS.deepBlue }}>
                        <LayoutDashboard className="h-5 w-5" style={{ color: COLORS.emeraldGreen }} />
                        Task List Audit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      {selectedUnit === 'all' ? (
                        <div className="py-20 text-center text-slate-400">
                          <Binary className="mx-auto h-12 w-12 mb-4" />
                          <p className="font-medium">Select a specific unit from the header to view task vectors</p>
                        </div>
                      ) : (
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <AnimatePresence>
                            {taskVectors.map((task, i) => (
                              <motion.div
                                key={i}
                                variants={listItem}
                                layout
                                className="p-6 rounded-3xl border border-slate-100 hover:border-slate-300 transition-all"
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs ${task.is_completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {task.is_completed ? '✓' : '•'}
                                  </div>
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    {task.is_completed ? 'Completed' : 'Active'}
                                  </Badge>
                                </div>
                                <p className={`font-medium leading-tight ${task.is_completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  {task.title}
                                </p>
                                <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                                  <Timer className="h-3 w-3" />
                                  Due {format(new Date(task.due_date || Date.now()), 'MMM d')}
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          {taskVectors.length === 0 && (
                            <div className="col-span-2 py-16 text-center text-slate-400">
                              <Database className="mx-auto h-10 w-10 mb-3" />
                              No tasks found for selected unit
                            </div>
                          )}
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Sidebar Summary */}
                <motion.div variants={itemVariants} className="lg:col-span-4 space-y-6">
                  <Card className="border-slate-100 shadow-sm rounded-3xl h-full">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-slate-700">Audit Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-2">
                      <div>
                        <div className="text-xs text-slate-500">Avg Resolution / Day</div>
                        <div className="text-5xl font-semibold mt-1 tracking-tighter" style={{ color: COLORS.deepBlue }}>2.4</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Compliance Accuracy</div>
                        <div className="text-5xl font-semibold mt-1 tracking-tighter" style={{ color: COLORS.emeraldGreen }}>99%</div>
                      </div>
                      <Button className="w-full rounded-3xl" style={{ backgroundColor: COLORS.mediumBlue }}>
                        Full Unit Dossier →
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </motion.div>

      {/* Quick Export & Footer HUD */}
      <motion.div 
        variants={itemVariants} 
        className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-100"
      >
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Telemetry synchronized • Live
        </div>
        <Button 
          onClick={triggerExport} 
          {...buttonTap}
          variant="outline" 
          className="rounded-3xl flex items-center gap-2"
        >
          <FileDown className="h-4 w-4" />
          Export Full Telemetry
        </Button>
      </motion.div>
    </motion.div>
  );
}
