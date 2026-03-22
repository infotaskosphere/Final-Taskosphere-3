import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  BarChart3, TrendingUp, Clock, Award, Users, CheckCircle2,
  AlertTriangle, Target, Download, RefreshCw, ChevronRight,
  Activity, Calendar, Star, Zap, Shield, FileText, ArrowUp,
  ArrowDown, Minus, Eye, Filter, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend, RadarChart,
  Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Brand palette ──────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  amber:        '#F59E0B',
  coral:        '#EF4444',
};
const CHART_PALETTE = ['#0D3B66', '#1F6FB2', '#1FAF5A', '#5CCB5F', '#F59E0B', '#EF4444'];

// ─── Animation variants ─────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.23, 1, 0.32, 1] } },
};

// ─── Custom tooltip ─────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="flex items-center gap-2" style={{ color: e.color }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: e.color }} />
          {e.name}: <span className="font-bold ml-1">{e.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── KPI Tile ───────────────────────────────────────────────────────────────
const KpiTile = ({ label, value, sub, color, icon: Icon, trend, loading }) => (
  <motion.div variants={itemVariants}>
    <Card className="rounded-xl border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="h-0.5 w-full" style={{ background: color }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            {loading ? (
              <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mt-1" />
            ) : (
              <p className="text-3xl font-bold" style={{ color }}>{value}</p>
            )}
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
        {trend != null && (
          <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-slate-400'}`}>
            {trend > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : trend < 0 ? <ArrowDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            {trend > 0 ? '+' : ''}{trend}% vs last week
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);

// ─── Section wrapper ─────────────────────────────────────────────────────────
const Section = ({ title, desc, children, action }) => (
  <motion.div variants={itemVariants}>
    <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.emeraldGreen})` }} />
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-800">{title}</CardTitle>
            {desc && <CardDescription className="text-xs mt-0.5">{desc}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  </motion.div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, text }) => (
  <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
      <Icon className="w-6 h-6 text-slate-300" />
    </div>
    <p className="text-sm font-medium">{text}</p>
  </div>
);

// ─── Performer card ───────────────────────────────────────────────────────────
const PerformerCard = ({ member, rank }) => {
  const isGold   = rank === 1;
  const isSilver = rank === 2;
  const isBronze = rank === 3;
  const medal    = isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : `#${rank}`;
  const gradient = isGold
    ? 'linear-gradient(135deg, #7B5A0A 0%, #C9920A 40%, #FFD700 100%)'
    : isSilver ? 'linear-gradient(135deg, #3A3A3A 0%, #707070 40%, #C0C0C0 100%)'
    : isBronze ? 'linear-gradient(135deg, #5C2E00 0%, #A0521A 40%, #CD7F32 100%)'
    : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`;

  const isPodium = isGold || isSilver || isBronze;

  return (
    <motion.div
      whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
      className="flex items-center justify-between p-3 rounded-xl transition-all hover:shadow-md cursor-default"
      style={{ background: gradient, border: isPodium ? 'none' : '1px solid #e2e8f0' }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${isPodium ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
          {medal}
        </div>
        <div className={`w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 ring-2 ${isGold ? 'ring-yellow-300/60' : isSilver ? 'ring-slate-300/60' : isBronze ? 'ring-orange-300/60' : 'ring-slate-200'}`}>
          {member.profile_picture
            ? <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-bold text-sm"
                style={{ background: isPodium ? 'rgba(0,0,0,0.25)' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`, color: 'white' }}>
                {member.user_name?.charAt(0)?.toUpperCase() || '?'}
              </div>}
        </div>
        <div className="min-w-0">
          <p className={`font-semibold text-sm leading-tight truncate max-w-[120px] ${isPodium ? 'text-white' : 'text-slate-800'}`}>
            {member.user_name || 'Unknown'}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPodium ? 'bg-black/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
              {member.overall_score}%
            </span>
            <span className={`text-[10px] truncate max-w-[70px] ${isPodium ? 'text-white/65' : 'text-slate-400'}`}>
              {member.badge || 'Good Performer'}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${isPodium ? 'text-white' : 'text-slate-700'}`}>
          {member.total_hours
            ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
            : '0h 0m'}
        </p>
        <p className={`text-[10px] ${isPodium ? 'text-white/55' : 'text-slate-400'}`}>total hrs</p>
      </div>
    </motion.div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function Reports() {
  const { user, hasPermission } = useAuth();

  const isAdmin            = user?.role === 'admin';
  const canViewReports     = isAdmin || hasPermission('can_view_reports');
  const canDownloadReports = isAdmin || hasPermission('can_download_reports');

  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks,          setTasks]          = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [attendance,     setAttendance]     = useState([]);
  const [allUsers,       setAllUsers]       = useState([]);
  const [starPerformers, setStarPerformers] = useState([]);
  const [rankingPeriod,  setRankingPeriod]  = useState('monthly');
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [activeTab,      setActiveTab]      = useState('overview');

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchAllData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get('/tasks'),
        api.get('/dashboard/stats'),
        api.get('/attendance/history'),
        isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
      ]);

      if (results[0].status === 'fulfilled') setTasks(results[0].value?.data || []);
      if (results[1].status === 'fulfilled') setDashboardStats(results[1].value?.data || null);
      if (results[2].status === 'fulfilled') setAttendance(results[2].value?.data || []);
      if (results[3].status === 'fulfilled') setAllUsers(results[3].value?.data || []);
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchStarPerformers = async () => {
    try {
      const period = rankingPeriod === 'all' ? 'all_time' : rankingPeriod;
      const r = await api.get('/reports/performance-rankings', { params: { period } });
      setStarPerformers(r.data || []);
    } catch {
      setStarPerformers([]);
    }
  };

  useEffect(() => {
    if (user) fetchAllData();
  }, [user]);

  useEffect(() => {
    fetchStarPerformers();
  }, [rankingPeriod]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatTime = (min) => {
    if (!min || min === 0) return '0h 0m';
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  const formatHours = (hours) => {
    if (!hours || hours === 0) return '0h 0m';
    return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  };

  // ── Derived metrics from REAL data sources ─────────────────────────────────

  // Tasks derived from /tasks endpoint (real data)
  const filteredTasks = useMemo(() => {
    if (selectedUserId === 'all') return tasks;
    return tasks.filter(t => t.assigned_to === selectedUserId || t.created_by === selectedUserId);
  }, [tasks, selectedUserId]);

  const completedTasks = useMemo(() => filteredTasks.filter(t => t.status === 'completed'), [filteredTasks]);
  const pendingTasks   = useMemo(() => filteredTasks.filter(t => t.status === 'pending' || t.status === 'in_progress'), [filteredTasks]);
  const overdueTasks   = useMemo(() => {
    const now = new Date();
    return filteredTasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'completed');
  }, [filteredTasks]);

  const completionRate = filteredTasks.length > 0
    ? Math.round((completedTasks.length / filteredTasks.length) * 100) : 0;

  // Attendance derived from /attendance/history (real data)
  const filteredAttendance = useMemo(() => {
    if (selectedUserId === 'all') return attendance;
    return attendance.filter(a => a.user_id === selectedUserId);
  }, [attendance, selectedUserId]);

  const totalMinutes = useMemo(() =>
    filteredAttendance.reduce((s, a) => s + (a.duration_minutes || 0), 0),
    [filteredAttendance]
  );

  const presentDays = useMemo(() =>
    filteredAttendance.filter(a => a.status === 'present' && a.punch_in).length,
    [filteredAttendance]
  );

  const avgDailyMinutes = presentDays > 0 ? Math.round(totalMinutes / presentDays) : 0;

  const lateDays = useMemo(() =>
    filteredAttendance.filter(a => a.is_late).length,
    [filteredAttendance]
  );

  // Unique users for filter dropdown
  const uniqueUsers = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map();
    allUsers.forEach(u => { if (u.id && u.full_name) map.set(u.id, u); });
    return Array.from(map.values());
  }, [allUsers, isAdmin]);

  // ── Chart data builders ────────────────────────────────────────────────────

  // Task status pie — real tasks
  const taskStatusData = useMemo(() => {
    const p = filteredTasks.filter(t => t.status === 'pending').length;
    const w = filteredTasks.filter(t => t.status === 'in_progress').length;
    const c = filteredTasks.filter(t => t.status === 'completed').length;
    return [
      { name: 'Completed',    value: c, color: COLORS.emeraldGreen },
      { name: 'In Progress',  value: w, color: COLORS.mediumBlue   },
      { name: 'Pending',      value: p, color: COLORS.amber        },
    ].filter(d => d.value > 0);
  }, [filteredTasks]);

  // Task by category — real tasks
  const taskCategoryData = useMemo(() => {
    const cc = {};
    filteredTasks.forEach(t => { const c = t.category || 'Other'; cc[c] = (cc[c] || 0) + 1; });
    return Object.entries(cc)
      .map(([name, count], i) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        tasks: count,
        fill: CHART_PALETTE[i % CHART_PALETTE.length],
      }))
      .sort((a, b) => b.tasks - a.tasks).slice(0, 7);
  }, [filteredTasks]);

  // Weekly trend from real tasks
  const weeklyTrendData = useMemo(() => {
    const today = new Date();
    const diff  = today.getDay() - 1;
    const mon   = new Date(today);
    mon.setDate(today.getDate() - (diff >= 0 ? diff : diff + 7));
    mon.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return { name: d.toLocaleDateString('en-US', { weekday: 'short' }), completed: 0, pending: 0, overdue: 0 };
    });
    filteredTasks.forEach(t => {
      const getStart = (ds) => { const d = new Date(ds); d.setHours(0, 0, 0, 0); return d; };
      if (t.status === 'completed' && t.completed_at) {
        const idx = Math.floor((getStart(t.completed_at) - mon) / 86400000);
        if (idx >= 0 && idx < 7) days[idx].completed += 1;
      }
      if (t.status !== 'completed' && t.created_at) {
        const idx = Math.floor((getStart(t.created_at) - mon) / 86400000);
        if (idx >= 0 && idx < 7) days[idx].pending += 1;
      }
    });
    return days;
  }, [filteredTasks]);

  // Attendance trend — last 7 days from real attendance
  const attendanceTrendData = useMemo(() => {
    const today = new Date();
    const days  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return {
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        date: d.toISOString().slice(0, 10),
        hours: 0,
        present: 0,
      };
    });
    filteredAttendance.forEach(a => {
      const day = days.find(d => d.date === a.date);
      if (day) {
        day.hours = Math.round((a.duration_minutes || 0) / 60 * 10) / 10;
        day.present = a.status === 'present' ? 1 : 0;
      }
    });
    return days;
  }, [filteredAttendance]);

  // Team workload from dashboard stats (real)
  const teamWorkload = useMemo(() =>
    (dashboardStats?.team_workload || []).slice(0, 10),
    [dashboardStats]
  );

  // Per-user efficiency cards — derived from tasks + attendance (real data)
  const efficiencyCards = useMemo(() => {
    if (!isAdmin) {
      // Self summary
      const myTasks  = tasks.filter(t => t.assigned_to === user?.id);
      const myAtt    = attendance.filter(a => a.user_id === user?.id);
      const myMins   = myAtt.reduce((s, a) => s + (a.duration_minutes || 0), 0);
      const myDays   = myAtt.filter(a => a.status === 'present').length;
      return [{
        user_id:   user?.id,
        user_name: user?.full_name || 'You',
        tasks_total:    myTasks.length,
        tasks_done:     myTasks.filter(t => t.status === 'completed').length,
        tasks_pending:  myTasks.filter(t => t.status !== 'completed').length,
        screen_time:    myMins,
        days_logged:    myDays,
        completion_pct: myTasks.length > 0
          ? Math.round((myTasks.filter(t => t.status === 'completed').length / myTasks.length) * 100) : 0,
      }];
    }
    // Admin: build per-user cards from real tasks + real attendance
    const userMap = {};
    allUsers.forEach(u => {
      userMap[u.id] = {
        user_id:       u.id,
        user_name:     u.full_name,
        tasks_total:   0,
        tasks_done:    0,
        tasks_pending: 0,
        screen_time:   0,
        days_logged:   0,
        completion_pct: 0,
      };
    });
    tasks.forEach(t => {
      const uid = t.assigned_to;
      if (uid && userMap[uid]) {
        userMap[uid].tasks_total++;
        if (t.status === 'completed') userMap[uid].tasks_done++;
        else userMap[uid].tasks_pending++;
      }
    });
    attendance.forEach(a => {
      const uid = a.user_id;
      if (uid && userMap[uid]) {
        userMap[uid].screen_time += (a.duration_minutes || 0);
        if (a.status === 'present') userMap[uid].days_logged++;
      }
    });
    Object.values(userMap).forEach(u => {
      u.completion_pct = u.tasks_total > 0 ? Math.round((u.tasks_done / u.tasks_total) * 100) : 0;
    });

    let cards = Object.values(userMap);
    if (selectedUserId !== 'all') cards = cards.filter(c => c.user_id === selectedUserId);
    return cards.sort((a, b) => b.tasks_done - a.tasks_done);
  }, [tasks, attendance, allUsers, isAdmin, user, selectedUserId]);

  // Priority breakdown from real tasks
  const priorityData = useMemo(() => {
    const counts = { critical: 0, urgent: 0, high: 0, medium: 0, low: 0 };
    filteredTasks.forEach(t => {
      const p = (t.priority || 'medium').toLowerCase();
      if (counts[p] !== undefined) counts[p]++;
    });
    return [
      { name: 'Critical', value: counts.critical, color: '#dc2626' },
      { name: 'Urgent',   value: counts.urgent,   color: '#ea580c' },
      { name: 'High',     value: counts.high,     color: COLORS.amber },
      { name: 'Medium',   value: counts.medium,   color: COLORS.mediumBlue },
      { name: 'Low',      value: counts.low,       color: COLORS.emeraldGreen },
    ].filter(d => d.value > 0);
  }, [filteredTasks]);

  // Radar data for compliance/performance
  const radarData = useMemo(() => {
    const topPerformer = starPerformers[0];
    if (!topPerformer) return [];
    return [
      { metric: 'Attendance',  score: topPerformer.attendance_percent || 0 },
      { metric: 'Task Done',   score: topPerformer.task_completion_percent || 0 },
      { metric: 'On Time',     score: topPerformer.timely_punchin_percent || 0 },
      { metric: 'Todo Rate',   score: topPerformer.todo_ontime_percent || 0 },
      { metric: 'Overall',     score: topPerformer.overall_score || 0 },
    ];
  }, [starPerformers]);

  // ── Export handlers ────────────────────────────────────────────────────────
  const handleDownloadCsv = () => {
    const headers = ['User', 'Total Tasks', 'Completed', 'Pending', 'Completion %', 'Screen Time (min)', 'Days Present'];
    const rows = efficiencyCards.map(d => [
      d.user_name, d.tasks_total, d.tasks_done, d.tasks_pending,
      `${d.completion_pct}%`, d.screen_time, d.days_logged,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'efficiency_reports.csv';
    a.click();
    toast.success('CSV downloaded!');
  };

  const handleExportPdf = async () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let y = 15;

      doc.setFontSize(20); doc.setTextColor(13, 59, 102);
      doc.text('Efficiency Reports & Analytics', 15, y); y += 10;
      doc.setFontSize(10); doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Period: ${rankingPeriod}`, 15, y); y += 10;

      // KPI Summary
      doc.setFontSize(12); doc.setTextColor(13, 59, 102);
      doc.text('Key Performance Indicators', 15, y); y += 8;
      doc.autoTable({
        head: [['Metric', 'Value']],
        body: [
          ['Total Tasks', filteredTasks.length.toString()],
          ['Completed Tasks', completedTasks.length.toString()],
          ['Completion Rate', `${completionRate}%`],
          ['Overdue Tasks', overdueTasks.length.toString()],
          ['Days Present', presentDays.toString()],
          ['Total Screen Time', formatTime(totalMinutes)],
          ['Avg Daily Hours', formatTime(avgDailyMinutes)],
          ['Late Punch-ins', lateDays.toString()],
        ],
        startY: y, margin: 15, theme: 'grid',
        headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 240, 240] },
      });
      y = doc.lastAutoTable.finalY + 12;

      // Task Status
      if (taskStatusData.length > 0) {
        doc.setFontSize(12); doc.setTextColor(13, 59, 102);
        doc.text('Task Status Distribution', 15, y); y += 8;
        doc.autoTable({
          head: [['Status', 'Count', 'Percentage']],
          body: taskStatusData.map(d => [d.name, d.value.toString(), `${((d.value / filteredTasks.length) * 100).toFixed(1)}%`]),
          startY: y, margin: 15, theme: 'grid',
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // Team efficiency
      if (efficiencyCards.length > 0) {
        if (y > 200) { doc.addPage(); y = 15; }
        doc.setFontSize(12); doc.setTextColor(13, 59, 102);
        doc.text('Team Efficiency Breakdown', 15, y); y += 8;
        doc.autoTable({
          head: [['User', 'Tasks Total', 'Completed', 'Pending', 'Completion %', 'Screen Time', 'Days Present']],
          body: efficiencyCards.map(d => [
            d.user_name, d.tasks_total, d.tasks_done, d.tasks_pending,
            `${d.completion_pct}%`, formatTime(d.screen_time), d.days_logged,
          ]),
          startY: y, margin: 15, theme: 'grid',
          headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // Star performers
      if (starPerformers.length > 0) {
        doc.addPage(); y = 15;
        doc.setFontSize(12); doc.setTextColor(13, 59, 102);
        doc.text('Star Performers', 15, y); y += 8;
        doc.autoTable({
          head: [['Rank', 'Name', 'Score', 'Attendance %', 'Task Completion %', 'Total Hours', 'Badge']],
          body: starPerformers.map((m, i) => [
            `#${i + 1}`, m.user_name, `${m.overall_score}%`,
            `${m.attendance_percent}%`, `${m.task_completion_percent}%`,
            formatHours(m.total_hours), m.badge || 'Good Performer',
          ]),
          startY: y, margin: 15, theme: 'grid',
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
        });
      }

      // Team workload (admin)
      if (isAdmin && teamWorkload.length > 0) {
        doc.addPage(); y = 15;
        doc.setFontSize(12); doc.setTextColor(13, 59, 102);
        doc.text('Team Workload Distribution', 15, y); y += 8;
        doc.autoTable({
          head: [['Employee', 'Total Tasks', 'Pending', 'Completed', 'Progress %']],
          body: teamWorkload.map(m => {
            const pct = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
            return [m.user_name, m.total_tasks, m.pending_tasks, m.completed_tasks, `${pct}%`];
          }),
          startY: y, margin: 15, theme: 'grid',
          headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
        });
      }

      doc.save('efficiency_reports.pdf');
      toast.success('PDF exported successfully!');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading reports…</p>
        </div>
      </div>
    );
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview',     label: 'Overview',     icon: BarChart3 },
    { id: 'tasks',        label: 'Tasks',        icon: Target    },
    { id: 'attendance',   label: 'Attendance',   icon: Clock     },
    { id: 'performers',   label: 'Performers',   icon: Award     },
    ...(isAdmin ? [{ id: 'team', label: 'Team', icon: Users }] : []),
  ];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5 p-4 md:p-6">

      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <Card className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue}, ${COLORS.emeraldGreen})` }} />
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.deepBlue }}>Reports & Analytics</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Live metrics from tasks, attendance &amp; team performance
                  {filteredTasks.length > 0 && <span className="ml-2 text-xs text-emerald-600 font-semibold">● {filteredTasks.length} tasks loaded</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* User filter — admin only */}
                {isAdmin && uniqueUsers.length > 1 && (
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="h-8 px-3 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Users</option>
                    {uniqueUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                )}
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs gap-1.5"
                  onClick={() => fetchAllData(true)} disabled={refreshing}>
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
                {canDownloadReports && (
                  <>
                    <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5 bg-slate-800 hover:bg-slate-900 text-white" onClick={handleDownloadCsv}>
                      <Download className="h-3.5 w-3.5" /> CSV
                    </Button>
                    <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5 text-white" style={{ background: COLORS.deepBlue }} onClick={handleExportPdf}>
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 mt-4 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                  style={activeTab === tab.id ? { background: COLORS.deepBlue } : {}}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── KPI TILES (always visible) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Total Tasks"    value={filteredTasks.length}   sub="All assigned"        color={COLORS.deepBlue}     icon={Target}       />
        <KpiTile label="Completed"      value={completedTasks.length}  sub={`${completionRate}% rate`} color={COLORS.emeraldGreen} icon={CheckCircle2} />
        <KpiTile label="In Progress"    value={filteredTasks.filter(t => t.status === 'in_progress').length} sub="Active now" color={COLORS.mediumBlue} icon={Activity} />
        <KpiTile label="Overdue"        value={overdueTasks.length}    sub="Needs attention"     color="#dc2626"              icon={AlertTriangle} />
        <KpiTile label="Days Present"   value={presentDays}            sub={`${presentDays > 0 ? Math.round(totalMinutes / presentDays / 60 * 10) / 10 : 0}h avg/day`} color={COLORS.mediumBlue} icon={Calendar} />
        <KpiTile label="Screen Time"    value={formatTime(totalMinutes)} sub="Total logged"      color={COLORS.amber}         icon={Clock}        />
      </div>

      {/* ══════════════ OVERVIEW TAB ══════════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div key="overview" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Task Status Donut */}
              <Section title="Task Status" desc="Current distribution">
                {taskStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={60} outerRadius={95}
                        paddingAngle={4} dataKey="value"
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {taskStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={Target} text="No task data yet" />}
              </Section>

              {/* Priority breakdown */}
              <Section title="Priority Mix" desc="Task urgency levels">
                {priorityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={priorityData} layout="vertical" barSize={14}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="value" name="Tasks" radius={[0, 6, 6, 0]}>
                        {priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={Shield} text="No priority data" />}
              </Section>

              {/* Compliance score */}
              <Section title="Compliance Score" desc="Overall health">
                <div className="flex flex-col items-center justify-center h-[240px] gap-4">
                  {dashboardStats?.compliance_status ? (
                    <>
                      <div className="relative w-36 h-36">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                          <circle cx="50" cy="50" r="42" fill="none"
                            stroke={dashboardStats.compliance_status.score >= 80 ? COLORS.emeraldGreen : dashboardStats.compliance_status.score >= 50 ? COLORS.amber : '#dc2626'}
                            strokeWidth="10" strokeLinecap="round"
                            strokeDasharray={`${2.64 * dashboardStats.compliance_status.score} 264`}
                            style={{ transition: 'stroke-dasharray 1s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-3xl font-black" style={{ color: COLORS.deepBlue }}>{dashboardStats.compliance_status.score}%</p>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Score</p>
                        </div>
                      </div>
                      <div className="w-full space-y-1.5">
                        {[
                          { label: 'Overdue Tasks',       val: dashboardStats.compliance_status.overdue_tasks,          color: '#dc2626' },
                          { label: 'Expiring DSC Certs',  val: dashboardStats.compliance_status.expiring_certificates,  color: COLORS.amber },
                          { label: 'Status',              val: dashboardStats.compliance_status.status?.toUpperCase(),   color: dashboardStats.compliance_status.score >= 80 ? COLORS.emeraldGreen : COLORS.amber },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">{item.label}</span>
                            <span className="font-bold" style={{ color: item.color }}>{item.val}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <EmptyState icon={Shield} text="No compliance data" />}
                </div>
              </Section>
            </div>

            {/* Weekly trend */}
            <Section title="Weekly Activity Trend" desc="Task completions and new tasks this week">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={weeklyTrendData}>
                  <defs>
                    <linearGradient id="gcompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.emeraldGreen} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.emeraldGreen} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gpending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity={0.30} />
                      <stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="completed" stroke={COLORS.emeraldGreen} strokeWidth={2} fill="url(#gcompleted)" name="Completed" />
                  <Area type="monotone" dataKey="pending"   stroke={COLORS.mediumBlue}   strokeWidth={2} fill="url(#gpending)"   name="New/Pending" />
                </AreaChart>
              </ResponsiveContainer>
            </Section>
          </motion.div>
        )}

        {/* ══════════════ TASKS TAB ══════════════ */}
        {activeTab === 'tasks' && (
          <motion.div key="tasks" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Tasks by department/category */}
              <Section title="Tasks by Category" desc="Volume per service department">
                {taskCategoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={taskCategoryData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="tasks" name="Tasks" radius={[0, 6, 6, 0]}>
                        {taskCategoryData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={BarChart3} text="No category data" />}
              </Section>

              {/* Task status donut */}
              <Section title="Task Status Mix" desc="Completion overview">
                {taskStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                        paddingAngle={4} dataKey="value"
                        label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}>
                        {taskStatusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={Target} text="No task data" />}
              </Section>
            </div>

            {/* Overdue tasks list */}
            {overdueTasks.length > 0 && (
              <Section title={`Overdue Tasks (${overdueTasks.length})`} desc="Tasks past their due date — require immediate attention">
                <div className="space-y-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {overdueTasks.slice(0, 15).map((t, i) => {
                    const daysOver = Math.floor((new Date() - new Date(t.due_date)) / 86400000);
                    return (
                      <div key={t.id || i} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{t.title || 'Untitled'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {t.assigned_to_name && <span>Assigned to: <span className="font-medium">{t.assigned_to_name}</span> · </span>}
                            Due: {t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-red-100 text-red-600 ml-3">
                          {daysOver}d overdue
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
          </motion.div>
        )}

        {/* ══════════════ ATTENDANCE TAB ══════════════ */}
        {activeTab === 'attendance' && (
          <motion.div key="attendance" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

            {/* Attendance KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiTile label="Days Present"    value={presentDays}                                color={COLORS.emeraldGreen} icon={CheckCircle2} sub="This period" />
              <KpiTile label="Total Hours"     value={formatTime(totalMinutes)}                   color={COLORS.deepBlue}     icon={Clock}        sub="Logged time" />
              <KpiTile label="Avg Daily Hours" value={formatTime(avgDailyMinutes)}               color={COLORS.mediumBlue}   icon={Activity}     sub="Per present day" />
              <KpiTile label="Late Punch-ins"  value={lateDays}                                   color={COLORS.amber}        icon={AlertTriangle} sub="Days arrived late" />
            </div>

            {/* Attendance trend chart */}
            <Section title="Daily Hours — Last 7 Days" desc="Logged work hours per day from punch records">
              {attendanceTrendData.some(d => d.hours > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={attendanceTrendData} barSize={32}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="h" />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="hours" name="Hours" radius={[6, 6, 0, 0]}>
                      {attendanceTrendData.map((d, i) => (
                        <Cell key={i} fill={d.hours >= 8 ? COLORS.emeraldGreen : d.hours >= 4 ? COLORS.mediumBlue : '#e2e8f0'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={Clock} text="No attendance records for the last 7 days" />
              )}
            </Section>

            {/* Attendance log table */}
            {filteredAttendance.length > 0 && (
              <Section title="Recent Attendance Log" desc="Detailed punch-in/out records">
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        {(isAdmin ? ['Employee', 'Date', 'Punch In', 'Punch Out', 'Duration', 'Status', 'Flags'] : ['Date', 'Punch In', 'Punch Out', 'Duration', 'Status', 'Flags']).map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAttendance.slice(0, 20).map((a, i) => {
                        const punchIn  = a.punch_in  ? new Date(a.punch_in ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
                        const punchOut = a.punch_out ? new Date(a.punch_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
                        const statusColor = a.status === 'present' ? 'text-emerald-600 bg-emerald-50' : a.status === 'absent' ? 'text-red-500 bg-red-50' : 'text-amber-600 bg-amber-50';
                        const flags = [a.is_late && '⏰ Late', a.punched_out_early && '🚪 Early Out', a.auto_marked && '🤖 Auto'].filter(Boolean);
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            {isAdmin && <td className="px-4 py-3 font-medium text-slate-800 text-xs">{a.user_name || a.user_id?.slice(0, 8) || '—'}</td>}
                            <td className="px-4 py-3 text-slate-600 font-medium">{a.date}</td>
                            <td className="px-4 py-3 text-slate-600">{punchIn}</td>
                            <td className="px-4 py-3 text-slate-600">{punchOut}</td>
                            <td className="px-4 py-3 font-semibold" style={{ color: COLORS.deepBlue }}>{formatTime(a.duration_minutes || 0)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-md capitalize ${statusColor}`}>{a.status}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 space-x-1">
                              {flags.map((f, fi) => <span key={fi}>{f}</span>)}
                              {flags.length === 0 && <span className="text-emerald-400">✓ OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredAttendance.length > 20 && (
                    <p className="text-xs text-slate-400 text-center py-2">Showing 20 of {filteredAttendance.length} records</p>
                  )}
                </div>
              </Section>
            )}
          </motion.div>
        )}

        {/* ══════════════ PERFORMERS TAB ══════════════ */}
        {activeTab === 'performers' && (
          <motion.div key="performers" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Star performers list */}
              <Section
                title={isAdmin ? 'Star Performers' : 'Your Performance Rank'}
                desc="Ranked by overall performance score"
                action={isAdmin && (
                  <div className="flex gap-1">
                    {['all', 'monthly', 'weekly'].map(p => (
                      <Button key={p} variant={rankingPeriod === p ? 'default' : 'outline'} size="sm"
                        onClick={() => setRankingPeriod(p)} className="h-7 px-3 text-xs rounded-lg"
                        style={rankingPeriod === p ? { background: COLORS.deepBlue } : {}}>
                        {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </Button>
                    ))}
                  </div>
                )}
              >
                {starPerformers.length > 0 ? (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {starPerformers.map((m, i) => <PerformerCard key={m.user_id || i} member={m} rank={i + 1} />)}
                  </div>
                ) : <EmptyState icon={Award} text="No performance data available" />}
              </Section>

              {/* Radar chart for top performer */}
              <Section title="Top Performer Breakdown" desc={starPerformers[0] ? `${starPerformers[0].user_name} — detailed metrics` : 'Score components'}>
                {radarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Radar name="Score" dataKey="score" stroke={COLORS.deepBlue} fill={COLORS.deepBlue} fillOpacity={0.18} strokeWidth={2} />
                      <Tooltip content={<ChartTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : <EmptyState icon={Star} text="No performer data" />}
              </Section>
            </div>

            {/* Performance metrics table */}
            {starPerformers.length > 0 && (
              <Section title="Detailed Score Breakdown" desc="All components of the performance score">
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        {['Rank', 'Employee', 'Overall', 'Attendance', 'Task Done', 'On-Time In', 'Todo Rate', 'Hours', 'Badge'].map(h => (
                          <th key={h} className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {starPerformers.map((m, i) => {
                        const scoreColor = m.overall_score >= 85 ? COLORS.emeraldGreen : m.overall_score >= 60 ? COLORS.amber : '#dc2626';
                        return (
                          <tr key={m.user_id || i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-3 font-bold" style={{ color: COLORS.deepBlue }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                                  {m.user_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <span className="font-semibold text-slate-800 whitespace-nowrap">{m.user_name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className="font-black text-base" style={{ color: scoreColor }}>{m.overall_score}%</span>
                            </td>
                            <td className="px-3 py-3 text-slate-600 font-medium">{m.attendance_percent}%</td>
                            <td className="px-3 py-3 text-slate-600 font-medium">{m.task_completion_percent}%</td>
                            <td className="px-3 py-3 text-slate-600 font-medium">{m.timely_punchin_percent}%</td>
                            <td className="px-3 py-3 text-slate-600 font-medium">{m.todo_ontime_percent}%</td>
                            <td className="px-3 py-3 text-slate-600 font-medium">{formatHours(m.total_hours)}</td>
                            <td className="px-3 py-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                m.badge === 'Star Performer' ? 'bg-yellow-100 text-yellow-700' :
                                m.badge === 'Top Performer' ? 'bg-emerald-100 text-emerald-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>{m.badge || 'Good Performer'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </motion.div>
        )}

        {/* ══════════════ TEAM TAB (Admin) ══════════════ */}
        {activeTab === 'team' && isAdmin && (
          <motion.div key="team" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

            {/* Team workload table from dashboard stats */}
            {teamWorkload.length > 0 && (
              <Section title="Team Workload Distribution" desc="Individual breakdown across all staff — live from task assignments">
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        {['Employee', 'Total', 'Pending', 'Completed', 'Progress'].map(h => (
                          <th key={h} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamWorkload.map(m => {
                        const pct = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
                        const barColor = pct >= 70 ? COLORS.emeraldGreen : pct >= 40 ? COLORS.amber : '#dc2626';
                        return (
                          <tr key={m.user_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-slate-800">{m.user_name}</td>
                            <td className="px-5 py-3.5 font-bold" style={{ color: COLORS.deepBlue }}>{m.total_tasks}</td>
                            <td className="px-5 py-3.5 text-amber-600 font-medium">{m.pending_tasks}</td>
                            <td className="px-5 py-3.5 text-emerald-600 font-medium">{m.completed_tasks}</td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${pct}%`, background: barColor }} />
                                </div>
                                <span className="text-xs font-semibold text-slate-600 w-10 text-right">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Per-user efficiency cards — built from real tasks + real attendance */}
            <Section
              title="Individual Efficiency Summary"
              desc="Computed from actual tasks assigned and attendance records — not activity logs"
            >
              {efficiencyCards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {efficiencyCards.map((d, i) => (
                    <motion.div key={d.user_id || i} variants={itemVariants}
                      className="border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-all bg-white">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                          style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}>
                          {(d.user_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">{d.user_name}</p>
                          <p className="text-xs text-slate-400">{d.days_logged} days present</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-black"
                            style={{ color: d.completion_pct >= 70 ? COLORS.emeraldGreen : d.completion_pct >= 40 ? COLORS.amber : '#dc2626' }}>
                            {d.completion_pct}%
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Completion</p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${d.completion_pct}%`,
                            background: d.completion_pct >= 70 ? COLORS.emeraldGreen : d.completion_pct >= 40 ? COLORS.amber : '#dc2626',
                          }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Done',        val: d.tasks_done,   color: COLORS.emeraldGreen },
                          { label: 'Pending',      val: d.tasks_pending, color: COLORS.amber },
                          { label: 'Screen Time',  val: formatTime(d.screen_time), color: COLORS.mediumBlue },
                        ].map((item, j) => (
                          <div key={j} className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase">{item.label}</p>
                            <p className="text-sm font-bold mt-0.5" style={{ color: item.color }}>{item.val}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Users} text="No efficiency data available" />
              )}
            </Section>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
