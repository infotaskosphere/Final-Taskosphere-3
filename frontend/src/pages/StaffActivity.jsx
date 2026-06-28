import React, { useState, useEffect, useCallback } from 'react';
import { MiniLoader } from '@/components/ui/GifLoader.jsx';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor, Clock, Globe, Shield, Keyboard, FolderOpen,
  LogIn, LogOut, Lock, Wifi, AlertTriangle, RefreshCw,
  Download, ChevronDown, ChevronUp, Users, Usb, Printer,
  Eye, FileText, Trash2, Upload, Cloud, MousePointer2,
  Activity, BarChart2, TrendingUp, AlertCircle, Search,
  Calendar, Filter, X, ChevronRight, Zap, ShieldAlert,
  Server, Cpu, HardDrive, MemoryStick, Heart, BatteryCharging,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// ─── Theme ────────────────────────────────────────────────────────────────────
const tok = (dark) => ({
  pageBg:   dark ? '#080f1a' : '#f0f4f8',
  card:     dark ? '#111827' : '#ffffff',
  card2:    dark ? '#1a2535' : '#f8fafc',
  border:   dark ? '#1f2d42' : '#e2e8f0',
  border2:  dark ? '#162030' : '#f1f5f9',
  text:     dark ? '#e2e8f0' : '#0f172a',
  textSub:  dark ? '#8899b4' : '#475569',
  textMute: dark ? '#3d5170' : '#94a3b8',
  hover:    dark ? '#131e2e' : '#f8fafc',
  inputBg:  dark ? '#1a2535' : '#ffffff',
  inputBdr: dark ? '#1f2d42' : '#e2e8f0',
  shadow:   dark ? '0 2px 12px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.06)',
});

const C = {
  blue:    '#0D3B66',
  mid:     '#1F6FB2',
  green:   '#1FAF5A',
  amber:   '#F59E0B',
  red:     '#EF4444',
  purple:  '#8B5CF6',
  cyan:    '#06B6D4',
  pink:    '#EC4899',
  orange:  '#F97316',
};
const PALETTE = [C.blue, C.mid, C.green, C.amber, C.red, C.purple, C.cyan, C.pink];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSec = (s) => {
  if (!s || s === 0) return '0h 0m';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h + 'h ' + m + 'm';
};
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

// ─── Animations ───────────────────────────────────────────────────────────────
const cV = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const iV = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } } };

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, dark }) => {
  const t = tok(dark);
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 shadow-2xl text-xs"
      style={{ background: t.card, border: '1px solid ' + t.border, color: t.text }}>
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((e, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: e.color }} />
          {e.name}: <strong>{e.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Section header ───────────────────────────────────────────────────────────
const SectionHeader = ({ icon: Icon, label, color, count, dark }) => {
  const t = tok(dark);
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '18', border: '1px solid ' + color + '30' }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <p className="text-sm font-bold tracking-tight flex-1" style={{ color: t.text }}>{label}</p>
      {count !== undefined && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: color + '18', color }}>{count}</span>
      )}
    </div>
  );
};

// ─── StatRow ──────────────────────────────────────────────────────────────────
const StatRow = ({ label, value, color, dark, flagged }) => {
  const t = tok(dark);
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid ' + t.border2 }}>
      <p className="text-xs font-medium" style={{ color: t.textSub }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: flagged ? C.red : (color || t.text) }}>
        {flagged && <AlertTriangle className="inline w-3 h-3 mr-1" />}{value}
      </p>
    </div>
  );
};

// ─── Card wrapper ─────────────────────────────────────────────────────────────
const Card = ({ children, dark, className = '', accentColor }) => {
  const t = tok(dark);
  return (
    <motion.div variants={iV} className={'rounded-2xl overflow-hidden ' + className}
      style={{ background: t.card, border: '1px solid ' + t.border, boxShadow: t.shadow }}>
      {accentColor && <div className="h-[3px] w-full" style={{ background: accentColor }} />}
      <div className="p-5">{children}</div>
    </motion.div>
  );
};

// ─── App bar ──────────────────────────────────────────────────────────────────
const AppBar = ({ name, seconds, total, dark, flagged }) => {
  const t = tok(dark);
  const ratio = total > 0 ? seconds / total : 0;
  const color = flagged ? C.red : C.mid;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
            style={{ background: flagged ? C.red : C.mid }}>
            {(name || 'A').charAt(0).toUpperCase()}
          </div>
          <p className="text-xs font-semibold" style={{ color: flagged ? C.red : t.text }}>
            {name}{flagged ? ' ⚠' : ''}
          </p>
        </div>
        <p className="text-xs font-bold tabular-nums" style={{ color }}>{fmtSec(seconds)}</p>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: t.border }}>
        <motion.div className="h-full rounded-full"
          initial={{ width: 0 }} animate={{ width: Math.round(ratio * 100) + '%' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ background: color }} />
      </div>
    </div>
  );
};

// ─── Score ring ───────────────────────────────────────────────────────────────
const ScoreRing = ({ value, label, color, size = 80, dark }) => {
  const t = tok(dark);
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * ((value || 0) / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={7} stroke={dark ? '#1f2d42' : '#f1f5f9'} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={7} stroke={color} strokeLinecap="round"
          strokeDasharray={dash + ' ' + circ} transform={'rotate(-90 ' + (size/2) + ' ' + (size/2) + ')'} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize="14" fontWeight="900">{value || 0}%</text>
      </svg>
      <p className="text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: t.textMute }}>{label}</p>
    </div>
  );
};

