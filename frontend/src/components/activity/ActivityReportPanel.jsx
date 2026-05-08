/**
 * ActivityReportPanel.jsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Admin panel that fetches computer activity reports from each staff member's
 * local Taskosphere Agent (running on localhost:7432 on their PC).
 *
 * Shows: session times, active hours, top apps, top websites, idle time.
 *
 * HOW IT WORKS:
 *   Staff PC runs dsc-agent → tracks activity → stores in activity-logs/
 *   Admin opens this panel → backend fetches reports from each agent
 *   OR: Staff PC pushes report to backend API at end of day (if configured)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor, Clock, Globe, AppWindow, MousePointer2,
  RefreshCw, Download, ChevronDown, ChevronUp,
  Wifi, WifiOff, AlertCircle, Calendar, BarChart2,
  CheckCircle2, XCircle,
} from 'lucide-react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  blue:   '#0D3B66',
  mid:    '#1F6FB2',
  green:  '#1FAF5A',
  amber:  '#F59E0B',
  red:    '#EF4444',
  purple: '#8B5CF6',
};
const PALETTE = [C.blue, C.mid, C.green, C.amber, C.red, C.purple, '#06B6D4', '#EC4899'];

// ── Theme ─────────────────────────────────────────────────────────────────────
const tok = (dark) => ({
  bg:       dark ? '#0f172a' : '#f8fafc',
  card:     dark ? '#1e293b' : '#ffffff',
  card2:    dark ? '#263348' : '#f8fafc',
  border:   dark ? '#334155' : '#e2e8f0',
  text:     dark ? '#e2e8f0' : '#1e293b',
  textSub:  dark ? '#94a3b8' : '#64748b',
  textMute: dark ? '#475569' : '#94a3b8',
  hover:    dark ? '#1a2942' : '#f8fafc',
  shadow:   dark ? '0 1px 4px rgba(0,0,0,0.45)' : '0 1px 4px rgba(0,0,0,0.06)',
});

const iV = { hidden:{opacity:0,y:12}, visible:{opacity:1,y:0,transition:{duration:0.3}} };
const cV = { hidden:{opacity:0}, visible:{opacity:1,transition:{staggerChildren:0.05}} };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSec(s) {
  if (!s || s === 0) return '0h 0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, sub, color, dark }) => {
  const t = tok(dark);
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textMute }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: t.textSub }}>{sub}</p>}
    </div>
  );
};

const AppRow = ({ rank, name, seconds, total, dark }) => {
  const t = tok(dark);
  const pct = total > 0 ? Math.round((seconds / total) * 100) : 0;
  const color = PALETTE[rank % PALETTE.length];
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs font-bold w-5 text-right flex-shrink-0" style={{ color: t.textMute }}>#{rank + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold truncate" style={{ color: t.text }}>{name}</span>
          <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color }}>{fmtSec(seconds)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: t.card2 }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className="text-[10px] w-8 text-right flex-shrink-0" style={{ color: t.textMute }}>{pct}%</span>
    </div>
  );
};

const SessionRow = ({ session, dark }) => {
  const t = tok(dark);
  const start = new Date(session.start);
  const end   = session.end ? new Date(session.end) : null;
  const durMs  = end ? (end - start) : (Date.now() - start);
  const durMin = Math.round(durMs / 60000);
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: t.card2 }}>
      <Monitor className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.mid }} />
      <span className="text-xs flex-1" style={{ color: t.textSub }}>
        {fmtTime(session.start)} → {session.end ? fmtTime(session.end) : <span style={{ color: C.green }}>Active now</span>}
      </span>
      <span className="text-xs font-bold flex-shrink-0" style={{ color: C.blue }}>{fmtSec(durMin * 60)}</span>
    </div>
  );
};

// ── Staff card (one per staff member) ─────────────────────────────────────────
const StaffActivityCard = ({ staff, report, agentOnline, loading, dark, onRefresh }) => {
  const t = tok(dark);
  const [expanded, setExpanded] = useState(false);

  const totalAppSec = report?.topApps?.reduce((s, a) => s + a.seconds, 0) || 0;
  const totalWebSec = report?.topWebsites?.reduce((s, w) => s + w.seconds, 0) || 0;

  return (
    <motion.div variants={iV} className="rounded-xl overflow-hidden"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: expanded ? `1px solid ${t.border}` : 'none' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ background: `linear-gradient(135deg,${C.blue},${C.mid})` }}>
            {(staff.full_name || staff.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: t.text }}>{staff.full_name || staff.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {agentOnline
                ? <><Wifi className="w-3 h-3" style={{ color: C.green }} /><span className="text-[10px] font-semibold" style={{ color: C.green }}>Agent online</span></>
                : <><WifiOff className="w-3 h-3" style={{ color: t.textMute }} /><span className="text-[10px]" style={{ color: t.textMute }}>Agent offline</span></>
              }
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {report && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-black" style={{ color: C.blue }}>{report.totalActive}</p>
              <p className="text-[10px]" style={{ color: t.textMute }}>active today</p>
            </div>
          )}
          <button onClick={onRefresh} disabled={loading}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: t.card2, border: `1px solid ${t.border}` }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: t.textSub }} />
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{ background: t.card2, border: `1px solid ${t.border}` }}>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5" style={{ color: t.textSub }} />
              : <ChevronDown className="w-3.5 h-3.5" style={{ color: t.textSub }} />}
          </button>
        </div>
      </div>

      {/* Collapsed summary bar */}
      {!expanded && report && (
        <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap"
          style={{ borderTop: `1px solid ${t.border}` }}>
          {[
            { icon: Clock,        label: 'Active',    val: report.totalActive,                color: C.green  },
            { icon: MousePointer2,label: 'Idle',      val: report.totalIdle,                  color: C.amber  },
            { icon: Monitor,      label: 'Sessions',  val: `${report.sessions?.length || 0}`, color: C.mid    },
            { icon: AppWindow,    label: 'Top App',   val: report.topApps?.[0]?.name || '—',  color: C.blue   },
            { icon: Globe,        label: 'Top Site',  val: report.topWebsites?.[0]?.domain || '—', color: C.purple },
          ].map((it, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <it.icon className="w-3 h-3 flex-shrink-0" style={{ color: it.color }} />
              <span className="text-[10px]" style={{ color: t.textMute }}>{it.label}:</span>
              <span className="text-[10px] font-bold" style={{ color: it.color }}>{it.val}</span>
            </div>
          ))}
        </div>
      )}

      {/* No report */}
      {!loading && !report && (
        <div className="flex items-center gap-2 px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: t.textMute }} />
          <p className="text-xs" style={{ color: t.textMute }}>
            {agentOnline
              ? 'Agent is online but no report available for today.'
              : 'Agent is not running on this staff\'s PC. They need to run INSTALL.bat first.'}
          </p>
        </div>
      )}

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && report && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden">
            <div className="p-4 space-y-5">

              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={Clock}         label="Active Time"  value={report.totalActive}  sub={`${report.sessions?.length || 0} sessions`} color={C.green}  dark={dark} />
                <StatCard icon={MousePointer2} label="Idle Time"    value={report.totalIdle}    sub="Mouse/keyboard idle"                         color={C.amber}  dark={dark} />
                <StatCard icon={AppWindow}     label="Apps Used"    value={report.topApps?.length || 0}    sub="Unique apps today"               color={C.mid}    dark={dark} />
                <StatCard icon={Globe}         label="Sites Visited" value={report.topWebsites?.length || 0} sub="Unique domains"                color={C.purple} dark={dark} />
              </div>

              {/* Sessions */}
              {report.sessions?.length > 0 && (
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: t.textMute }}>
                    MONITOR SESSIONS ({report.sessions.length})
                  </p>
                  <div className="space-y-1.5">
                    {report.sessions.map((s, i) => <SessionRow key={i} session={s} dark={dark} />)}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Top Apps */}
                {report.topApps?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: t.textMute }}>TOP APPLICATIONS</p>
                    <div className="space-y-0.5">
                      {report.topApps.slice(0, 8).map((app, i) => (
                        <AppRow key={i} rank={i} name={app.name} seconds={app.seconds} total={totalAppSec} dark={dark} />
                      ))}
                    </div>

                    {/* Mini bar chart */}
                    {report.topApps.length > 1 && (
                      <div className="mt-3">
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={report.topApps.slice(0, 6).map(a => ({ name: a.name.slice(0, 8), mins: Math.round(a.seconds / 60) }))} barSize={16}>
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: t.textSub }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: t.textSub }} axisLine={false} tickLine={false} unit="m" />
                            <Tooltip formatter={(v) => [`${v} min`, 'Time']} contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 10 }} />
                            <Bar dataKey="mins" radius={[4, 4, 0, 0]}>
                              {report.topApps.slice(0, 6).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* Top Websites */}
                {report.topWebsites?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold mb-2" style={{ color: t.textMute }}>WEBSITES VISITED (DOMAINS)</p>
                    <div className="space-y-0.5">
                      {report.topWebsites.slice(0, 8).map((site, i) => (
                        <AppRow key={i} rank={i} name={site.domain} seconds={site.seconds} total={totalWebSec} dark={dark} />
                      ))}
                    </div>

                    {/* Donut */}
                    {report.topWebsites.length > 1 && (
                      <div className="mt-3">
                        <ResponsiveContainer width="100%" height={120}>
                          <PieChart>
                            <Pie data={report.topWebsites.slice(0, 5).map((s, i) => ({ name: s.domain, value: s.seconds, fill: PALETTE[i % PALETTE.length] }))}
                              cx="50%" cy="50%" innerRadius={28} outerRadius={46}
                              paddingAngle={3} dataKey="value">
                              {report.topWebsites.slice(0, 5).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v) => [fmtSec(v), 'Time']} contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 10 }} />
                            <Legend wrapperStyle={{ fontSize: 9, color: t.textSub }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN PANEL
// ════════════════════════════════════════════════════════════════════════════
export default function ActivityReportPanel() {
  const dark = useDark();
  const t    = tok(dark);

  const [staffList,   setStaffList]   = useState([]);
  const [reports,     setReports]     = useState({}); // { userId: report }
  const [agentStatus, setAgentStatus] = useState({}); // { userId: bool }
  const [loading,     setLoading]     = useState({}); // { userId: bool }
  const [pageLoading, setPageLoading] = useState(true);
  const [selDate,     setSelDate]     = useState(new Date().toISOString().slice(0, 10));

  // ── Fetch staff list from backend ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/users');
        setStaffList(res.data || []);
      } catch {
        setStaffList([]);
      } finally {
        setPageLoading(false);
      }
    }
    load();
  }, []);

  // ── Fetch activity report for a single staff member ───────────────────────
  // The backend proxies the request to the agent running on staff's PC,
  // OR the agent pushes daily reports to the backend (see backend endpoint).
  const fetchReport = useCallback(async (userId, date) => {
    setLoading(prev => ({ ...prev, [userId]: true }));
    try {
      // Backend endpoint: GET /activity/report/:userId?date=YYYY-MM-DD
      // (Backend fetches from the agent on staff PC, or from stored reports)
      const res = await api.get(`/activity/report/${userId}`, { params: { date } });
      if (res.data?.success) {
        setReports(prev => ({ ...prev, [userId]: res.data.report }));
        setAgentStatus(prev => ({ ...prev, [userId]: true }));
      } else {
        setAgentStatus(prev => ({ ...prev, [userId]: false }));
      }
    } catch {
      setAgentStatus(prev => ({ ...prev, [userId]: false }));
    } finally {
      setLoading(prev => ({ ...prev, [userId]: false }));
    }
  }, []);

  // ── Load all staff reports ────────────────────────────────────────────────
  useEffect(() => {
    if (staffList.length > 0) {
      staffList.forEach(staff => fetchReport(staff.id || staff._id, selDate));
    }
  }, [staffList, selDate]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      let y = 15;
      doc.setFontSize(18); doc.setTextColor(13, 59, 102);
      doc.text('Staff Computer Activity Report', 15, y); y += 8;
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Date: ${selDate}  |  Generated: ${new Date().toLocaleString()}`, 15, y); y += 10;

      for (const staff of staffList) {
        const id = staff.id || staff._id;
        const rpt = reports[id];
        if (!rpt) continue;

        doc.setFontSize(12); doc.setTextColor(13, 59, 102);
        doc.text(staff.full_name || staff.name, 15, y); y += 6;
        doc.autoTable({
          head: [['Metric', 'Value']],
          body: [
            ['Active Time', rpt.totalActive],
            ['Idle Time', rpt.totalIdle],
            ['Sessions', `${rpt.sessions?.length || 0}`],
            ['Top App', rpt.topApps?.[0]?.name || '—'],
            ['Top Website', rpt.topWebsites?.[0]?.domain || '—'],
          ],
          startY: y, margin: 15, theme: 'grid',
          headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255] },
        });
        y = doc.lastAutoTable.finalY + 6;

        if (rpt.topApps?.length > 0) {
          doc.autoTable({
            head: [['Application', 'Time']],
            body: rpt.topApps.map(a => [a.name, a.human]),
            startY: y, margin: 15, theme: 'striped',
          });
          y = doc.lastAutoTable.finalY + 8;
        }
        if (y > 240) { doc.addPage(); y = 15; }
      }
      doc.save(`activity-report-${selDate}.pdf`);
      toast.success('PDF exported!');
    } catch (e) {
      console.error(e);
      toast.error('PDF export failed');
    }
  };

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalStaff    = staffList.length;
  const onlineAgents  = Object.values(agentStatus).filter(Boolean).length;
  const totalActiveS  = Object.values(reports).reduce((s, r) => s + (r?.activeSeconds || 0), 0);

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: t.textMute }}>
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading staff...
      </div>
    );
  }

  return (
    <motion.div variants={cV} initial="hidden" animate="visible" className="space-y-4">

      {/* ── Header ── */}
      <motion.div variants={iV}>
        <div className="rounded-2xl overflow-hidden" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg,${C.blue},${C.mid},${C.green})` }} />
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black" style={{ color: C.blue }}>Computer Activity Reports</h2>
              <p className="text-xs mt-0.5" style={{ color: t.textSub }}>
                Apps used · Websites visited · Active hours · Session times — per staff per day
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Date picker */}
              <input
                type="date"
                value={selDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setSelDate(e.target.value)}
                className="h-8 px-3 text-xs rounded-xl font-medium focus:outline-none"
                style={{ background: t.card, border: `1px solid ${t.border}`, color: t.text }}
              />
              <button onClick={handlePdf}
                className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 text-white"
                style={{ background: C.blue }}>
                <Download className="w-3.5 h-3.5" /> Export PDF
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Summary KPIs ── */}
      <motion.div variants={iV} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Monitor}      label="Total Staff"     value={totalStaff}                   sub="In system"                color={C.blue}   dark={dark} />
        <StatCard icon={Wifi}         label="Agents Online"   value={onlineAgents}                 sub={`${totalStaff - onlineAgents} offline`} color={C.green}  dark={dark} />
        <StatCard icon={Clock}        label="Total Active"    value={fmtSec(totalActiveS)}         sub="Across all staff"         color={C.mid}    dark={dark} />
        <StatCard icon={BarChart2}    label="Date"            value={new Date(selDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})} sub={selDate} color={C.amber} dark={dark} />
      </motion.div>

      {/* ── Notice ── */}
      <motion.div variants={iV}>
        <div className="rounded-xl p-3 flex items-start gap-2"
          style={{ background: dark ? 'rgba(14,165,233,0.08)' : '#f0f9ff', border: '1px solid rgba(14,165,233,0.25)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#0ea5e9' }} />
          <p className="text-xs" style={{ color: dark ? '#7dd3fc' : '#0369a1' }}>
            <strong>Staff have been informed of this monitoring at install time.</strong> Reports only appear when the
            Taskosphere Agent is running on the staff member's PC. Offline agents show no data.
            <br />Tracked: application names, website domains, active/idle time, session start/end.
            <strong> NOT tracked: </strong>keystrokes, passwords, screenshots, or personal data.
          </p>
        </div>
      </motion.div>

      {/* ── Per-staff cards ── */}
      <div className="space-y-3">
        {staffList.length === 0 ? (
          <div className="rounded-xl p-8 flex flex-col items-center gap-3" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <Monitor className="w-10 h-10" style={{ color: t.textMute }} />
            <p className="text-sm" style={{ color: t.textMute }}>No staff found. Add staff in the Users page first.</p>
          </div>
        ) : (
          staffList.map(staff => {
            const id = staff.id || staff._id;
            return (
              <StaffActivityCard
                key={id}
                staff={staff}
                report={reports[id] || null}
                agentOnline={agentStatus[id] || false}
                loading={loading[id] || false}
                dark={dark}
                onRefresh={() => fetchReport(id, selDate)}
              />
            );
          })
        )}
      </div>

    </motion.div>
  );
}
