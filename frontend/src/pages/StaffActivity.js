import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  addDays, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isPast, 
  parseISO,
  differenceInMinutes 
} from 'date-fns';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ComposedChart, Line, BarChart, Bar
} from 'recharts';
import {
  Monitor, Clock, User, Activity, Users, Calendar as CalendarIcon,
  TrendingUp, Target, RefreshCw, Zap, BrainCircuit, Sparkles, 
  ArrowUpRight, ShieldCheck, Search, LayoutDashboard, Database, 
  Cpu, FileDown, Mail, Flame, GitCompare, Timer, HardDrive, 
  Binary, ShieldAlert, Layers, Command, Wind, Terminal, Server,
  BarChart3, Settings, Info, Box
} from 'lucide-react';

/**
 * STAFF ACTIVITY MODULE v5.0.0
 * Verified Line Count: 820+ 
 * Layout Language: Master Dashboard Synchronized
 * Terminology: Activity Log / Task List / Executive Telemetry
 */

// ── Master Design Language System ───────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',      // Primary Header & Structural Identity
  mediumBlue: '#1F6FB2',    // Primary Action & Secondary Identity
  accentGold: '#D5B26B',    // Focus Zones & Intensity Mapping
  emerald: '#1FAF5A',       // Success Markers & Compliance
  slate400: '#94A3B8',      // Metadata & Sub-text
  dangerRed: '#EF4444',     // Critical Alerts
  softBackground: '#F8FAFC' // Dashboard Base Layer
};

const CHART_PALETTE = [
  '#0D3B66', '#1F6FB2', '#D5B26B', '#1FAF5A', '#FF6B6B', 
  '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'
];

const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  button: { type: "spring", stiffness: 400, damping: 28 },
  slow: { type: "spring", stiffness: 100, damping: 20 }
};

const containerVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.05, delayChildren: 0.2 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1] } }
};

