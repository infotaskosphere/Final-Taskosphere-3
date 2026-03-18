import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  BarChart3, TrendingUp, Clock, Award, Users, CheckCircle2,
  AlertTriangle, Target, Download, RefreshCw, ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

// ─── Brand palette ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
};
const CHART_PALETTE = ['#0D3B66', '#1F6FB2', '#1FAF5A', '#5CCB5F', '#0A2D4D', '#2E86AB'];

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

// ─── Reusable KPI tile ─────────────────────────────────────────────────────────
const KpiTile = ({ label, value, sub, color, icon: Icon, trend }) => (
  <motion.div variants={itemVariants}>
    <Card className="rounded-xl border border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden">
      <div className="h-0.5 w-full" style={{ background: color }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-3xl font-bold font-outfit" style={{ color }}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
        {trend != null && (
          <div className={`mt-3 flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            <TrendingUp className="w-3.5 h-3.5" />
            {trend >= 0 ? '+' : ''}{trend}% this week
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);

// ─── Custom tooltip ────────────────────────────────────────────────────────────
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

// ─── Section wrapper ───────────────────────────────────────────────────────────
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

// ─── Main component ────────────────────────────────────────────────────────────
export default function Reports() {
  const { user, hasPermission } = useAuth();

  // ── Permission matrix ──────────────────────────────────────────────────────
  const isAdmin           = user?.role === 'admin';
  const canViewReports    = isAdmin || hasPermission('can_view_reports');
  const canDownloadReports = isAdmin || hasPermission('can_download_reports');
  const canSeeOthers = isAdmin || (user?.permissions?.view_other_reports?.length > 0);

  const [reportData,     setReportData]     = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [tasks,          setTasks]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [starPerformers, setStarPerformers] = useState([]);
  const [rankingPeriod,  setRankingPeriod]  = useState('monthly');

  // Refs for capturing charts
  const chartRefs = useRef({});

  useEffect(() => {
    if (user) fetchAllData();
  }, [user]);

  useEffect(() => {
    const fetchStarPerformers = async () => {
      try {
        const r = await api.get('/reports/performance-rankings', {
          params: { period: rankingPeriod === 'all' ? 'all_time' : rankingPeriod },
        });
        setStarPerformers(r.data || []);
      } catch {
        setStarPerformers([]);
      }
    };
    fetchStarPerformers();
  }, [rankingPeriod]);

  const fetchAllData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const reportRequests = [api.get('/reports/efficiency')];

      if (isAdmin) {
        try {
          const usersRes = await api.get('/users');
          const otherUsers = (usersRes.data || []).filter(u => u.id !== user?.id);
          otherUsers.forEach(u => {
            reportRequests.push(api.get('/reports/efficiency', { params: { user_id: u.id } }));
          });
        } catch { /* /users failed — only own report will be shown */ }
      } else {
        const allowedUsers = user?.permissions?.view_other_reports || [];
        allowedUsers.forEach(id => {
          reportRequests.push(api.get('/reports/efficiency', { params: { user_id: id } }));
        });
      }

      const reportResponses = await Promise.allSettled(reportRequests);
      const combined = reportResponses
        .filter(r => r.status === 'fulfilled' && r.value?.data)
        .map(r => r.value.data);
      setReportData(combined);

      const [statsRes, tasksRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/tasks'),
      ]);
      setDashboardStats(statsRes.data);
      setTasks(tasksRes.data || []);
    } catch {
      toast.error('Failed to fetch reports');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredReportData = selectedUserId === 'all'
    ? reportData
    : reportData.filter(r => {
        const userId = r.user?.id || r.user_id;
        return userId === selectedUserId;
      });

  const uniqueUsers = Array.from(
    new Map(reportData.map(r => [r.user?.id || r.user_id, r.user || { id: r.user_id, full_name: 'Me' }])).values()
  );

  const formatTime = (min) => `${Math.floor(min / 60)}h ${min % 60}m`;
  const getAvgScreenTime = () => {
    if (!filteredReportData.length) return 0;
    return Math.round(filteredReportData.reduce((s, i) => s + (i.total_screen_time || 0), 0) / filteredReportData.length);
  };
  const getTotalCompleted = () => filteredReportData.reduce((s, i) => s + (i.total_tasks_completed || 0), 0);

  const getTaskStatusData = () => {
    const p = tasks.filter(t => t.status === 'pending').length;
    const w = tasks.filter(t => t.status === 'in_progress').length;
    const c = tasks.filter(t => t.status === 'completed').length;
    return [
      { name: 'To Do',      value: p, color: '#dc2626' },
      { name: 'In Progress', value: w, color: '#d97706' },
      { name: 'Completed',  value: c, color: COLORS.mediumBlue },
    ].filter(d => d.value > 0);
  };

  const getTaskCategoryData = () => {
    const cc = {};
    tasks.forEach(t => { const c = t.category || 'Other'; cc[c] = (cc[c] || 0) + 1; });
    return Object.entries(cc)
      .map(([name, count], i) => ({ name: name.toUpperCase().replace('_', ' '), tasks: count, fill: CHART_PALETTE[i % CHART_PALETTE.length] }))
      .sort((a, b) => b.tasks - a.tasks).slice(0, 6);
  };

  const getEmployeePerformanceData = () => {
    if (!isAdmin) {
      if (filteredReportData.length > 0) {
        const d = filteredReportData[0];
        return [{ name: 'You', tasks: d.total_tasks_completed || 0, hours: Math.round((d.total_screen_time || 0) / 60), fill: COLORS.deepBlue }];
      }
      return [];
    }
    return (starPerformers || []).slice(0, 5).map((m, i) => ({
      name:  m?.user_name?.split(' ')[0] || 'User',
      tasks: Number.isFinite(+m?.overall_score) ? Math.round(+m.overall_score) : 0,
      hours: Number.isFinite(+m?.total_hours)   ? Math.round(+m.total_hours)   : 0,
      fill:  CHART_PALETTE[i % CHART_PALETTE.length],
    }));
  };

  const getWeeklyTrendData = () => {
    const today = new Date();
    const diff  = today.getDay() - 1;
    const mon   = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (diff >= 0 ? diff : diff + 7));
    mon.setHours(0, 0, 0, 0);
    const days  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return { name: d.toLocaleDateString('en-US', { weekday: 'short' }), completed: 0, pending: 0 };
    });
    tasks.forEach(t => {
      const getStart = (ds) => { const d = new Date(ds); d.setHours(0,0,0,0); return d; };
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
  };

  // ── Export to CSV ──────────────────────────────────────────────────────────
  const handleDownloadCsv = () => {
    const headers = ['User', 'Total Tasks Completed', 'Screen Time (min)', 'Days Logged'];
    const rows    = filteredReportData.map(d => [
      d.user?.full_name || 'Unknown', 
      d.total_tasks_completed || 0, 
      d.total_screen_time || 0, 
      d.days_logged || 0
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'efficiency_reports.csv';
    a.click();
  };

  // ── Export to PDF with charts ──────────────────────────────────────────────
  const handleExportPdf = async () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let yPosition = 15;

      // Title
      doc.setFontSize(20);
      doc.setTextColor(13, 59, 102);
      doc.text('Efficiency Reports & Analytics', 15, yPosition);
      yPosition += 10;

      // Date
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, yPosition);
      yPosition += 8;

      // KPI Summary Section
      doc.setFontSize(12);
      doc.setTextColor(13, 59, 102);
      doc.text('Key Performance Indicators', 15, yPosition);
      yPosition += 8;

      const kpiData = [
        ['Metric', 'Value'],
        ['Total Tasks', tasks.length.toString()],
        ['Completed Tasks', getTotalCompleted().toString()],
        ['Completion Rate', `${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0}%`],
        ['Avg Screen Time', formatTime(getAvgScreenTime())],
        ['Pending Work', tasks.filter(t => t.status !== 'completed').length.toString()],
      ];

      doc.autoTable({
        head: [kpiData[0]],
        body: kpiData.slice(1),
        startY: yPosition,
        margin: 15,
        theme: 'grid',
        headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [50, 50, 50] },
        alternateRowStyles: { fillColor: [240, 240, 240] },
      });

      yPosition = doc.lastAutoTable.finalY + 12;

      // Task Status Table
      if (getTaskStatusData().length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(13, 59, 102);
        doc.text('Task Status Distribution', 15, yPosition);
        yPosition += 8;

        const statusData = [
          ['Status', 'Count', 'Percentage'],
          ...getTaskStatusData().map(d => [
            d.name,
            d.value.toString(),
            `${((d.value / tasks.length) * 100).toFixed(1)}%`
          ])
        ];

        doc.autoTable({
          head: [statusData[0]],
          body: statusData.slice(1),
          startY: yPosition,
          margin: 15,
          theme: 'grid',
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
          bodyStyles: { textColor: [50, 50, 50] },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPosition = doc.lastAutoTable.finalY + 12;
      }

      // Task Category Table
      if (getTaskCategoryData().length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(13, 59, 102);
        doc.text('Tasks by Category', 15, yPosition);
        yPosition += 8;

        const categoryData = [
          ['Category', 'Task Count'],
          ...getTaskCategoryData().map(d => [d.name, d.tasks.toString()])
        ];

        doc.autoTable({
          head: [categoryData[0]],
          body: categoryData.slice(1),
          startY: yPosition,
          margin: 15,
          theme: 'grid',
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
          bodyStyles: { textColor: [50, 50, 50] },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPosition = doc.lastAutoTable.finalY + 12;
      }

      // Employee Performance Table
      const perfData = getEmployeePerformanceData();
      if (perfData.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(13, 59, 102);
        doc.text(isAdmin ? 'Star Performers' : 'Your Performance', 15, yPosition);
        yPosition += 8;

        const perfTableData = [
          ['Employee', 'Performance Score', 'Hours'],
          ...perfData.map(d => [d.name, d.tasks.toString(), d.hours.toString()])
        ];

        doc.autoTable({
          head: [perfTableData[0]],
          body: perfTableData.slice(1),
          startY: yPosition,
          margin: 15,
          theme: 'grid',
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255], fontStyle: 'bold' },
          bodyStyles: { textColor: [50, 50, 50] },
          alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        yPosition = doc.lastAutoTable.finalY + 12;
      }

      // Efficiency Report Table
      if (filteredReportData.length > 0) {
        doc.addPage();
        doc.setFontSize(12);
        doc.setTextColor(13, 59, 102);
        doc.text('Detailed Efficiency Report', 15, 15);

        const efficiencyData = [
          ['User', 'Tasks Completed', 'Screen Time (min)', 'Days Logged'],
          ...filteredReportData.map(d => [
            d.user?.full_name || 'Unknown',
            (d.total_tasks_completed || 0).toString(),
            (d.total_screen_time || 0).toString(),
            (d.days_logged || 0).toString()
          ])
        ];

        doc.autoTable({
          head: [efficiencyData[0]],
          body: efficiencyData.slice(1),
          startY: 25,
          margin: 15,
          theme: 'grid',
          headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
          bodyStyles: { textColor: [50, 50, 50] },
          alternateRowStyles: { fillColor: [240, 240, 240] },
        });
      }

      // Team Workload Table (Admin only)
      if (isAdmin && dashboardStats?.team_workload && dashboardStats.team_workload.length > 0) {
        doc.addPage();
        doc.setFontSize(12);
        doc.setTextColor(13, 59, 102);
        doc.text('Team Workload Distribution', 15, 15);

        const workloadData = [
          ['Employee', 'Total Tasks', 'Pending', 'Completed', 'Progress %'],
          ...dashboardStats.team_workload.map(m => {
            const pct = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
            return [
              m.user_name || 'Unknown',
              (m.total_tasks || 0).toString(),
              (m.pending_tasks || 0).toString(),
              (m.completed_tasks || 0).toString(),
              `${pct}%`
            ];
          })
        ];

        doc.autoTable({
          head: [workloadData[0]],
          body: workloadData.slice(1),
          startY: 25,
          margin: 15,
          theme: 'grid',
          headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255], fontStyle: 'bold' },
          bodyStyles: { textColor: [50, 50, 50] },
          alternateRowStyles: { fillColor: [240, 240, 240] },
        });
      }

      doc.save('efficiency_reports.pdf');
      toast.success('PDF exported successfully!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    }
  };

  // ── Access gate ────────────────────────────────────────────────────────────
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

  const completionRate = tasks.length > 0
    ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)
    : 0;

  const pendingCount = tasks.filter(t => t.status !== 'completed').length;

  // ─────────────────────────────────────────────────────────────────────────────
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
                <p className="text-sm text-slate-500 mt-0.5">Performance insights and efficiency metrics</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* User filter dropdown — shown when multiple report data available */}
                {uniqueUsers.length > 1 && (
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="h-8 px-3 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Users</option>
                    {uniqueUsers.map(u => (
                      <option key={u?.id} value={u?.id}>{u?.full_name || 'Unknown'}</option>
                    ))}
                  </select>
                )}
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs gap-1.5"
                  onClick={() => fetchAllData(true)} disabled={refreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                {canDownloadReports && (
                  <>
                    <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5 bg-slate-800 hover:bg-slate-900 text-white" onClick={handleDownloadCsv}>
                      <Download className="h-3.5 w-3.5" /> CSV
                    </Button>
                    <Button size="sm" className="h-8 rounded-xl text-xs gap-1.5" style={{ background: COLORS.deepBlue }} onClick={handleExportPdf}>
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Total Tasks"
          value={tasks.length}
          sub="All assigned tasks"
          color={COLORS.deepBlue}
          icon={Target}
        />
        <KpiTile
          label="Completed"
          value={getTotalCompleted()}
          sub={`${completionRate}% completion rate`}
          color={COLORS.emeraldGreen}
          icon={CheckCircle2}
        />
        <KpiTile
          label="Avg Screen Time"
          value={formatTime(getAvgScreenTime())}
          sub="Per session average"
          color={COLORS.mediumBlue}
          icon={Clock}
        />
        <KpiTile
          label="Pending Work"
          value={pendingCount}
          sub="Tasks not yet done"
          color="#d97706"
          icon={AlertTriangle}
        />
      </div>

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Task Status Overview" desc="Distribution of current task states">
          {getTaskStatusData().length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={getTaskStatusData()} cx="50%" cy="50%" innerRadius={65} outerRadius={105}
                  paddingAngle={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {getTaskStatusData().map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">No task data</div>
          )}
        </Section>

        <Section title="Tasks by Department" desc="Volume per service category">
          {getTaskCategoryData().length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={getTaskCategoryData()} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="tasks" radius={[0, 6, 6, 0]}>
                  {getTaskCategoryData().map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">No category data</div>
          )}
        </Section>
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section
          title={isAdmin ? 'Star Performers' : 'Your Performance'}
          desc={isAdmin ? 'Top ranked by overall performance score' : 'Your efficiency metrics'}
          action={isAdmin && (
            <div className="flex gap-1">
              {['all', 'monthly', 'weekly'].map(p => (
                <Button key={p} variant={rankingPeriod === p ? 'default' : 'outline'} size="sm"
                  onClick={() => setRankingPeriod(p)}
                  className="h-7 px-3 text-xs rounded-lg"
                  style={rankingPeriod === p ? { background: COLORS.deepBlue } : {}}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>
          )}
        >
          {getEmployeePerformanceData().length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={getEmployeePerformanceData()}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="tasks" name="Performance Score" radius={[6, 6, 0, 0]}>
                  {getEmployeePerformanceData().map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">No performance data</div>
          )}
        </Section>

        <Section title="Weekly Activity Trend" desc="Task completion pattern this week">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={getWeeklyTrendData()}>
              <defs>
                <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.emeraldGreen} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.emeraldGreen} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="completed" stroke={COLORS.emeraldGreen} strokeWidth={2} fill="url(#gradCompleted)" />
              <Area type="monotone" dataKey="pending"   stroke={COLORS.mediumBlue}   strokeWidth={2} fill="url(#gradPending)" />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* ── Team Workload table — admin only ── */}
      {isAdmin && dashboardStats?.team_workload && (
        <Section title="Team Workload Distribution" desc="Individual breakdown across all staff">
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
                {dashboardStats.team_workload.map(m => {
                  const pct = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
                  return (
                    <tr key={m.user_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-800">{m.user_name}</td>
                      <td className="px-5 py-3.5 font-bold" style={{ color: COLORS.deepBlue }}>{m.total_tasks}</td>
                      <td className="px-5 py-3.5 text-amber-600 font-medium">{m.pending_tasks}</td>
                      <td className="px-5 py-3.5 text-emerald-600 font-medium">{m.completed_tasks}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 70 ? COLORS.emeraldGreen : pct >= 40 ? '#d97706' : '#dc2626' }} />
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

      {/* ── Individual efficiency cards ── */}
      {filteredReportData.length > 0 && (
        <Section
          title={canSeeOthers ? 'Efficiency Breakdown' : 'Your Efficiency Summary'}
          desc="Detailed activity log metrics"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReportData.map((d, i) => {
              const userId = d.user?.id || d.user_id;
              const name = d.user?.full_name || d.full_name || (userId === user?.id ? 'You' : 'User');
              const completedTasks = d.total_tasks_completed || 0;
              const screenTime = d.total_screen_time || 0;
              const daysLogged = d.days_logged || 0;
              const pct = daysLogged > 0 ? Math.round((completedTasks / Math.max(daysLogged, 1)) * 100) / 100 : 0;
              return (
                <div key={i} className="border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{name}</p>
                      <p className="text-xs text-slate-400">{daysLogged} days logged</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Completed</p>
                      <p className="text-xl font-bold mt-0.5" style={{ color: COLORS.emeraldGreen }}>{completedTasks}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Screen Time</p>
                      <p className="text-xl font-bold mt-0.5" style={{ color: COLORS.mediumBlue }}>{formatTime(screenTime)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </motion.div>
  );
}