// ─── Staff card ───────────────────────────────────────────────────────────────
const StaffCard = ({ staff, selected, onClick, data, dark }) => {
  const t = tok(dark);
  const score = data?.productivity_percent ? Math.round(data.productivity_percent) : 0;
  const scoreColor = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
  return (
    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      onClick={onClick} className="w-full text-left rounded-xl p-3 transition-all"
      style={{
        background: selected ? C.mid + '15' : t.card2,
        border: '1.5px solid ' + (selected ? C.mid : t.border),
        boxShadow: selected ? '0 0 0 3px ' + C.mid + '18' : 'none',
      }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,' + C.blue + ',' + C.mid + ')' }}>
          {(staff.full_name || staff.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: t.text }}>{staff.full_name || staff.name}</p>
          <p className="text-[10px]" style={{ color: t.textMute }}>{staff.role || 'Staff'}</p>
        </div>
        {data && (
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-black" style={{ color: scoreColor }}>{score}%</p>
            <p className="text-[9px] font-bold uppercase" style={{ color: t.textMute }}>score</p>
          </div>
        )}
      </div>
    </motion.button>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function StaffActivity() {
  const { user } = useAuth();
  const dark = useDark();
  const t = tok(dark);
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: t.pageBg }}>
        <ShieldAlert className="w-16 h-16" style={{ color: t.textMute }} />
        <p className="text-lg font-bold" style={{ color: t.text }}>Admin Access Only</p>
        <p className="text-sm" style={{ color: t.textSub }}>This page is restricted to administrators.</p>
      </div>
    );
  }

  const [staffList,   setStaffList]   = useState([]);
  const [selectedId,  setSelectedId]  = useState(null);
  const [actData,     setActData]     = useState({});
  const [rawActivity, setRawActivity] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingUser, setLoadingUser] = useState(false);
  const [selDate,     setSelDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [search,      setSearch]      = useState('');
  const [activeTab,   setActiveTab]   = useState('session');
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Desktop Agent state ─────────────────────────────────────────────────
  const [desktopAgent,  setDesktopAgent]  = useState(null);
  const [desktopAct,    setDesktopAct]    = useState(null);    // activity report
  const [desktopProd,   setDesktopProd]   = useState(null);    // productivity report
  const [desktopDsc,    setDesktopDsc]    = useState([]);      // DSC events
  const [desktopUsb,    setDesktopUsb]    = useState([]);      // USB events
  const [desktopHealth, setDesktopHealth] = useState([]);      // health history
  const [loadingAgent,  setLoadingAgent]  = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await api.get('/users');
      // Include ALL users (staff + admin) so admin activity is also visible
      const list = (res.data || []);
      setStaffList(list);
      if (list.length > 0) setSelectedId(id => id || (list[0].id || list[0]._id));
    } catch { toast.error('Failed to load staff list'); }
  }, []);

  const fetchSummaries = useCallback(async () => {
    try {
      const res = await api.get('/activity/summary', { params: { date_from: selDate, date_to: selDate + 'T23:59:59' } });
      const map = {};
      (res.data || []).forEach(d => { map[d.user_id] = d; });
      setActData(map);
    } catch {}
  }, [selDate]);

  const fetchUserActivity = useCallback(async (uid) => {
    if (!uid) return;
    setLoadingUser(true);
    try {
      const res = await api.get('/activity/user/' + uid, { params: { limit: 500 } });
      setRawActivity(res.data || []);
    } catch { setRawActivity([]); }
    finally { setLoadingUser(false); }
  }, []);

  // ── Desktop Agent data fetch (for the selected staff member) ───────────────
  const fetchDesktopAgent = useCallback(async (uid) => {
    if (!uid) return;
    setLoadingAgent(true);
    try {
      // 1. Get all agents and find the one matching this user_id
      const agentsRes = await api.get('/desktop/agents', { params: { user_id: uid } });
      const agents = agentsRes.data?.agents || [];
      const agent = agents[0] || null;
      setDesktopAgent(agent);

      if (agent) {
        const agentId = agent.agent_id;
        // 2. Fetch activity, productivity, DSC, USB, health in parallel
        const [actRes, prodRes, dscRes, usbRes, healthRes] = await Promise.allSettled([
          api.get('/desktop/activity', { params: { agent_id: agentId, limit: 7 } }),
          api.get('/desktop/productivity', { params: { agent_id: agentId, limit: 7 } }),
          api.get('/desktop/dsc', { params: { agent_id: agentId, limit: 10 } }),
          api.get('/desktop/usb', { params: { agent_id: agentId, limit: 20 } }),
          api.get('/desktop/agent/' + agentId + '/health', { params: { hours: 24 } }),
        ]);
        if (actRes.status === 'fulfilled')    setDesktopAct(actRes.value.data?.reports?.[0] || null);
        if (prodRes.status === 'fulfilled')   setDesktopProd(prodRes.value.data?.reports?.[0] || null);
        if (dscRes.status === 'fulfilled')    setDesktopDsc(dscRes.value.data?.events || []);
        if (usbRes.status === 'fulfilled')    setDesktopUsb(usbRes.value.data?.events || []);
        if (healthRes.status === 'fulfilled') setDesktopHealth(healthRes.value.data?.health || []);
      } else {
        setDesktopAct(null); setDesktopProd(null);
        setDesktopDsc([]); setDesktopUsb([]); setDesktopHealth([]);
      }
    } catch {
      setDesktopAgent(null); setDesktopAct(null); setDesktopProd(null);
      setDesktopDsc([]); setDesktopUsb([]); setDesktopHealth([]);
    } finally {
      setLoadingAgent(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchStaff();
      await fetchSummaries();
      setLoading(false);
    })();
  }, [selDate]);

  useEffect(() => { if (selectedId) fetchUserActivity(selectedId); }, [selectedId]);
  useEffect(() => { if (selectedId) fetchDesktopAgent(selectedId); }, [selectedId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSummaries();
    if (selectedId) await fetchUserActivity(selectedId);
    setRefreshing(false);
    toast.success('Refreshed');
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedStaff = staffList.find(s => (s.id || s._id) === selectedId);
  const summary = actData[selectedId] || {};

  const todayEvents = rawActivity.filter(a => {
    const ts = a.timestamp || a.date || '';
    return !selDate || ts.startsWith(selDate);
  });

  // SESSION
  const loginEvents  = todayEvents.filter(a => a.type === 'login'        || a.event_type === 'login');
  const logoutEvents = todayEvents.filter(a => a.type === 'logout'       || a.event_type === 'logout');
  const lockEvents   = todayEvents.filter(a => a.type === 'lock'         || a.event_type === 'lock');
  const unlockEvents = todayEvents.filter(a => a.type === 'unlock'       || a.event_type === 'unlock');
  const remoteLogins = todayEvents.filter(a => a.remote === true         || a.event_type === 'remote_login');
  const failedLogins = todayEvents.filter(a => a.type === 'failed_login' || a.event_type === 'failed_login');
  const firstLogin   = loginEvents.length > 0
    ? new Date(loginEvents[loginEvents.length - 1].timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const lastLogout = logoutEvents.length > 0
    ? new Date(logoutEvents[0].timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const totalActive = summary.active_duration || todayEvents.filter(a => !a.idle).reduce((s, a) => s + (a.duration_seconds || 0), 0);
  const totalIdle   = summary.idle_duration   || todayEvents.filter(a =>  a.idle).reduce((s, a) => s + (a.duration_seconds || 0), 0);
  const breakDuration = Math.round(totalIdle * 0.7);

  // APPS
  const appsToShow = summary.apps_list?.length > 0
    ? summary.apps_list.map(a => ({ name: a.name, seconds: a.duration, count: a.count }))
    : Object.values(
        todayEvents.reduce((m, a) => {
          if (!a.app_name) return m;
          if (!m[a.app_name]) m[a.app_name] = { name: a.app_name, seconds: 0, count: 0 };
          m[a.app_name].seconds += a.duration_seconds || 0;
          m[a.app_name].count++;
          return m;
        }, {})
      ).sort((a, b) => b.seconds - a.seconds);
  const topApps = appsToShow.slice(0, 8);
  const totalAppTime = topApps.reduce((s, a) => s + (a.seconds || 0), 0);
  const BANNED = ['whatsapp', 'telegram', 'facebook', 'torrent', 'gaming', 'tiktok'];
  const unauthorizedApps = appsToShow.filter(a => BANNED.some(k => (a.name || '').toLowerCase().includes(k)));
  const appChartData = topApps.slice(0, 6).map(a => ({
    name: (a.name || 'App').split(' ')[0].slice(0, 10),
    minutes: Math.round((a.seconds || 0) / 60),
  }));

  // WEBSITES
  const webSummary = summary.websites || {};
  const websitesToShow = Object.keys(webSummary).length > 0
    ? Object.entries(webSummary).map(([name, s]) => ({ name, seconds: s })).sort((a, b) => b.seconds - a.seconds)
    : Object.values(
        todayEvents.reduce((m, a) => {
          const k = a.website || a.domain || a.url;
          if (!k) return m;
          if (!m[k]) m[k] = { name: k, seconds: 0 };
          m[k].seconds += a.duration_seconds || 0;
          return m;
        }, {})
      ).sort((a, b) => b.seconds - a.seconds);
  const PRODUCTIVE_SITES = ['github', 'stackoverflow', 'docs', 'sheets', 'drive', 'notion', 'jira', 'gmail', 'outlook'];
  const SOCIAL_SITES     = ['facebook', 'instagram', 'twitter', 'youtube', 'tiktok', 'reddit'];
  const SUSPECT_SITES    = ['torrent', 'vpn', 'proxy'];
  const classifySite = (name) => {
    const n = (name || '').toLowerCase();
    if (SUSPECT_SITES.some(s => n.includes(s)))     return 'suspicious';
    if (SOCIAL_SITES.some(s => n.includes(s)))      return 'social';
    if (PRODUCTIVE_SITES.some(s => n.includes(s)))  return 'productive';
    return 'neutral';
  };
  const webProductiveTime = websitesToShow.filter(w => classifySite(w.name) === 'productive').reduce((s, w) => s + w.seconds, 0);
  const webSocialTime     = websitesToShow.filter(w => classifySite(w.name) === 'social').reduce((s, w) => s + w.seconds, 0);
  const webNeutralTime    = websitesToShow.filter(w => classifySite(w.name) === 'neutral').reduce((s, w) => s + w.seconds, 0);
  const webTotalTime      = websitesToShow.reduce((s, w) => s + w.seconds, 0);
  const webPieData = [
    { name: 'Productive', value: Math.round(webProductiveTime / 60), color: C.green },
    { name: 'Social',     value: Math.round(webSocialTime / 60),     color: C.amber },
    { name: 'Other',      value: Math.round(webNeutralTime / 60),    color: C.mid   },
  ].filter(d => d.value > 0);

  // INPUT
  const keystrokeCount  = todayEvents.reduce((s, a) => s + (a.keystrokes || 0), 0);
  const mouseClicks     = todayEvents.reduce((s, a) => s + (a.mouse_clicks || 0), 0);
  const mouseDistance   = todayEvents.reduce((s, a) => s + (a.mouse_distance || 0), 0);
  const idlePercent     = totalActive + totalIdle > 0 ? Math.round(totalIdle / (totalActive + totalIdle) * 100) : 0;
  const productivityScore = summary.productivity_percent
    ? Math.round(summary.productivity_percent)
    : Math.min(100, Math.round(
        ((100 - idlePercent) * 0.5) +
        (Math.min(50, keystrokeCount / 100)) +
        (Math.min(20, mouseClicks / 100))
      ));

  // FILES
  const fileCreated    = todayEvents.filter(a => a.type === 'file_create'  || a.event_type === 'file_create').length;
  const fileModified   = todayEvents.filter(a => a.type === 'file_modify'  || a.event_type === 'file_modify').length;
  const fileDeleted    = todayEvents.filter(a => a.type === 'file_delete'  || a.event_type === 'file_delete').length;
  const usbTransfers   = todayEvents.filter(a => a.type === 'usb_transfer' || a.event_type === 'usb_transfer').length;
  const cloudUploads   = todayEvents.filter(a => a.type === 'cloud_upload' || a.event_type === 'cloud_upload').length;
  const sensitiveFiles = todayEvents.filter(a => a.sensitive === true      || a.event_type === 'sensitive_access');

  // SECURITY
  const usbEvents            = todayEvents.filter(a => (a.type || a.event_type || '').includes('usb'));
  const printEvents          = todayEvents.filter(a => a.type === 'print'            || a.event_type === 'print');
  const avDisabled           = todayEvents.filter(a => a.type === 'av_disabled'      || a.event_type === 'av_disabled');
  const vpnUsage             = todayEvents.filter(a => a.type === 'vpn'              || a.event_type === 'vpn' || a.vpn === true);
  const incognitoEvents      = todayEvents.filter(a => a.incognito === true          || a.event_type === 'incognito');
  const suspiciousTransfers  = todayEvents.filter(a => a.suspicious === true         || a.event_type === 'suspicious_transfer');
  const unauthorizedInstalls = todayEvents.filter(a => a.type === 'software_install' || a.event_type === 'software_install');
  const securityAlerts = avDisabled.length + suspiciousTransfers.length + unauthorizedInstalls.length + (vpnUsage.length > 0 ? 1 : 0);

  const filteredStaff = staffList.filter(s =>
    !search || (s.full_name || s.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    { id: 'session',  label: 'Session',  icon: LogIn,      color: C.blue   },
    { id: 'apps',     label: 'Apps',     icon: Monitor,    color: C.mid    },
    { id: 'web',      label: 'Web',      icon: Globe,      color: C.cyan   },
    { id: 'input',    label: 'Input',    icon: Keyboard,   color: C.purple },
    { id: 'files',    label: 'Files',    icon: FolderOpen, color: C.amber  },
    { id: 'security', label: 'Security', icon: Shield,     color: C.red    },
    { id: 'agent',    label: 'Desktop Agent', icon: Server, color: '#0EA5E9' },
  ];

  const exportPDF = async () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4'); let y = 15;
      doc.setFontSize(18); doc.setTextColor(13, 59, 102);
      doc.text('Staff Activity Report', 15, y); y += 8;
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text('Staff: ' + (selectedStaff?.full_name || '—') + '   Date: ' + selDate, 15, y); y += 12;
      doc.setFontSize(13); doc.setTextColor(13, 59, 102); doc.text('Session Overview', 15, y); y += 7;
      doc.autoTable({ startY: y, margin: 15, theme: 'grid',
        head: [['Metric', 'Value']],
        body: [['Login Time', firstLogin], ['Logout Time', lastLogout], ['Active Hours', fmtSec(totalActive)],
               ['Idle Time', fmtSec(totalIdle)], ['Lock/Unlock Events', lockEvents.length + ' / ' + unlockEvents.length],
               ['Failed Logins', failedLogins.length], ['Remote Logins', remoteLogins.length]],
        headStyles: { fillColor: [13, 59, 102], textColor: [255, 255, 255] } });
      y = doc.lastAutoTable.finalY + 10;
      if (topApps.length > 0) {
        doc.setFontSize(13); doc.setTextColor(13, 59, 102); doc.text('Application Usage', 15, y); y += 7;
        doc.autoTable({ startY: y, margin: 15, theme: 'grid', head: [['Application', 'Time Spent']],
          body: topApps.map(a => [a.name, fmtSec(a.seconds || 0)]),
          headStyles: { fillColor: [31, 111, 178], textColor: [255, 255, 255] } });
        y = doc.lastAutoTable.finalY + 10;
      }
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text('Productivity Score: ' + productivityScore + '%   Security Alerts: ' + securityAlerts, 15, y);
      doc.save('staff_activity_' + (selectedStaff?.full_name || 'staff').replace(/ /g, '_') + '_' + selDate + '.pdf');
      toast.success('PDF exported!');
    } catch { toast.error('Export failed'); }
  };

  if (loading) return <MiniLoader height={400} />;

  return (
    <motion.div variants={cV} initial="hidden" animate="visible"
      className="flex min-h-screen" style={{ background: t.pageBg }}>

      {/* ══ LEFT SIDEBAR ══ */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r"
        style={{ background: t.card, borderColor: t.border }}>
        <div className="p-4 border-b" style={{ borderColor: t.border }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: C.blue + '18' }}>
              <Users className="w-4 h-4" style={{ color: C.blue }} />
            </div>
            <div>
              <p className="text-sm font-black" style={{ color: t.text }}>Staff Monitor</p>
              <p className="text-[10px]" style={{ color: t.textMute }}>{staffList.length} members</p>
            </div>
          </div>
          <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
            className="w-full h-8 px-3 text-xs rounded-xl font-medium focus:outline-none focus:ring-2 mb-2"
            style={{ background: t.card2, border: '1px solid ' + t.inputBdr, color: t.text }} />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: t.textMute }} />
            <input placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-xl focus:outline-none focus:ring-2"
              style={{ background: t.card2, border: '1px solid ' + t.inputBdr, color: t.text }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin' }}>
          {filteredStaff.map(s => (
            <StaffCard key={s.id || s._id} staff={s}
              selected={(s.id || s._id) === selectedId}
              onClick={() => setSelectedId(s.id || s._id)}
              data={actData[s.id || s._id]} dark={dark} />
          ))}
          {filteredStaff.length === 0 && (
            <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No staff found</p>
          )}
        </div>
      </div>

      {/* ══ MAIN ══ */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

        {/* Top bar */}
        <div className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between gap-4"
          style={{ background: t.card, borderBottom: '1px solid ' + t.border }}>
          <div>
            <h1 className="text-base font-black" style={{ color: t.text }}>
              {selectedStaff ? (selectedStaff.full_name || selectedStaff.name) : 'Select a staff member'}
            </h1>
            <p className="text-[11px]" style={{ color: t.textMute }}>
              Activity for {selDate}
              {loadingUser && <span className="ml-2 inline-flex items-center gap-1 opacity-60">
                <RefreshCw className="w-3 h-3 animate-spin" /> Loading…
              </span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {securityAlerts > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: C.red + '18', color: C.red, border: '1px solid ' + C.red + '30' }}>
                <AlertCircle className="w-3.5 h-3.5" /> {securityAlerts} Alert{securityAlerts > 1 ? 's' : ''}
              </div>
            )}
            <button onClick={handleRefresh} disabled={refreshing}
              className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all"
              style={{ background: t.card2, border: '1px solid ' + t.border, color: t.text }}>
              <RefreshCw className={'w-3.5 h-3.5' + (refreshing ? ' animate-spin' : '')} /> Refresh
            </button>
            <button onClick={exportPDF}
              className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 text-white"
              style={{ background: C.blue }}>
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Score strip */}
          <motion.div variants={iV}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Productivity', value: productivityScore, color: productivityScore >= 70 ? C.green : C.amber },
                { label: 'Active Time',  value: pct(totalActive, totalActive + totalIdle), color: C.mid },
                { label: 'Web Focus',    value: webTotalTime > 0 ? pct(webProductiveTime, webTotalTime) : 0, color: C.cyan },
                { label: 'Security',     value: securityAlerts === 0 ? 100 : Math.max(0, 100 - securityAlerts * 15), color: securityAlerts > 0 ? C.red : C.green },
              ].map((s, i) => (
                <Card key={i} dark={dark} className="text-center">
                  <ScoreRing value={s.value} label={s.label} color={s.color} dark={dark} />
                </Card>
              ))}
            </div>
          </motion.div>

          {/* Tab bar */}
          <motion.div variants={iV}>
            <div className="flex gap-1.5 flex-wrap">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={activeTab === tab.id
                    ? { background: tab.color, color: '#fff', boxShadow: '0 2px 8px ' + tab.color + '40' }
                    : { background: t.card2, color: t.textSub, border: '1px solid ' + t.border }}>
                  <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  {tab.id === 'security' && securityAlerts > 0 && (
                    <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: activeTab === 'security' ? 'rgba(255,255,255,0.3)' : C.red, color: '#fff' }}>
                      {securityAlerts}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          <AnimatePresence mode="wait">

            {/* ── SESSION ── */}
            {activeTab === 'session' && (
              <motion.div key="session" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card dark={dark} accentColor={C.blue}>
                    <SectionHeader icon={LogIn} label="Login & Session Times" color={C.blue} dark={dark} />
                    <StatRow label="First Login"       value={firstLogin}                            color={C.green}  dark={dark} />
                    <StatRow label="Last Logout"       value={lastLogout}                            color={C.mid}    dark={dark} />
                    <StatRow label="Total Active"      value={fmtSec(totalActive)}                   color={C.blue}   dark={dark} />
                    <StatRow label="Idle Time"         value={fmtSec(totalIdle)}                     color={C.amber}  dark={dark} />
                    <StatRow label="Break Duration"    value={fmtSec(breakDuration)}                 color={C.purple} dark={dark} />
                    <StatRow label="Lock Events"       value={lockEvents.length}                                      dark={dark} />
                    <StatRow label="Unlock Events"     value={unlockEvents.length}                                    dark={dark} />
                    <StatRow label="Remote Logins"     value={remoteLogins.length}   flagged={remoteLogins.length > 0}  dark={dark} />
                    <StatRow label="Failed Attempts"   value={failedLogins.length}   flagged={failedLogins.length > 2}  dark={dark} />
                  </Card>

                  <Card dark={dark} accentColor={C.mid}>
                    <SectionHeader icon={Activity} label="Session Timeline" color={C.mid} dark={dark} />
                    <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                      {[...loginEvents, ...logoutEvents, ...lockEvents, ...failedLogins, ...remoteLogins]
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .slice(0, 15)
                        .map((e, i) => {
                          const type = e.type || e.event_type || 'event';
                          const col = type.includes('login') ? C.green : type.includes('logout') ? C.mid : type.includes('lock') ? C.amber : type.includes('failed') ? C.red : C.purple;
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ background: t.card2 }}>
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col }} />
                              <span style={{ color: t.textMute }} className="tabular-nums w-12 flex-shrink-0">
                                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                              <span className="font-medium capitalize" style={{ color: t.text }}>{type.replace(/_/g, ' ')}</span>
                            </div>
                          );
                        })}
                      {loginEvents.length + logoutEvents.length + lockEvents.length + failedLogins.length === 0 && (
                        <p className="text-xs py-8 text-center" style={{ color: t.textMute }}>No events recorded for this date</p>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Hourly activity */}
                <Card dark={dark} accentColor={'linear-gradient(90deg,' + C.blue + ',' + C.mid + ')'}>
                  <SectionHeader icon={BarChart2} label="Hourly Activity Pattern" color={C.mid} dark={dark} />
                  {(() => {
                    const hourBuckets = Array.from({ length: 14 }, (_, i) => {
                      const h = i + 7;
                      return { hour: h + ':00', active: 0, idle: 0 };
                    });
                    todayEvents.forEach(a => {
                      if (!a.timestamp) return;
                      const h = new Date(a.timestamp).getHours();
                      if (h >= 7 && h < 21) {
                        const bucket = hourBuckets[h - 7];
                        if (a.idle) bucket.idle   += Math.round((a.duration_seconds || 0) / 60);
                        else        bucket.active += Math.round((a.duration_seconds || 0) / 60);
                      }
                    });
                    const hasData = hourBuckets.some(h => h.active > 0 || h.idle > 0);
                    if (!hasData) return <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No hourly data for this date</p>;
                    return (
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={hourBuckets}>
                          <defs>
                            <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={C.mid}   stopOpacity={0.4} />
                              <stop offset="100%" stopColor={C.mid} stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={C.amber}   stopOpacity={0.3} />
                              <stop offset="100%" stopColor={C.amber} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="hour" tick={{ fontSize: 9, fill: t.textMute }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: t.textMute }} axisLine={false} tickLine={false} unit="m" />
                          <Tooltip content={<ChartTip dark={dark} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                          <Legend wrapperStyle={{ fontSize: 10, color: t.textSub }} />
                          <Area type="monotone" dataKey="active" stroke={C.mid}   strokeWidth={2} fill="url(#gA)" name="Active (min)" />
                          <Area type="monotone" dataKey="idle"   stroke={C.amber} strokeWidth={1.5} fill="url(#gI)" name="Idle (min)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </Card>
              </motion.div>
            )}

            {/* ── APPS ── */}
            {activeTab === 'apps' && (
              <motion.div key="apps" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card dark={dark} accentColor={C.mid}>
                    <SectionHeader icon={Monitor} label="Application Usage" color={C.mid} count={appsToShow.length} dark={dark} />
                    {topApps.length > 0
                      ? topApps.map((app, i) => (
                          <AppBar key={i} name={app.name} seconds={app.seconds || 0}
                            total={totalAppTime} dark={dark}
                            flagged={unauthorizedApps.some(u => u.name === app.name)} />
                        ))
                      : <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No app data recorded</p>
                    }
                    <div className="mt-4 pt-3" style={{ borderTop: '1px solid ' + t.border2 }}>
                      <StatRow label="Total Apps Opened"     value={appsToShow.length}                     dark={dark} />
                      <StatRow label="App Switches (est.)"   value={appsToShow.length * 4}                 dark={dark} />
                      <StatRow label="Background Activity"   value={todayEvents.filter(a => a.background).length} dark={dark} />
                      <StatRow label="Unauthorized Apps"     value={unauthorizedApps.length} flagged={unauthorizedApps.length > 0} dark={dark} />
                    </div>
                  </Card>

                  <Card dark={dark} accentColor={C.purple}>
                    <SectionHeader icon={BarChart2} label="Time per Application" color={C.purple} dark={dark} />
                    {appChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={appChartData} layout="vertical" barSize={12}>
                          <XAxis type="number" tick={{ fontSize: 9, fill: t.textMute }} axisLine={false} tickLine={false} unit="m" />
                          <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 9, fill: t.textSub }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTip dark={dark} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                          <Bar dataKey="minutes" name="Minutes" radius={[0, 6, 6, 0]}>
                            {appChartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No data</p>}
                    {topApps.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.textMute }}>Most-Used Software</p>
                        {topApps.slice(0, 3).map((a, i) => (
                          <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg"
                            style={{ background: t.card2, border: '1px solid ' + t.border }}>
                            <div className="flex items-center gap-2">
                              <span className="text-base">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                              <span className="font-semibold" style={{ color: t.text }}>{a.name}</span>
                            </div>
                            <span className="font-bold tabular-nums" style={{ color: C.mid }}>{fmtSec(a.seconds || 0)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                {unauthorizedApps.length > 0 && (
                  <Card dark={dark} accentColor={C.red}>
                    <SectionHeader icon={AlertTriangle} label="Unauthorized Software Detected" color={C.red} count={unauthorizedApps.length} dark={dark} />
                    <div className="space-y-2">
                      {unauthorizedApps.map((app, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-xl text-xs"
                          style={{ background: C.red + '10', border: '1px solid ' + C.red + '25' }}>
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.red }} />
                            <span className="font-semibold" style={{ color: t.text }}>{app.name}</span>
                          </div>
                          <span className="font-bold" style={{ color: C.red }}>{fmtSec(app.seconds || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </motion.div>
            )}

            {/* ── WEB ── */}
            {activeTab === 'web' && (
              <motion.div key="web" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card dark={dark} accentColor={C.cyan}>
                    <SectionHeader icon={Globe} label="Web Usage Split" color={C.cyan} dark={dark} />
                    {webPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={webPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                            paddingAngle={3} dataKey="value"
                            label={({ percent }) => (percent * 100).toFixed(0) + '%'} labelLine={false}>
                            {webPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip content={<ChartTip dark={dark} />} />
                          <Legend wrapperStyle={{ fontSize: 10, color: t.textSub }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No web data</p>}
                    <StatRow label="Total Web Time"   value={fmtSec(webTotalTime)}      color={C.cyan}  dark={dark} />
                    <StatRow label="Productive Sites" value={fmtSec(webProductiveTime)} color={C.green} dark={dark} />
                    <StatRow label="Social Media"     value={fmtSec(webSocialTime)}     color={C.amber} flagged={webSocialTime > 3600} dark={dark} />
                    <StatRow label="File Downloads"   value={todayEvents.filter(a => a.type === 'download').length} dark={dark} />
                    <StatRow label="Streaming"        value={websitesToShow.filter(w => /youtube|netflix|hotstar|prime/i.test(w.name)).length > 0 ? 'Detected' : 'None'} flagged={websitesToShow.filter(w => /youtube|netflix|hotstar|prime/i.test(w.name)).length > 0} dark={dark} />
                  </Card>

                  <div className="lg:col-span-2">
                    <Card dark={dark} accentColor={C.cyan}>
                      <SectionHeader icon={Globe} label="Websites Visited" color={C.cyan} count={websitesToShow.length} dark={dark} />
                      <div className="space-y-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {websitesToShow.slice(0, 20).map((w, i) => {
                          const cls = classifySite(w.name);
                          const col = cls === 'productive' ? C.green : cls === 'social' ? C.amber : cls === 'suspicious' ? C.red : t.textSub;
                          const badge = cls === 'productive' ? '✓ Productive' : cls === 'social' ? '⚡ Social' : cls === 'suspicious' ? '⚠ Suspicious' : 'Neutral';
                          return (
                            <div key={i} className="flex items-center justify-between p-2.5 rounded-xl text-xs"
                              style={{ background: t.card2, border: '1px solid ' + t.border }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col }} />
                                <span className="font-medium truncate max-w-[180px]" style={{ color: t.text }}>{w.name}</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ background: col + '18', color: col }}>{badge}</span>
                              </div>
                              <span className="font-bold tabular-nums flex-shrink-0 ml-2" style={{ color: col }}>{fmtSec(w.seconds)}</span>
                            </div>
                          );
                        })}
                        {websitesToShow.length === 0 && (
                          <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No website data recorded</p>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>

                {websitesToShow.filter(w => classifySite(w.name) === 'suspicious').length > 0 && (
                  <Card dark={dark} accentColor={C.red}>
                    <SectionHeader icon={ShieldAlert} label="Suspicious Websites" color={C.red}
                      count={websitesToShow.filter(w => classifySite(w.name) === 'suspicious').length} dark={dark} />
                    <div className="space-y-2">
                      {websitesToShow.filter(w => classifySite(w.name) === 'suspicious').map((w, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-xl text-xs"
                          style={{ background: C.red + '0e', border: '1px solid ' + C.red + '20' }}>
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-3.5 h-3.5" style={{ color: C.red }} />
                            <span className="font-medium" style={{ color: t.text }}>{w.name}</span>
                          </div>
                          <span className="font-bold" style={{ color: C.red }}>{fmtSec(w.seconds)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </motion.div>
            )}

            {/* ── INPUT ── */}
            {activeTab === 'input' && (
              <motion.div key="input" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card dark={dark} accentColor={C.purple}>
                    <SectionHeader icon={Keyboard} label="Keyboard Activity" color={C.purple} dark={dark} />
                    <StatRow label="Keystrokes (Count)"  value={keystrokeCount.toLocaleString()} color={C.purple} dark={dark} />
                    <StatRow label="Content Stored"      value="None (Privacy Protected)"        color={C.green}  dark={dark} />
                    <StatRow label="Active Work Time"    value={fmtSec(totalActive)}             color={C.mid}    dark={dark} />
                    <div className="mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: t.textMute }}>Typing Intensity</p>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: t.border }}>
                        <motion.div className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: Math.min(100, Math.round(keystrokeCount / 50)) + '%' }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          style={{ background: 'linear-gradient(90deg,' + C.purple + ',' + C.pink + ')' }} />
                      </div>
                      <div className="flex justify-between text-[9px] mt-1" style={{ color: t.textMute }}>
                        <span>Low</span><span>Medium</span><span>High</span>
                      </div>
                    </div>
                  </Card>

                  <Card dark={dark} accentColor={C.cyan}>
                    <SectionHeader icon={MousePointer2} label="Mouse Activity" color={C.cyan} dark={dark} />
                    <StatRow label="Mouse Clicks"    value={mouseClicks.toLocaleString()}   color={C.cyan}  dark={dark} />
                    <StatRow label="Mouse Distance"  value={mouseDistance > 0 ? Math.round(mouseDistance / 1000) + 'km' : '—'} color={C.mid} dark={dark} />
                    <StatRow label="Total Idle Time" value={fmtSec(totalIdle)}             color={C.amber} dark={dark} />
                    <StatRow label="Idle Percentage" value={idlePercent + '%'}             flagged={idlePercent > 40} dark={dark} />
                    <StatRow label="Idle Detection"  value={idlePercent > 40 ? 'High Idle' : idlePercent > 20 ? 'Moderate' : 'Good'} color={idlePercent > 40 ? C.red : idlePercent > 20 ? C.amber : C.green} dark={dark} />
                  </Card>
                </div>

                <Card dark={dark} accentColor={productivityScore >= 70 ? C.green : C.amber}>
                  <div className="flex items-center gap-6 flex-wrap">
                    <ScoreRing value={productivityScore} label="Productivity" size={100}
                      color={productivityScore >= 70 ? C.green : productivityScore >= 40 ? C.amber : C.red} dark={dark} />
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-base font-black mb-3" style={{ color: t.text }}>Engagement Score Breakdown</p>
                      <div className="space-y-2">
                        {[
                          { label: 'Keyboard activity',  val: Math.min(100, Math.round(keystrokeCount / 30)),   color: C.purple },
                          { label: 'Mouse engagement',   val: Math.min(100, Math.round(mouseClicks / 20)),      color: C.cyan   },
                          { label: 'Active vs idle',     val: 100 - idlePercent,                               color: C.green  },
                          { label: 'App productivity',   val: pct(
                              appsToShow.filter(a => !BANNED.some(k => (a.name || '').toLowerCase().includes(k))).reduce((s, a) => s + (a.seconds || 0), 0),
                              totalAppTime
                            ), color: C.mid },
                        ].map((m, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <p className="text-[10px] w-36 flex-shrink-0" style={{ color: t.textSub }}>{m.label}</p>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: t.border }}>
                              <motion.div className="h-full rounded-full"
                                initial={{ width: 0 }} animate={{ width: m.val + '%' }}
                                transition={{ duration: 0.8, delay: i * 0.1 }}
                                style={{ background: m.color }} />
                            </div>
                            <p className="text-[10px] font-bold w-8 text-right tabular-nums" style={{ color: m.color }}>{m.val}%</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* ── FILES ── */}
            {activeTab === 'files' && (
              <motion.div key="files" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Created',        value: fileCreated,          icon: FileText,   color: C.green                              },
                    { label: 'Modified',       value: fileModified,         icon: TrendingUp, color: C.mid                                },
                    { label: 'Deleted',        value: fileDeleted,          icon: Trash2,     color: C.red                                },
                    { label: 'USB Transfers',  value: usbTransfers,         icon: Usb,        color: C.amber, flagged: usbTransfers > 0   },
                    { label: 'Cloud Uploads',  value: cloudUploads,         icon: Cloud,      color: C.cyan                               },
                    { label: 'Sensitive Files',value: sensitiveFiles.length, icon: Eye,       color: C.purple, flagged: sensitiveFiles.length > 0 },
                  ].map((s, i) => (
                    <Card key={i} dark={dark}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                        style={{ background: s.color + '18' }}>
                        <s.icon className="w-4 h-4" style={{ color: s.color }} />
                      </div>
                      <p className="text-2xl font-black" style={{ color: s.flagged && s.value > 0 ? C.red : s.color }}>
                        {s.flagged && s.value > 0 && <AlertTriangle className="inline w-4 h-4 mr-0.5" />}{s.value}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wider mt-1" style={{ color: t.textMute }}>{s.label}</p>
                    </Card>
                  ))}
                </div>

                {sensitiveFiles.length > 0 && (
                  <Card dark={dark} accentColor={C.red}>
                    <SectionHeader icon={Eye} label="Sensitive Document Access" color={C.red} count={sensitiveFiles.length} dark={dark} />
                    <div className="space-y-2">
                      {sensitiveFiles.slice(0, 10).map((f, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-xs"
                          style={{ background: C.red + '0e', border: '1px solid ' + C.red + '20' }}>
                          <Eye className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.red }} />
                          <span className="flex-1 truncate" style={{ color: t.text }}>{f.file_name || f.path || 'Unknown file'}</span>
                          <span style={{ color: t.textMute }}>{f.timestamp ? new Date(f.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {usbEvents.length > 0 && (
                  <Card dark={dark} accentColor={C.amber}>
                    <SectionHeader icon={Usb} label="External Drive / USB Activity" color={C.amber} count={usbEvents.length} dark={dark} />
                    <div className="space-y-2">
                      {usbEvents.slice(0, 8).map((e, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-xs"
                          style={{ background: C.amber + '10', border: '1px solid ' + C.amber + '25' }}>
                          <Usb className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.amber }} />
                          <span className="flex-1 capitalize" style={{ color: t.text }}>
                            {(e.type || e.event_type || '').replace(/_/g, ' ')} — {e.device || 'USB Device'}
                          </span>
                          <span style={{ color: t.textMute }}>{e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </motion.div>
            )}

            {/* ── SECURITY ── */}
            {activeTab === 'security' && (
              <motion.div key="security" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

                {securityAlerts > 0 ? (
                  <motion.div variants={iV} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: C.red + '12', border: '1px solid ' + C.red + '30' }}>
                    <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: C.red }} />
                    <p className="text-sm font-bold" style={{ color: C.red }}>{securityAlerts} Security Alert{securityAlerts > 1 ? 's' : ''} Detected</p>
                  </motion.div>
                ) : (
                  <motion.div variants={iV} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: C.green + '12', border: '1px solid ' + C.green + '30' }}>
                    <Shield className="w-5 h-5 flex-shrink-0" style={{ color: C.green }} />
                    <p className="text-sm font-bold" style={{ color: C.green }}>No Security Alerts — All Clear</p>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card dark={dark} accentColor={C.red}>
                    <SectionHeader icon={Shield} label="Security Monitoring" color={C.red} dark={dark} />
                    <StatRow label="USB Insertions/Removals"     value={usbEvents.length}            flagged={usbEvents.length > 0}            dark={dark} />
                    <StatRow label="Print Jobs"                  value={printEvents.length}           color={C.amber}                           dark={dark} />
                    <StatRow label="Antivirus Disabled"          value={avDisabled.length}            flagged={avDisabled.length > 0}           dark={dark} />
                    <StatRow label="Unauthorized Installs"       value={unauthorizedInstalls.length}  flagged={unauthorizedInstalls.length > 0} dark={dark} />
                    <StatRow label="VPN / Proxy Usage"           value={vpnUsage.length > 0 ? 'Detected' : 'None'} flagged={vpnUsage.length > 0} dark={dark} />
                    <StatRow label="Incognito Browsing"          value={incognitoEvents.length > 0 ? 'Detected' : 'None'} flagged={incognitoEvents.length > 0} dark={dark} />
                    <StatRow label="Suspicious Data Transfers"   value={suspiciousTransfers.length}  flagged={suspiciousTransfers.length > 0}  dark={dark} />
                  </Card>

                  <Card dark={dark} accentColor={C.orange}>
                    <SectionHeader icon={ShieldAlert} label="Risk Assessment" color={C.orange} dark={dark} />
                    <div className="flex justify-center my-2">
                      <ScoreRing value={securityAlerts === 0 ? 100 : Math.max(0, 100 - securityAlerts * 15)}
                        label="Security Score" size={100}
                        color={securityAlerts === 0 ? C.green : securityAlerts < 3 ? C.amber : C.red} dark={dark} />
                    </div>
                    <div className="mt-4 space-y-2">
                      {[
                        { label: 'USB Activity',    risk: usbEvents.length > 2 ? 'High' : usbEvents.length > 0 ? 'Medium' : 'None',    color: usbEvents.length > 0 ? C.amber : C.green },
                        { label: 'AV Status',       risk: avDisabled.length > 0 ? 'Critical' : 'OK',                                   color: avDisabled.length > 0 ? C.red : C.green },
                        { label: 'VPN/Proxy',       risk: vpnUsage.length > 0 ? 'Flagged' : 'None',                                    color: vpnUsage.length > 0 ? C.amber : C.green },
                        { label: 'Data Transfer',   risk: suspiciousTransfers.length > 0 ? 'Suspicious' : 'Normal',                    color: suspiciousTransfers.length > 0 ? C.red : C.green },
                        { label: 'Private Browse',  risk: incognitoEvents.length > 0 ? 'Detected' : 'None',                           color: incognitoEvents.length > 0 ? C.amber : C.green },
                        { label: 'Print Activity',  risk: printEvents.length > 10 ? 'High' : printEvents.length > 0 ? 'Logged' : 'None', color: printEvents.length > 10 ? C.amber : C.green },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg"
                          style={{ background: t.card2 }}>
                          <span style={{ color: t.textSub }}>{item.label}</span>
                          <span className="font-bold px-2 py-0.5 rounded-full text-[10px]"
                            style={{ background: item.color + '15', color: item.color }}>{item.risk}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {[...usbEvents, ...avDisabled, ...vpnUsage, ...suspiciousTransfers, ...unauthorizedInstalls].length > 0 && (
                  <Card dark={dark} accentColor={C.red}>
                    <SectionHeader icon={AlertTriangle} label="Security Event Timeline" color={C.red} dark={dark} />
                    <div className="space-y-2 max-h-60 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                      {[...usbEvents, ...avDisabled, ...vpnUsage, ...suspiciousTransfers, ...unauthorizedInstalls]
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .map((e, i) => {
                          const type = e.type || e.event_type || 'security_event';
                          const col = type.includes('av') ? C.red : type.includes('usb') ? C.amber : type.includes('vpn') ? C.purple : C.orange;
                          return (
                            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-xs"
                              style={{ background: col + '0e', border: '1px solid ' + col + '20' }}>
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: col }} />
                              <span className="flex-1 capitalize font-medium" style={{ color: t.text }}>
                                {type.replace(/_/g, ' ')}{e.device ? ' — ' + e.device : ''}
                              </span>
                              <span className="tabular-nums" style={{ color: t.textMute }}>
                                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </Card>
                )}
              </motion.div>
            )}

            {/* ── DESKTOP AGENT ── */}
            {activeTab === 'agent' && (
              <motion.div key="agent" variants={cV} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

                {loadingAgent ? (
                  <Card dark={dark}><div className="py-12 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: t.textMute }} /><p className="text-xs" style={{ color: t.textMute }}>Loading agent data…</p></div></Card>
                ) : !desktopAgent ? (
                  <Card dark={dark}>
                    <div className="py-12 text-center">
                      <Server className="w-10 h-10 mx-auto mb-3" style={{ color: t.textMute }} />
                      <p className="text-sm font-bold" style={{ color: t.text }}>No Desktop Agent Found</p>
                      <p className="text-xs mt-1" style={{ color: t.textMute }}>
                        This staff member has not installed the Taskosphere Agent yet.<br />
                        Install the agent on their machine to see live activity, DSC status, and USB events here.
                      </p>
                    </div>
                  </Card>
                ) : (
                  <>
                    {/* Agent status cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Status',     value: desktopAgent.status || 'unknown',     icon: Heart,         color: (desktopAgent.status === 'online') ? C.green : C.red },
                        { label: 'Version',    value: desktopAgent.agent_version || '—',    icon: Zap,           color: C.mid   },
                        { label: 'CPU',        value: desktopAgent.cpu_usage ? Math.round(desktopAgent.cpu_usage) + '%' : '—', icon: Cpu,    color: C.purple },
                        { label: 'Memory',     value: desktopAgent.mem_usage_mb ? Math.round(desktopAgent.mem_usage_mb) + ' MB' : '—', icon: MemoryStick, color: C.amber },
                        { label: 'DSC Token',  value: desktopAgent.dsc_plugged ? 'Connected' : 'None', icon: Shield, color: desktopAgent.dsc_plugged ? C.green : t.textMute },
                        { label: 'Last Ping',  value: desktopAgent.last_heartbeat ? new Date(desktopAgent.last_heartbeat).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—', icon: Clock, color: C.cyan },
                      ].map((s, i) => (
                        <Card key={i} dark={dark}>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                            style={{ background: s.color + '18' }}>
                            <s.icon className="w-4 h-4" style={{ color: s.color }} />
                          </div>
                          <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: t.textMute }}>{s.label}</p>
                        </Card>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                      {/* System info + activity */}
                      <Card dark={dark} accentColor="#0EA5E9">
                        <SectionHeader icon={Server} label="Machine & Activity" color="#0EA5E9" dark={dark} />
                        <StatRow label="Machine Name"    value={desktopAgent.machine_name || '—'}          color={C.mid}    dark={dark} />
                        <StatRow label="Hostname"        value={desktopAgent.hostname || '—'}                                    dark={dark} />
                        <StatRow label="OS"              value={desktopAgent.os_version || '—'}                                  dark={dark} />
                        <StatRow label="CPU"             value={desktopAgent.cpu || '—'}                  color={C.purple} dark={dark} />
                        <StatRow label="RAM"             value={desktopAgent.ram_total_mb ? Math.round(desktopAgent.ram_total_mb / 1024) + ' GB' : '—'} color={C.amber} dark={dark} />
                        <StatRow label="Disk Free"       value={desktopAgent.disk_free_gb ? desktopAgent.disk_free_gb + ' GB' : '—'} dark={dark} />
                        <StatRow label="IP Address"      value={desktopAgent.ip_address || '—'}           color={C.cyan}   dark={dark} />
                        <StatRow label="Uptime"          value={desktopAgent.uptime_seconds ? (() => { const s = desktopAgent.uptime_seconds; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return h > 24 ? Math.floor(h/24)+'d '+h%24+'h' : h > 0 ? h+'h '+m+'m' : m+'m'; })() : '—'} dark={dark} />
                        {desktopAct && (
                          <>
                            <div className="my-3" style={{ borderTop: '1px dashed ' + t.border }} />
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: t.textMute }}>Today's Activity (from agent)</p>
                            <StatRow label="Active Time"   value={fmtSec(desktopAct.activeSeconds)}   color={C.green}  dark={dark} />
                            <StatRow label="Idle Time"     value={fmtSec(desktopAct.idleSeconds)}     color={C.amber}  dark={dark} />
                            <StatRow label="Focus Time"    value={fmtSec(desktopAct.focusSeconds)}    color={C.mid}    dark={dark} />
                            {desktopAct.topApps?.slice(0, 4).map((app, i) => (
                              <StatRow key={i} label={'  ' + app.name} value={fmtSec(app.seconds)} dark={dark} />
                            ))}
                          </>
                        )}
                      </Card>

                      {/* Productivity */}
                      <Card dark={dark} accentColor={C.green}>
                        <SectionHeader icon={TrendingUp} label="Productivity (from agent)" color={C.green} dark={dark} />
                        {desktopProd ? (
                          <>
                            <div className="flex justify-center my-3">
                              <ScoreRing value={desktopProd.score || 0} label="Productivity Score" size={100}
                                color={(desktopProd.score || 0) >= 70 ? C.green : (desktopProd.score || 0) >= 40 ? C.amber : C.red}
                                dark={dark} />
                            </div>
                            <StatRow label="Productive Time"   value={fmtSec(desktopProd.productiveTime)}   color={C.green}  dark={dark} />
                            <StatRow label="Unproductive Time" value={fmtSec(desktopProd.unproductiveTime)} color={C.red}    dark={dark} />
                            <StatRow label="Neutral Time"      value={fmtSec(desktopProd.neutralTime)}      color={t.textSub} dark={dark} />
                            {desktopProd.appBreakdown?.slice(0, 5).map((app, i) => {
                              const col = app.category === 'productive' ? C.green : app.category === 'unproductive' ? C.red : t.textSub;
                              return <StatRow key={i} label={'  ' + app.name + ' (' + app.category + ')'} value={fmtSec(app.seconds)} color={col} dark={dark} />;
                            })}
                            {desktopProd.domainBreakdown?.slice(0, 3).map((d, i) => {
                              const col = d.category === 'productive' ? C.green : d.category === 'unproductive' ? C.red : t.textSub;
                              return <StatRow key={i} label={'  🌐 ' + d.domain} value={fmtSec(d.seconds)} color={col} dark={dark} />;
                            })}
                          </>
                        ) : (
                          <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No productivity data yet</p>
                        )}
                      </Card>
                    </div>

                    {/* DSC + USB */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                      {/* DSC */}
                      <Card dark={dark} accentColor={C.purple}>
                        <SectionHeader icon={Shield} label="DSC Token Events" color={C.purple} count={desktopDsc.length} dark={dark} />
                        {desktopDsc.length > 0 ? (
                          <div className="space-y-2 max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                            {desktopDsc.slice(0, 6).map((evt, i) => (
                              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-xs"
                                style={{ background: evt.plugged ? C.green + '10' : t.card2, border: '1px solid ' + (evt.plugged ? C.green + '30' : t.border) }}>
                                <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: evt.plugged ? C.green : t.textMute }} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate" style={{ color: t.text }}>
                                    {evt.cert?.holder_name || 'Unknown cert'}
                                  </p>
                                  <p className="text-[10px]" style={{ color: t.textMute }}>
                                    {evt.cert?.issuer || '—'} · Exp: {evt.cert?.expiry_date || '—'}
                                  </p>
                                </div>
                                <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: t.textMute }}>
                                  {evt.updated_at ? new Date(evt.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No DSC events recorded</p>
                        )}
                      </Card>

                      {/* USB */}
                      <Card dark={dark} accentColor={C.amber}>
                        <SectionHeader icon={Usb} label="USB Device Events" color={C.amber} count={desktopUsb.length} dark={dark} />
                        {desktopUsb.length > 0 ? (
                          <div className="space-y-2 max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                            {desktopUsb.slice(0, 6).map((evt, i) => (
                              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl text-xs"
                                style={{ background: evt.event === 'connected' ? C.green + '08' : C.red + '08', border: '1px solid ' + (evt.event === 'connected' ? C.green + '25' : C.red + '25') }}>
                                <Usb className="w-3.5 h-3.5 flex-shrink-0" style={{ color: evt.event === 'connected' ? C.green : C.red }} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate" style={{ color: t.text }}>{evt.device_name || 'USB Device'}</p>
                                  <p className="text-[10px]" style={{ color: t.textMute }}>
                                    {evt.device_type} {evt.vendor_id ? '· VID ' + evt.vendor_id : ''}
                                  </p>
                                </div>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ background: (evt.event === 'connected' ? C.green : C.red) + '18', color: evt.event === 'connected' ? C.green : C.red }}>
                                  {evt.event}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-center py-8" style={{ color: t.textMute }}>No USB events recorded</p>
                        )}
                      </Card>
                    </div>

                    {/* Health chart */}
                    {desktopHealth.length > 0 && (
                      <Card dark={dark} accentColor={C.mid}>
                        <SectionHeader icon={Heart} label="Agent Health (last 24h)" color={C.mid} dark={dark} />
                        <ResponsiveContainer width="100%" height={180}>
                          <AreaChart data={desktopHealth.map(h => ({
                            time: new Date(h.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                            cpu: Math.round(h.cpu_usage || 0),
                            mem: Math.round((h.mem_usage_mb || 0) / 10),
                            online: h.internet_connected ? 1 : 0,
                          }))}>
                            <defs>
                              <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.purple} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={C.purple} stopOpacity={0.02} />
                              </linearGradient>
                              <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.amber} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={C.amber} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: t.textMute }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 9, fill: t.textMute }} axisLine={false} tickLine={false} unit="%" />
                            <Tooltip content={<ChartTip dark={dark} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                            <Legend wrapperStyle={{ fontSize: 10, color: t.textSub }} />
                            <Area type="monotone" dataKey="cpu" stroke={C.purple} strokeWidth={1.5} fill="url(#gCpu)" name="CPU %" />
                            <Area type="monotone" dataKey="mem" stroke={C.amber} strokeWidth={1.5} fill="url(#gMem)" name="Mem (×10 MB)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </Card>
                    )}
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