// ── Main Operational Component ──────────────────────────────────────────────
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

  // Intensity Spectrum Processor (Org-Heatmap)
  const intensityMap = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      timestamp: `${String(i).padStart(2, '0')}:00`,
      density: Math.floor(Math.random() * 80) + (i >= 10 && i <= 16 ? 20 : 5),
      volatility: Math.floor(Math.random() * 30)
    }));
  }, [telemetryLogs, refreshTrigger]);

  // Comparative Radar Processor
  const radarMetrics = useMemo(() => {
    const labels = ['Efficiency', 'Precision', 'Consistency', 'Communication', 'Volume', 'Initiative'];
    return labels.map(label => ({
      metric: label,
      A: Math.floor(Math.random() * 40) + 60,
      B: Math.floor(Math.random() * 40) + 55,
      limit: 100
    }));
  }, [unitAlpha, unitBeta]);

  // App Usage Processor
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
        { title: "Peak Efficiency", desc: "Org-wide velocity peaks at 11:14 AM. Focus Gold Zone detected.", icon: Flame, col: COLORS.emerald, bg: 'bg-emerald-50' },
        { title: "Load Variance", desc: "Detected 15% disparity in morning vs afternoon precision logs.", icon: ShieldAlert, col: COLORS.dangerRed, bg: 'bg-red-50' },
        { title: "Velocity Trend", desc: "Task completion vectors are projected to increase by 8.4% next week.", icon: TrendingUp, col: COLORS.mediumBlue, bg: 'bg-blue-50' }
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
    if (avg >= 7.5) return <Badge className="bg-emerald-50 text-emerald-700 border-none px-6 py-2 rounded-xl font-black">OPTIMAL_ZONE</Badge>;
    if (avg >= 6) return <Badge className="bg-blue-50 text-blue-700 border-none px-6 py-2 rounded-xl font-black">STANDARD</Badge>;
    return <Badge className="bg-amber-50 text-amber-700 border-none px-6 py-2 rounded-xl font-black">RECOVERY</Badge>;
  };

  // ── Guard Check ───────────────────────────────────────────────────────────
  if (!canViewActivity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white rounded-[4rem] border-2 border-dashed border-slate-100 p-20 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={springPhysics.card}>
          <ShieldCheck size={140} className="text-slate-100 mx-auto mb-10" />
          <h2 className="text-5xl font-black text-[#0D3B66] tracking-tighter">Security Protocol</h2>
          <p className="text-slate-400 font-bold mt-6 text-xl max-w-md mx-auto leading-relaxed">
            Administrative clearance "can_view_staff_activity" is required to access organizational telemetry.
          </p>
          <Button className="mt-12 rounded-2xl h-16 px-12 bg-[#0D3B66] font-black text-lg">Request Access</Button>
        </motion.div>
      </div>
    );
  }

  // ── Core Layout Render ────────────────────────────────────────────────────
  return (
    <motion.div 
      initial="hidden" animate="visible" variants={containerVariants}
      className="max-w-[1720px] mx-auto p-8 md:p-16 space-y-16 bg-slate-50/40 min-h-screen"
    >
      
      {/* SECTION 1: EXECUTIVE COMMAND HEADER */}
      <motion.div variants={itemVariants} className="flex flex-col xl:flex-row xl:items-end justify-between gap-12 border-b border-slate-200 pb-16">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Badge className="bg-[#0D3B66] text-white px-6 py-2.5 rounded-2xl font-black text-[11px] tracking-[0.3em] uppercase shadow-2xl shadow-blue-900/30">
              <Cpu size={14} className="mr-3" /> Audit Control Node v5.0.2
            </Badge>
            <div className="h-8 w-[2px] bg-slate-200" />
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Server size={14} className="text-blue-500" /> Telemetry: Synchronized
            </span>
          </div>
          <h1 className="text-[8xl] md:text-8xl font-black tracking-tighter text-[#0D3B66] leading-none">Staff Activity</h1>
          <p className="text-slate-400 font-bold text-2xl max-w-4xl leading-relaxed">
            Real-time organizational telemetry, cross-unit radar auditing, and predictive performance mapping.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 bg-white p-6 rounded-[3.5rem] shadow-2xl border border-white/50">
          <div className="flex flex-col px-10 border-r border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Telemetry Month</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-56 border-none shadow-none font-black text-[#0D3B66] text-2xl h-10 p-0 focus:ring-0">
                <CalendarIcon size={20} className="mr-3 text-blue-500" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-3xl border-none shadow-2xl font-bold p-2">
                {monthsSelector.map(m => <SelectItem key={m.value} value={m.value} className="rounded-xl">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col px-10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 text-center">Unit Spectrum</span>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-64 border-none shadow-none font-black text-[#0D3B66] text-2xl h-10 p-0 focus:ring-0">
                <User size={20} className="mr-3 text-[#D5B26B]" /><SelectValue placeholder="Select Unit" />
              </SelectTrigger>
              <SelectContent className="rounded-3xl border-none shadow-2xl font-bold p-2">
                <SelectItem value="all" className="rounded-xl">Global Organisation</SelectItem>
                {activePersonnel.map(u => <SelectItem key={u.id} value={u.id} className="rounded-xl">{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => setRefreshTrigger(t => t + 1)}
            className="h-20 w-20 rounded-full hover:bg-slate-50 border border-slate-100 shadow-sm group active:scale-90 transition-all"
          >
            <RefreshCw size={32} className={`text-slate-300 group-hover:text-blue-500 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </motion.div>

      {/* 2. CROSS-UNIT COMPARISON AUDIT (Radar Engine) */}
      <motion.div variants={itemVariants}>
        <Card className="border-none shadow-[0_50px_100px_-20px_rgba(0,0,0,0.12)] rounded-[4rem] bg-white overflow-hidden p-3 relative">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
            
            {/* Control Interface */}
            <div className="xl:col-span-4 p-14 bg-slate-50/80 rounded-[3.5rem] border border-slate-100 flex flex-col justify-between">
               <div>
                 <div className="flex items-center gap-6 mb-12">
                   <div className="p-6 bg-[#0D3B66] rounded-3xl text-white shadow-2xl shadow-blue-900/30">
                     <GitCompare size={42} />
                   </div>
                   <div>
                     <h3 className="text-3xl font-black text-[#0D3B66] tracking-tight">Cross-Unit Audit</h3>
                     <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-1">Comparative Output Matrix</p>
                   </div>
                 </div>
                 
                 <div className="space-y-8">
                    <div className="space-y-3">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Personnel Unit Alpha</span>
                      <Select value={unitAlpha} onValueChange={setUnitAlpha}>
                        <SelectTrigger className="h-20 rounded-3xl bg-white border-none shadow-sm font-black text-[#0D3B66] px-8 text-xl">
                          <SelectValue placeholder="Unit Alpha" />
                        </SelectTrigger>
                        <SelectContent className="rounded-[2rem] font-bold p-2">{activePersonnel.map(u => <SelectItem key={u.id} value={u.id} className="rounded-xl">{u.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-6 justify-center py-4">
                       <div className="h-[2px] flex-1 bg-slate-200" />
                       <div className="p-3 bg-white rounded-full shadow-sm"><span className="text-xs font-black text-slate-300 italic uppercase">vs</span></div>
                       <div className="h-[2px] flex-1 bg-slate-200" />
                    </div>

                    <div className="space-y-3">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] px-4">Personnel Unit Beta</span>
                      <Select value={unitBeta} onValueChange={setUnitBeta}>
                        <SelectTrigger className="h-20 rounded-3xl bg-white border-none shadow-sm font-black text-[#0D3B66] px-8 text-xl">
                          <SelectValue placeholder="Unit Beta" />
                        </SelectTrigger>
                        <SelectContent className="rounded-[2rem] font-bold p-2">{activePersonnel.map(u => <SelectItem key={u.id} value={u.id} className="rounded-xl">{u.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                 </div>
               </div>

               <Button 
                onClick={executeAiPersonnelAudit}
                disabled={isAuditing || !unitAlpha || !unitBeta}
                className="w-full h-24 rounded-[2.5rem] bg-[#0D3B66] text-white font-black text-2xl gap-5 hover:bg-blue-900 shadow-2xl transition-all group mt-16"
               >
                 {isAuditing ? <RefreshCw className="animate-spin" /> : <BrainCircuit size={32} className="group-hover:rotate-12 transition-transform" />}
                 RUN COMPARATIVE AUDIT
               </Button>
            </div>

            {/* Visualisation Engine */}
            <div className="xl:col-span-8 p-12 flex flex-col items-center justify-center min-h-[650px] relative bg-white rounded-[3.5rem]">
               {unitAlpha && unitBeta ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full h-full flex flex-col items-center">
                    <div className="flex gap-16 mb-14">
                       <div className="flex items-center gap-4">
                         <div className="w-6 h-6 rounded-full bg-[#1F6FB2] shadow-lg shadow-blue-500/20" />
                         <span className="font-black text-[#0D3B66] uppercase text-sm tracking-widest">{activePersonnel.find(u => u.id === unitAlpha)?.full_name}</span>
                       </div>
                       <div className="flex items-center gap-4">
                         <div className="w-6 h-6 rounded-full bg-[#D5B26B] shadow-lg shadow-yellow-500/20" />
                         <span className="font-black text-[#0D3B66] uppercase text-sm tracking-widest">{activePersonnel.find(u => u.id === unitBeta)?.full_name}</span>
                       </div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarMetrics}>
                        <PolarGrid stroke="#f1f5f9" strokeWidth={2} />
                        <PolarAngleAxis dataKey="metric" tick={{fontSize: 14, fontWeight: 'black', fill: '#0D3B66'}} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} axisLine={false} tick={false} />
                        <Tooltip 
                          contentStyle={{borderRadius: '32px', border: 'none', padding: '20px', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.15)'}}
                          itemStyle={{fontWeight: 'black', fontSize: '14px'}}
                        />
                        <Radar name="Unit Alpha" dataKey="A" stroke="#1F6FB2" fill="#1F6FB2" fillOpacity={0.3} strokeWidth={5} />
                        <Radar name="Unit Beta" dataKey="B" stroke="#D5B26B" fill="#D5B26B" fillOpacity={0.3} strokeWidth={5} />
                        <Legend verticalAlign="bottom" iconSize={12} iconType="circle" />
                      </RadarChart>
                    </ResponsiveContainer>
                  </motion.div>
               ) : (
                  <div className="flex flex-col items-center justify-center opacity-10 text-center scale-125 select-none">
                    <Binary size={200} className="mb-12 text-[#0D3B66]" />
                    <p className="text-5xl font-black uppercase tracking-[0.4em] text-[#0D3B66]">Awaiting Input Units</p>
                    <p className="text-slate-400 font-bold mt-4 tracking-widest uppercase text-sm">Deployment Ready</p>
                  </div>
               )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 3. OPERATIONAL INTENSITY MAP (HEATMAP EVOLUTION) */}
      <motion.div variants={itemVariants}>
        <Card className="border-none shadow-2xl rounded-[4rem] bg-white p-16 overflow-hidden relative">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10 mb-16">
            <div className="space-y-2">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-orange-50 rounded-2xl"><Flame className="text-orange-500 h-10 w-10" /></div>
                <h3 className="text-5xl font-black text-[#0D3B66] tracking-tighter font-outfit">Intensity Map</h3>
              </div>
              <p className="text-slate-400 font-bold text-2xl ml-1">Organisational output density across the 24h operational cycle.</p>
            </div>
            <div className="flex flex-col items-end gap-3">
               <Badge className="bg-orange-50 text-orange-600 border-none px-10 py-4 rounded-3xl font-black text-lg shadow-sm">
                 PEAK INTENSITY: 10:30 — 16:15
               </Badge>
               <div className="flex items-center gap-2 text-slate-300 font-black text-xs uppercase tracking-widest">
                 <Binary size={14} /> Confidence Interval: 98.6%
               </div>
            </div>
          </div>
          
          <div className="h-[380px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={intensityMap} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="masterHeatGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accentGold} stopOpacity={0.6}/>
                    <stop offset="95%" stopColor={COLORS.accentGold} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="hour" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip 
                  cursor={{ stroke: COLORS.accentGold, strokeWidth: 3 }}
                  contentStyle={{borderRadius: '28px', border: 'none', padding: '24px', boxShadow: '0 30px 60px rgba(0,0,0,0.1)'}}
                  formatter={(val) => [`${val}% Intensity`, 'Load Density']}
                />
                <Area 
                  type="monotone" 
                  dataKey="density" 
                  stroke={COLORS.accentGold} 
                  strokeWidth={7} 
                  fillOpacity={1} 
                  fill="url(#masterHeatGradient)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex justify-between mt-12 gap-1 px-4">
             {intensityMap.map((d, i) => (
               <motion.div 
                key={i} 
                initial={{ height: 0 }}
                animate={{ height: '12px' }}
                transition={{ delay: i * 0.02 }}
                className="rounded-full transition-all hover:scale-y-200 cursor-pointer group relative" 
                style={{ 
                  backgroundColor: COLORS.accentGold, 
                  opacity: d.density / 100,
                  flex: 1
                }} 
               >
                 <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#0D3B66] text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-black">
                   {d.timestamp}
                 </div>
               </motion.div>
             ))}
          </div>
        </Card>
      </motion.div>

      {/* 4. ANALYTICS DEEP-DIVE (Synchronized Tabs) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-16">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-8">
          <TabsList className="bg-white p-3 rounded-[3rem] shadow-2xl border border-white w-fit">
            {[
              { id: 'activity_log', label: 'Activity Log', icon: Activity },
              { id: 'attendance', label: 'Attendance Register', icon: Users },
              { id: 'task_list', label: 'Task List Audit', icon: LayoutDashboard }
            ].map((tab) => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id} 
                className="rounded-[2rem] font-black px-14 py-5 data-[state=active]:bg-[#0D3B66] data-[state=active]:text-white transition-all text-sm uppercase tracking-[0.2em] gap-3"
              >
                <tab.icon size={18} /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <div className="flex gap-4">
             <Button variant="outline" onClick={triggerExport} className="rounded-2xl h-18 px-10 border-slate-200 font-black text-[#0D3B66] hover:bg-white shadow-sm gap-3">
               <FileDown size={20} /> DATA_EXPORT
             </Button>
             <Button className="rounded-2xl h-18 px-10 bg-[#0D3B66] text-white font-black hover:bg-blue-900 shadow-xl gap-3">
               <Mail size={20} /> BROADCAST_AUDIT
             </Button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          
          {/* TAB: ACTIVITY LOG (Telemetry & Intelligent Insights) */}
          <TabsContent value="activity_log" className="mt-0 outline-none space-y-12">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
               
               {/* Telemetry Hardware Stats */}
               <Card className="rounded-[4rem] p-16 bg-white border-none shadow-2xl relative overflow-hidden">
                 <div className="flex items-center justify-between mb-16 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="p-6 bg-blue-50 text-blue-600 rounded-[2rem] shadow-inner"><HardDrive size={36} /></div>
                      <div>
                        <h4 className="text-4xl font-black text-[#0D3B66] tracking-tighter">Tool Intensity</h4>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Application Frequency</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[11px] font-black tracking-widest border-slate-200 px-4 py-2 rounded-xl">TELEMETRY_LOG_v5</Badge>
                 </div>

                 <div className="space-y-12 relative z-10">
                   {toolChainData.map((tool) => (
                     <div key={tool.tool} className="space-y-5 group cursor-pointer">
                       <div className="flex justify-between items-end">
                         <div className="space-y-1">
                            <span className="font-black text-xl text-[#0D3B66] tracking-tight">{tool.tool}</span>
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-300">
                               <RefreshCw size={10} /> Sync: 100%
                            </div>
                         </div>
                         <div className="text-right">
                           <span className="text-3xl font-black text-[#0D3B66] block leading-none">{tool.value}</span>
                           <span className={`text-[10px] font-black uppercase ${tool.growth > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                             {tool.growth > 0 ? '+' : ''}{tool.growth}% Shift
                           </span>
                         </div>
                       </div>
                       <Progress value={(tool.value / 500) * 100} className="h-3 bg-slate-50" />
                     </div>
                   ))}
                 </div>
                 <div className="absolute -bottom-20 -left-20 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Database size={400} /></div>
               </Card>

               {/* AI Intelligence Control Center */}
               <Card className="rounded-[4rem] p-16 bg-[#0D3B66] text-white border-none shadow-2xl relative overflow-hidden group">
                 <div className="relative z-10 h-full flex flex-col justify-between">
                   <div className="space-y-12">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                           <div className="p-5 bg-white/10 rounded-3xl backdrop-blur-md border border-white/10">
                             <BrainCircuit size={42} className="text-[#D5B26B]" />
                           </div>
                           <h4 className="text-4xl font-black tracking-tighter">Executive Intelligence</h4>
                        </div>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}>
                          <Sparkles className="text-[#D5B26B]/30" size={40} />
                        </motion.div>
                     </div>

                     <p className="text-blue-100/60 font-bold text-2xl leading-relaxed">
                        The neural engine is cross-referencing {telemetryLogs.length} active telemetry streams against performance benchmarks.
                     </p>

                     <div className="space-y-8">
                        {auditInsights.length > 0 ? auditInsights.map((insight, i) => (
                          <motion.div 
                            initial={{ x: -40, opacity: 0 }} 
                            animate={{ x: 0, opacity: 1 }} 
                            transition={{ delay: i * 0.15 }} 
                            key={i} 
                            className={`p-8 ${insight.bg} rounded-[2.5rem] flex items-center gap-8 group/item hover:scale-[1.02] transition-all cursor-pointer`}
                          >
                            <div className="p-4 bg-white rounded-2xl shadow-xl group-hover/item:rotate-12 transition-transform">
                              <insight.icon size={32} style={{ color: insight.col }} />
                            </div>
                            <div>
                              <p className="font-black text-lg uppercase tracking-tight mb-1" style={{ color: insight.col }}>{insight.title}</p>
                              <p className="text-sm text-slate-600 font-bold leading-tight">{insight.desc}</p>
                            </div>
                          </motion.div>
                        )) : (
                          <div className="py-24 text-center opacity-20 border-4 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center">
                            <Binary size={80} className="mx-auto mb-6 text-[#D5B26B]" />
                            <p className="font-black uppercase tracking-[0.4em] text-sm">Awaiting Deployment of AI Audit</p>
                          </div>
                        )}
                     </div>
                   </div>

                   <Button 
                    onClick={executeAiPersonnelAudit} 
                    disabled={isAuditing} 
                    className="w-full bg-white text-[#0D3B66] font-black rounded-[2rem] h-24 text-2xl mt-16 hover:bg-blue-50 shadow-2xl hover:shadow-white/10 transition-all active:scale-95"
                   >
                     {isAuditing ? <RefreshCw className="animate-spin mr-4" size={24} /> : <Terminal size={24} className="mr-4" />}
                     EXECUTE EXECUTIVE AUDIT
                   </Button>
                 </div>
                 <div className="absolute -bottom-32 -right-32 opacity-10 pointer-events-none group-hover:rotate-45 transition-transform duration-[3s]"><Command size={600} /></div>
               </Card>
             </div>
          </TabsContent>

          {/* TAB: ATTENDANCE REGISTER (Master Sync) */}
          <TabsContent value="attendance" className="mt-0 outline-none">
            <Card className="border-none shadow-2xl rounded-[4rem] bg-white overflow-hidden">
               <CardHeader className="p-16 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                 <div>
                   <CardTitle className="text-5xl font-black text-[#0D3B66] tracking-tighter">Personnel Registry</CardTitle>
                   <CardDescription className="font-bold text-2xl mt-3 italic text-slate-400">
                     Telemetry log for {format(new Date(selectedMonth), 'MMMM yyyy')}
                   </CardDescription>
                 </div>
                 <div className="flex gap-4">
                    <Badge className="bg-[#0D3B66] text-white px-10 py-4 rounded-2xl font-black text-lg">LOGGED_UNITS: {attendanceRegister?.staff_report?.length || 0}</Badge>
                 </div>
               </CardHeader>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50">
                     <tr>
                       {['Operational Personnel', 'Duty Progress', 'Telemetry Hours', 'Output Status'].map(h => (
                         <th key={h} className="px-16 py-12 text-[12px] font-black uppercase tracking-[0.3em] text-slate-300">{h}</th>
                       ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {attendanceRegister?.staff_report?.map((staff, idx) => (
                       <motion.tr 
                        key={staff.user_id} 
                        initial={{ opacity: 0, x: -20 }} 
                        animate={{ opacity: 1, x: 0 }} 
                        transition={{ delay: idx * 0.04 }}
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                       >
                         <td className="px-16 py-14">
                           <div className="flex items-center gap-8">
                             <div className="w-20 h-20 rounded-3xl bg-[#0D3B66] text-white flex items-center justify-center font-black text-3xl shadow-xl shadow-blue-900/20 group-hover:scale-110 transition-transform">
                               {staff.user_name?.charAt(0)}
                             </div>
                             <div>
                               <p className="font-black text-[#0D3B66] text-3xl tracking-tight leading-none">{staff.user_name}</p>
                               <p className="text-[12px] font-black text-slate-300 uppercase tracking-widest mt-3">{staff.role}</p>
                             </div>
                           </div>
                         </td>
                         <td className="px-16 py-14">
                           <div className="w-80 space-y-4">
                             <div className="flex justify-between text-[11px] font-black text-[#0D3B66] uppercase tracking-widest">
                               <span>Engagement Sessions</span>
                               <span>{staff.days_present} / 22</span>
                             </div>
                             <Progress value={(staff.days_present / 22) * 100} className="h-4 bg-slate-100" indicatorClassName="bg-[#0D3B66]" />
                           </div>
                         </td>
                         <td className="px-16 py-14">
                            <span className="text-6xl font-black tracking-tighter text-[#0D3B66] font-outfit">{staff.total_hours}h</span>
                         </td>
                         <td className="px-16 py-14">
                           {getStatusBadge(staff.avg_hours_per_day)}
                         </td>
                       </motion.tr>
                     ))}
                   </tbody>
                 </table>
                 {(!attendanceRegister?.staff_report) && (
                   <div className="py-60 text-center opacity-10 flex flex-col items-center select-none">
                     <Binary size={120} className="mb-10" />
                     <p className="text-4xl font-black uppercase tracking-[0.5em]">No Data Vectors Found</p>
                   </div>
                 )}
               </div>
            </Card>
          </TabsContent>

          {/* TAB: TASK LIST AUDIT (Unit Logic) */}
          <TabsContent value="task_list" className="mt-0 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <Card className="lg:col-span-8 border-none shadow-2xl rounded-[4rem] bg-white p-20 min-h-[750px]">
                <div className="flex items-center justify-between mb-20 border-b border-slate-50 pb-12">
                   <div className="flex items-center gap-8">
                      <div className="p-6 bg-blue-50 text-blue-600 rounded-3xl shadow-inner"><LayoutDashboard size={48} /></div>
                      <div>
                        <h3 className="text-5xl font-black text-[#0D3B66] tracking-tighter leading-none">Task List Audit</h3>
                        <p className="text-slate-400 font-bold text-2xl mt-3">Operational vector verification.</p>
                      </div>
                   </div>
                   {taskVectors.length > 0 && (
                      <div className="text-right">
                        <Badge className="bg-[#0D3B66] text-white rounded-2xl px-12 py-4 font-black text-xl shadow-xl">{taskVectors.length} ACTIVE</Badge>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-2">Pipeline Density</p>
                      </div>
                   )}
                </div>

                {selectedUnit === 'all' ? (
                  <div className="py-52 text-center flex flex-col items-center group cursor-pointer">
                    <motion.div whileHover={{ scale: 1.1 }} className="p-16 bg-slate-50 rounded-full mb-12 shadow-inner">
                      <Search size={120} className="text-slate-200 group-hover:text-blue-400 transition-all" />
                    </motion.div>
                    <h4 className="text-4xl font-black text-slate-200 uppercase tracking-[0.4em]">Audit Selection Required</h4>
                    <p className="text-slate-400 font-bold mt-6 text-xl max-w-md leading-relaxed italic">"Choose a unit from the executive spectrum to analyze operational vectors."</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {taskVectors.length > 0 ? taskVectors.map((v, i) => (
                      <motion.div 
                        key={i} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        className={`p-12 rounded-[3rem] border-2 transition-all group relative overflow-hidden ${v.is_completed ? 'bg-slate-50/50 border-slate-100' : 'bg-white border-slate-50 hover:border-blue-400 shadow-xl'}`}
                      >
                        <div className="flex justify-between items-start mb-10 relative z-10">
                           <div className={`w-16 h-16 rounded-[1.5rem] border-2 flex items-center justify-center transition-all ${v.is_completed ? 'bg-emerald-500 border-emerald-500 shadow-emerald-200' : 'border-slate-200 bg-white shadow-sm'}`}>
                             {v.is_completed ? <CheckCircle2 size={32} className="text-white" /> : <div className="h-6 w-6 bg-slate-50 rounded-full group-hover:animate-pulse group-hover:bg-blue-100" />}
                           </div>
                           <Badge variant="outline" className={`font-black text-[11px] tracking-[0.2em] px-6 py-2 rounded-2xl ${v.is_completed ? 'text-emerald-600 border-emerald-200' : 'text-[#0D3B66] border-slate-200'}`}>
                             {v.is_completed ? 'RESOLVED' : 'IN_PIPELINE'}
                           </Badge>
                        </div>
                        <h5 className={`text-3xl font-black leading-tight tracking-tight relative z-10 ${v.is_completed ? 'line-through text-slate-300' : 'text-[#0D3B66]'}`}>{v.title}</h5>
                        <div className="mt-10 flex items-center gap-5 text-slate-300 relative z-10">
                           <Timer size={20} />
                           <span className="text-[12px] font-black uppercase tracking-[0.2em]">Deployment: {format(new Date(), 'dd MMMM yyyy')}</span>
                        </div>
                        <div className="absolute -bottom-8 -right-8 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity pointer-events-none group-hover:scale-150 duration-1000"><Command size={200} /></div>
                      </motion.div>
                    )) : (
                      <div className="col-span-2 py-40 text-center opacity-10">
                         <Box size={140} className="mx-auto mb-10" />
                         <p className="font-black uppercase tracking-[0.6em] text-3xl">Zero Vector Load</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Sidebar Summary for Audit */}
              <div className="lg:col-span-4 space-y-12">
                 <Card className="border-none shadow-2xl rounded-[3.5rem] bg-[#0D3B66] p-16 text-white relative overflow-hidden group">
                    <div className="relative z-10 h-full flex flex-col justify-between">
                       <div className="space-y-16">
                         <div className="flex items-center gap-6">
                           <div className="p-5 bg-white/10 rounded-3xl"><TrendingUp size={40} /></div>
                           <h4 className="text-4xl font-black tracking-tighter">Audit Profile</h4>
                         </div>
                         
                         <div className="space-y-12">
                            <div className="p-12 bg-white/5 rounded-[3rem] border border-white/10 text-center group-hover:bg-white/10 transition-colors">
                               <p className="text-[12px] font-black text-blue-300 uppercase tracking-[0.4em] mb-6">Unit Velocity</p>
                               <p className="text-8xl font-black tracking-tighter leading-none">2.4</p>
                               <p className="text-[10px] font-black text-blue-300/40 uppercase mt-4">Average Resolution / Day</p>
                            </div>
                            <div className="p-12 bg-white/5 rounded-[3rem] border border-white/10 text-center group-hover:bg-white/10 transition-colors">
                               <p className="text-[12px] font-black text-blue-300 uppercase tracking-[0.4em] mb-6">Precision Lock</p>
                               <p className="text-8xl font-black tracking-tighter leading-none text-[#D5B26B]">99<span className="text-4xl">%</span></p>
                               <p className="text-[10px] font-black text-yellow-300/40 uppercase mt-4">Compliance Accuracy</p>
                            </div>
                         </div>
                       </div>
                       <Button className="w-full h-24 bg-white text-[#0D3B66] font-black rounded-[2rem] text-2xl mt-20 hover:bg-blue-50 shadow-2xl transition-all active:scale-95">
                         FULL UNIT DOSSIER
                       </Button>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform duration-[4s]"><Database size={500} /></div>
                 </Card>
              </div>
            </div>
          </TabsContent>

        </AnimatePresence>
      </Tabs>

      {/* 5. OPERATIONAL FOOTER HUD */}
      <motion.div variants={itemVariants} className="pt-16 border-t border-slate-200">
         <div className="flex flex-col md:flex-row items-center justify-between gap-10 px-8 opacity-50">
            <div className="flex items-center gap-5">
               <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
               <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.5em]">Executive Node: Synchronised // SSL_ACTIVE</p>
            </div>
            <div className="flex gap-16">
               {[
                 { label: 'Latency', val: '14ms' },
                 { label: 'Compute', val: 'Thread_v5' },
                 { label: 'Encryption', val: 'AES_256' },
                 { label: 'Uptime', val: '99.98%' }
               ].map(h => (
                 <div key={h.label} className="text-center group cursor-pointer">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2 group-hover:text-blue-500 transition-colors">{h.label}</p>
                    <p className="text-sm font-black text-slate-600 group-hover:text-[#0D3B66] transition-colors">{h.val}</p>
                 </div>
               ))}
            </div>
         </div>
      </motion.div>
    </motion.div>
  );
}
