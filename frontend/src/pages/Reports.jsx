import React, { useState, useEffect, useMemo } from 'react';
import GifLoader, { MiniLoader } from '@/components/ui/GifLoader.jsx';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { normalizeCompanies } from "@/lib/companies";
import { toast } from 'sonner';
import {
  BarChart3, TrendingUp, Clock, Award, Users, CheckCircle2,
  AlertTriangle, Target, Download, RefreshCw, Activity,
  Calendar, Star, Zap, Shield,
  GripVertical, Settings2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { getJsPDF, getAutoTable } from '@/lib/lazyLibs';
import LayoutCustomizer from '@/components/layout/LayoutCustomizer';
import { usePageLayout } from '@/hooks/usePageLayout';

// ─── Colors ──────────────────────────────────────────────────────────────────
const C = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber:        '#F59E0B',
  coral:        '#EF4444',
};
const PALETTE = ['#0D3B66','#1F6FB2','#1FAF5A','#5CCB5F','#F59E0B','#EF4444'];

// ─── Animations ───────────────────────────────────────────────────────────────
const cV = { hidden:{opacity:0}, visible:{opacity:1,transition:{staggerChildren:0.06}} };
const iV = { hidden:{opacity:0,y:16}, visible:{opacity:1,y:0,transition:{duration:0.35,ease:[0.23,1,0.32,1]}} };

// Dark mode via shared hook (imported above)

// ─── Theme tokens (light / dark) ─────────────────────────────────────────────
const tok = (dark) => ({
  pageBg:   dark ? '#0f172a' : '#f8fafc',
  card:     dark ? '#1e293b' : '#ffffff',
  card2:    dark ? '#263348' : '#f8fafc',
  border:   dark ? '#334155' : '#e2e8f0',
  border2:  dark ? '#1e293b' : '#f1f5f9',
  text:     dark ? '#e2e8f0' : '#1e293b',
  textSub:  dark ? '#94a3b8' : '#64748b',
  textMute: dark ? '#475569' : '#94a3b8',
  hover:    dark ? '#1a2942' : '#f8fafc',
  inputBg:  dark ? '#263348' : '#ffffff',
  inputBdr: dark ? '#334155' : '#e2e8f0',
  shadow:   dark ? '0 1px 4px rgba(0,0,0,0.45)' : '0 1px 4px rgba(0,0,0,0.06)',
});

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmt     = m  => !m||m===0 ? '0h 0m' : `${Math.floor(m/60)}h ${m%60}m`;
const fmtH    = h  => !h||h===0 ? '0h 0m' : `${Math.floor(h)}h ${Math.round((h%1)*60)}m`;
// Compact: never wraps — no minutes when ≥100h
const fmtC    = m  => {
  if (!m||m===0) return '0h';
  const h=Math.floor(m/60), mn=m%60;
  return h>=100 ? `${h}h` : mn>0 ? `${h}h ${mn}m` : `${h}h`;
};

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, dark }) => {
  const t = tok(dark);
  if (!active||!payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl text-xs"
      style={{background:t.card, border:`1px solid ${t.border}`, color:t.text}}>
      {label&&<p className="font-semibold mb-1">{label}</p>}
      {payload.map((e,i)=>(
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:e.color}}/>
          {e.name}: <strong>{e.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── KPI Card — Dashboard metric card style ───────────────────────────────────
const KpiCard = ({ label, value, sub, color, icon:Icon, dark }) => {
  const t = tok(dark);
  return (
    <motion.div variants={iV} className="h-full"
      whileHover={{ y: -3, transition: { type: 'spring', stiffness: 280, damping: 22 } }}
      whileTap={{ scale: 0.985 }}>
      <div className="rounded-2xl overflow-hidden flex flex-col h-full group cursor-default"
        style={{background:t.card, border:`1px solid ${t.border}`, boxShadow:t.shadow}}>
        {/* accent stripe — same as Dashboard metric cards */}
        <div className="h-[3px] w-full flex-shrink-0" style={{background:color}} />
        <div className="p-3 sm:p-4 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider leading-tight"
              style={{color:t.textMute}}>{label}</p>
            <div className="p-2 rounded-xl group-hover:scale-110 transition-transform flex-shrink-0"
              style={{background:`${color}1a`}}>
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{color}} />
            </div>
          </div>
          <p className="mt-1.5 text-xl sm:text-2xl font-bold leading-none tracking-tight" style={{color}}>
            {value}
          </p>
          <p className="mt-1 text-[10px] sm:text-xs font-medium leading-snug flex-1 break-words"
            style={{color:t.textSub, minHeight:'1rem'}}>
            {sub || '\u00A0'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Section wrapper ─────────────────────────────────────────────────────────
const Sec = ({ title, desc, children, action, dark }) => {
  const t = tok(dark);
  return (
    <motion.div variants={iV}>
      <div className="rounded-xl overflow-hidden"
        style={{background:t.card, border:`1px solid ${t.border}`, boxShadow:t.shadow}}>
        <div className="h-[2px] w-full"
          style={{background:`linear-gradient(90deg,${C.deepBlue},${C.emeraldGreen})`}} />
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold" style={{color:t.text}}>{title}</p>
            {desc&&<p className="text-xs mt-0.5" style={{color:t.textSub}}>{desc}</p>}
          </div>
          {action}
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </motion.div>
  );
};

// ─── Empty state ─────────────────────────────────────────────────────────────
const Empty = ({ icon:Icon, text, dark }) => {
  const t = tok(dark);
  return (
    <div className="h-44 flex flex-col items-center justify-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{background:t.card2}}>
        <Icon className="w-5 h-5" style={{color:t.textMute}} />
      </div>
      <p className="text-xs font-medium" style={{color:t.textMute}}>{text}</p>
    </div>
  );
};

// ─── Performer row ────────────────────────────────────────────────────────────
const PerfRow = ({ m, rank, dark }) => {
  const t = tok(dark);
  const G=rank===1, S=rank===2, B=rank===3, P=G||S||B;
  const medal = G?'🥇':S?'🥈':B?'🥉':`#${rank}`;
  const grad  = G?'linear-gradient(135deg,#7B5A0A,#C9920A,#FFD700)'
              : S?'linear-gradient(135deg,#3A3A3A,#707070,#C0C0C0)'
              : B?'linear-gradient(135deg,#5C2E00,#A0521A,#CD7F32)':undefined;
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl"
      style={P?{background:grad}:{background:t.card2,border:`1px solid ${t.border}`}}>
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={P?{background:'rgba(0,0,0,0.2)',color:'#fff'}:{background:t.border,color:t.textSub}}>
          {medal}
        </span>
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
          {m.profile_picture
            ? <img src={m.profile_picture} alt={m.user_name} className="w-full h-full object-cover"/>
            : <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                style={{background:`linear-gradient(135deg,${C.deepBlue},${C.mediumBlue})`}}>
                {m.user_name?.charAt(0)?.toUpperCase()||'?'}
              </div>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate max-w-[110px]"
            style={P?{color:'#fff'}:{color:t.text}}>{m.user_name||'Unknown'}</p>
          <p className="text-[10px]"
            style={P?{color:'rgba(255,255,255,0.6)'}:{color:t.textMute}}>{m.badge||'Good Performer'}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black" style={P?{color:'#fff'}:{color:C.deepBlue}}>{m.final_score??m.overall_score}</p>
        <p className="text-[10px]" style={P?{color:'rgba(255,255,255,0.5)'}:{color:t.textMute}}>{fmtH(m.total_hours)}</p>
      </div>
    </div>
  );
};

// ─── Tab button ───────────────────────────────────────────────────────────────
const TabBtn = ({ id, label, icon:Icon, active, onClick, dark }) => {
  const t = tok(dark);
  return (
    <button onClick={()=>onClick(id)}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex-shrink-0"
      style={active
        ?{background:C.deepBlue,color:'#fff',boxShadow:'0 2px 6px rgba(13,59,102,0.35)'}
        :{background:t.card2,color:t.textSub,border:`1px solid ${t.border}`}}>
      <Icon className="w-3.5 h-3.5"/>{label}
    </button>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const { user, hasPermission } = useAuth();
  const dark = useDark();
  const t    = tok(dark);

  const isAdmin   = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canDL     = isAdmin || hasPermission('can_download_reports');

  // Cross-visibility is purely explicit — TEAM = CROSS VISIBILITY ON USER.
  // Backend already scopes data; frontend just determines whether user-switcher is shown.
  const crossVisReports    = user?.permissions?.view_other_reports || [];
  const hasCrossVisReports = crossVisReports.length > 0;
  const canSwitchUser = isAdmin || hasCrossVisReports;

  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks,      setTasks]      = useState([]);
  const [dashStats,  setDashStats]  = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [allUsers,   setAllUsers]   = useState([]);
  const [companies,  setCompanies]  = useState([]);
  const [performers, setPerformers] = useState([]);
  const [rankPeriod, setRankPeriod] = useState('monthly');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selUser,    setSelUser]    = useState('all');
  const [selCompany, setSelCompany] = useState('all');

  // ── Attendance report filters — kept inside the existing Attendance tab ──
  const [attPreset, setAttPreset] = useState('month');
  const [attFrom, setAttFrom] = useState('');
  const [attTo, setAttTo] = useState('');
  const [attCompany, setAttCompany] = useState('all');
  const [attDepartment, setAttDepartment] = useState('all');
  const [attUser, setAttUser] = useState('all');
  const [attRole, setAttRole] = useState('all');
  const [attStatus, setAttStatus] = useState('all');
  const [attFlag, setAttFlag] = useState('all');
  const [attSearch, setAttSearch] = useState('');

  const [tab,        setTab]        = useState('overview');
  const [showCustomize, setShowCustomize] = useState(false);
  const RPT_SECTIONS = ['kpi_row','tab_panels'];
  const RPT_LABELS = {
    kpi_row:    { name:'KPI Stats Row',  icon:'📊', desc:'6 summary cards — tasks, completion, attendance, DSC…' },
    tab_panels: { name:'Tab Panels',     icon:'📑', desc:'Overview, tasks, attendance, efficiency, performers, team' },
  };
  const { order: rptOrder, moveSection: rptMove, resetOrder: rptReset } = usePageLayout('reports', RPT_SECTIONS);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchCompanies = async () => {
    try {
      const r = await api.get('/companies/list');
      setCompanies(normalizeCompanies(r));
    } catch { setCompanies([]); }
  };

  const fetchAll = async (ref=false) => {
    ref ? setRefreshing(true) : setLoading(true);
    // NOTE: /tasks capped to the 500 most-recently-created tasks (stop-gap for load
    // time). For firms with very high task volume this can undercount efficiency
    // stats for long-tenured staff — a true paginated/aggregated backend endpoint
    // would be the correct long-term fix.
    const [r1,r2,r3,r4] = await Promise.allSettled([
      api.get('/tasks', { params: { page: 1, page_size: 500 } }),
      api.get('/dashboard/stats'),
      api.get('/attendance/history'),
      (isAdmin || hasCrossVisReports) ? api.get('/users') : Promise.resolve({data:[]}),
    ]);
    if (r1.status==='fulfilled') setTasks(r1.value?.data?.tasks || (Array.isArray(r1.value?.data) ? r1.value.data : []));
    if (r2.status==='fulfilled') setDashStats(r2.value?.data||null);
    if (r3.status==='fulfilled') setAttendance(r3.value?.data||[]);
    if (r4.status==='fulfilled') {
      const rawUsers = r4.value?.data || [];
      // Admin + Manager: backend scopes team automatically, show all returned users.
      // User: filter to explicit cross-vis list only.
      setAllUsers(
        isAdmin || isManager
          ? rawUsers
          : rawUsers.filter(u => crossVisReports.includes(u.id || u._id))
      );
    }
    setLoading(false); setRefreshing(false);
  };

  const fetchPerf = async () => {
    try {
      const p = rankPeriod==='all'?'all_time':rankPeriod;
      const r = await api.get('/reports/performance-rankings',{params:{period:p}});
      setPerformers(r.data||[]);
    } catch { setPerformers([]); }
  };

  useEffect(()=>{ if(user) { fetchAll(); fetchCompanies(); } },[user]);
  useEffect(()=>{ fetchPerf(); },[rankPeriod]);

  // ── Attendance report helpers ─────────────────────────────────────────────
  const isoLocalDate = (d) => {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  };

  const reportDateRange = useMemo(() => {
    const now = new Date();
    const today = isoLocalDate(now);
    if (attPreset === 'today') return { from: today, to: today };
    if (attPreset === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      const from = isoLocalDate(d);
      d.setDate(d.getDate() + 6);
      return { from, to: isoLocalDate(d) };
    }
    if (attPreset === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth()+1, 0);
      return { from: isoLocalDate(from), to: isoLocalDate(to) };
    }
    if (attPreset === 'last_month') {
      const from = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoLocalDate(from), to: isoLocalDate(to) };
    }
    if (attPreset === 'year') {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    if (attPreset === 'last_year') {
      const y = now.getFullYear()-1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    return { from: attFrom || today, to: attTo || today };
  }, [attPreset, attFrom, attTo]);

  useEffect(()=>{
    if (attPreset === 'custom') return;
    setAttFrom(reportDateRange.from);
    setAttTo(reportDateRange.to);
  }, [attPreset, reportDateRange.from, reportDateRange.to]);

  const userMap = useMemo(()=>{
    const m = new Map();
    allUsers.forEach(u=>{
      const id = u?.id || u?._id;
      if (id) m.set(String(id), u);
    });
    return m;
  }, [allUsers]);

  const attendanceUsers = useMemo(()=>{
    const m = new Map();
    allUsers.forEach(u=>{
      const id = u?.id || u?._id;
      if (id) m.set(String(id), u);
    });
    attendance.forEach(a=>{
      const id = a?.user_id;
      if (id && !m.has(String(id))) m.set(String(id), {
        id, full_name:a.user_name || a.full_name || 'Unknown',
        company_id:a.company_id, department:a.department, role:a.role,
      });
    });
    return Array.from(m.values()).filter(u=>u?.id);
  }, [allUsers, attendance]);

  const attendanceDepartments = useMemo(()=>Array.from(new Set(
    attendanceUsers.map(u=>u.department).filter(Boolean).map(String)
  )).sort((a,b)=>a.localeCompare(b)), [attendanceUsers]);

  const attendanceRoles = useMemo(()=>Array.from(new Set(
    attendanceUsers.map(u=>u.role).filter(Boolean).map(String)
  )).sort((a,b)=>a.localeCompare(b)), [attendanceUsers]);

  const attendanceCompanies = useMemo(()=>{
    const m = new Map();
    companies.forEach(c=>{ if(c?.id) m.set(String(c.id), c); });
    attendanceUsers.forEach(u=>{
      if(u?.company_id && !m.has(String(u.company_id))) m.set(String(u.company_id), {id:u.company_id,name:u.company_name || 'Company'});
    });
    return Array.from(m.values());
  }, [companies, attendanceUsers]);

  const reportAttendanceRows = useMemo(()=>{
    const from = reportDateRange.from || '';
    const to = reportDateRange.to || '';
    const search = attSearch.trim().toLowerCase();
    return attendance
      .map((a, idx)=>{
        const u = userMap.get(String(a?.user_id || ''));
        const companyId = a?.company_id || u?.company_id || '';
        const companyName = a?.company_name || u?.company_name || attendanceCompanies.find(c=>String(c.id)===String(companyId))?.name || '—';
        const department = a?.department || u?.department || '—';
        const role = a?.role || u?.role || '—';
        const employeeName = a?.user_name || u?.full_name || u?.name || 'Unknown';
        const employeeId = a?.employee_id || u?.employee_id || u?.employee_code || '—';
        const status = String(a?.status || 'unknown').toLowerCase();
        const late = !!a?.is_late;
        const early = !!a?.punched_out_early;
        const auto = !!a?.auto_marked;
        const missingOut = !!a?.punch_in && !a?.punch_out;
        const wfh = String(a?.work_mode || a?.attendance_type || '').toLowerCase().includes('wfh') || a?.is_wfh === true;
        return { ...a, _idx:idx, _user:u, _companyId:String(companyId||''), _companyName:companyName, _department:department, _role:role, _employeeName:employeeName, _employeeId:employeeId, _status:status, _late:late, _early:early, _auto:auto, _missingOut:missingOut, _wfh:wfh };
      })
      .filter(a=>{
        if (from && String(a.date||'') < from) return false;
        if (to && String(a.date||'') > to) return false;
        if (attCompany !== 'all' && a._companyId !== String(attCompany)) return false;
        if (attDepartment !== 'all' && String(a._department) !== String(attDepartment)) return false;
        if (attUser !== 'all' && String(a.user_id) !== String(attUser)) return false;
        if (attRole !== 'all' && String(a._role) !== String(attRole)) return false;
        if (attStatus !== 'all' && a._status !== attStatus) return false;
        if (attFlag !== 'all') {
          if (attFlag==='late' && !a._late) return false;
          if (attFlag==='early' && !a._early) return false;
          if (attFlag==='missing_out' && !a._missingOut) return false;
          if (attFlag==='auto' && !a._auto) return false;
          if (attFlag==='wfh' && !a._wfh) return false;
          if (attFlag==='present' && !a.punch_in) return false;
          if (attFlag==='absent' && a._status!=='absent') return false;
        }
        if (search) {
          const hay = [a._employeeName,a._employeeId,a._companyName,a._department,a._role,a.date,a._status].join(' ').toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || String(a._employeeName).localeCompare(String(b._employeeName)));
  }, [attendance, userMap, attendanceCompanies, reportDateRange, attCompany, attDepartment, attUser, attRole, attStatus, attFlag, attSearch]);

  const reportSummary = useMemo(()=>{
    const rows = reportAttendanceRows;
    const present = rows.filter(a=>a._status==='present' && a.punch_in).length;
    const absent = rows.filter(a=>a._status==='absent').length;
    const leave = rows.filter(a=>a._status==='leave').length;
    const half = rows.filter(a=>a._status==='half_day' || a._status==='half-day').length;
    const late = rows.filter(a=>a._late).length;
    const early = rows.filter(a=>a._early).length;
    const missing = rows.filter(a=>a._missingOut).length;
    const auto = rows.filter(a=>a._auto).length;
    const wfh = rows.filter(a=>a._wfh).length;
    const minutes = rows.reduce((s,a)=>s + Number(a.duration_minutes||0),0);
    const people = new Set(rows.map(a=>String(a.user_id||''))).size;
    return { total:rows.length, people, present, absent, leave, half, late, early, missing, auto, wfh, minutes, avg:present?Math.round(minutes/present):0 };
  }, [reportAttendanceRows]);

  const exactDateTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-IN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  };

  const exactTime = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  };

  const reportFilterLabel = useMemo(()=>{
    const parts=[];
    if(attCompany!=='all') parts.push(`Company: ${attendanceCompanies.find(c=>String(c.id)===String(attCompany))?.name||attCompany}`);
    if(attDepartment!=='all') parts.push(`Department: ${attDepartment}`);
    if(attUser!=='all') parts.push(`Employee: ${attendanceUsers.find(u=>String(u.id||u._id)===String(attUser))?.full_name||'Selected'}`);
    if(attRole!=='all') parts.push(`Role: ${attRole}`);
    if(attStatus!=='all') parts.push(`Status: ${attStatus}`);
    if(attFlag!=='all') parts.push(`Flag: ${attFlag}`);
    return parts.length?parts.join(' | '):'All users / all selected records';
  }, [attCompany,attDepartment,attUser,attRole,attStatus,attFlag,attendanceCompanies,attendanceUsers]);

  const downloadAttendanceCsv = () => {
    if(!canDL){ toast.error('You do not have permission to download reports'); return; }
    const headers=['Date','Employee','Employee ID','Company','Department','Role','Status','Exact Login','Exact Logout','Duration','Late','Early Out','Missing Punch-Out','Auto Marked','Work Mode','Latitude','Longitude','Leave Reason','Notes'];
    const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const rows=reportAttendanceRows.map(a=>[
      a.date,a._employeeName,a._employeeId,a._companyName,a._department,a._role,a._status,
      exactDateTime(a.punch_in),exactDateTime(a.punch_out),fmt(a.duration_minutes||0),
      a._late?'Yes':'No',a._early?'Yes':'No',a._missingOut?'Yes':'No',a._auto?'Yes':'No',
      a.work_mode||a.attendance_type||(a._wfh?'WFH':'Office'),a.latitude??'',a.longitude??'',a.leave_reason||'',a.notes||''
    ].map(esc).join(','));
    const csv=[headers.map(esc).join(','),...rows].join('
');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`attendance_report_${reportDateRange.from}_${reportDateRange.to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Attendance CSV downloaded (${reportAttendanceRows.length} records)`);
  };

  const downloadAttendancePdf = async () => {
    if(!canDL){ toast.error('You do not have permission to download reports'); return; }
    try {
      const jsPDF = await getJsPDF();
      await getAutoTable();
      const doc=new jsPDF('l','mm','a4');
      let y=12;
      doc.setFontSize(18); doc.setTextColor(13,59,102); doc.text('Attendance Report',12,y); y+=7;
      doc.setFontSize(9); doc.setTextColor(80,80,80);
      doc.text(`Period: ${reportDateRange.from || '—'} to ${reportDateRange.to || '—'}`,12,y);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`,125,y); y+=5;
      doc.text(reportFilterLabel,12,y); y+=7;

      doc.setFontSize(10); doc.setTextColor(13,59,102); doc.text('Report Summary',12,y); y+=4;
      doc.autoTable({
        head:[['Employees','Records','Present','Absent','Leave','Half Day','Late','Early Out','Missing Out','Total Hours','Avg / Present Day']],
        body:[[reportSummary.people,reportSummary.total,reportSummary.present,reportSummary.absent,reportSummary.leave,reportSummary.half,reportSummary.late,reportSummary.early,reportSummary.missing,fmt(reportSummary.minutes),fmt(reportSummary.avg)]],
        startY:y,margin:{left:12,right:12},theme:'grid',styles:{fontSize:7,cellPadding:2},headStyles:{fillColor:[13,59,102],textColor:[255,255,255],fontStyle:'bold'},
      });
      y=doc.lastAutoTable.finalY+7;

      const body=reportAttendanceRows.map(a=>[
        a.date,a._employeeName,a._employeeId,a._companyName,a._department,a._role,a._status,
        exactDateTime(a.punch_in),exactDateTime(a.punch_out),fmt(a.duration_minutes||0),
        a._late?'Yes':'No',a._early?'Yes':'No',a._missingOut?'Yes':'No',a._auto?'Yes':'No',
        a.work_mode||a.attendance_type||(a._wfh?'WFH':'Office'),
        `${a.latitude??'—'}, ${a.longitude??'—'}`,a.leave_reason||a.notes||'—'
      ]);
      doc.autoTable({
        head:[['Date','Employee','Emp. ID','Company','Department','Role','Status','Login','Logout','Duration','Late','Early','Missing Out','Auto','Mode','Location','Remarks']],
        body,startY:y,margin:{left:8,right:8},theme:'grid',
        styles:{fontSize:5.5,cellPadding:1.5,overflow:'linebreak',valign:'middle'},
        headStyles:{fillColor:[31,111,178],textColor:[255,255,255],fontStyle:'bold',fontSize:5.5},
        alternateRowStyles:{fillColor:[248,250,252]},
        didDrawPage:(data)=>{
          const page=doc.internal.getNumberOfPages();
          doc.setFontSize(7); doc.setTextColor(100,100,100);
          doc.text(`Taskosphere • Attendance Report • Page ${page}`,8,doc.internal.pageSize.getHeight()-5);
        },
      });
      doc.save(`attendance_report_${reportDateRange.from}_${reportDateRange.to}.pdf`);
      toast.success(`Attendance PDF exported (${reportAttendanceRows.length} records)`);
    } catch(e) { console.error(e); toast.error('Attendance PDF failed'); }
  };

  const resetAttendanceFilters = () => {
    setAttPreset('month'); setAttCompany('all'); setAttDepartment('all'); setAttUser('all');
    setAttRole('all'); setAttStatus('all'); setAttFlag('all'); setAttSearch('');
  };

  // ── Derived: tasks ────────────────────────────────────────────────────────
  const fTasks = useMemo(()=>
    selUser==='all'?tasks:tasks.filter(t=>t.assigned_to===selUser||t.created_by===selUser),
    [tasks,selUser]);

  const done   = useMemo(()=>fTasks.filter(t=>t.status==='completed'),[fTasks]);
  const wip    = useMemo(()=>fTasks.filter(t=>t.status==='in_progress'),[fTasks]);
  const pend   = useMemo(()=>fTasks.filter(t=>t.status==='pending'),[fTasks]);
  const overdue= useMemo(()=>{
    const now=new Date();
    return fTasks.filter(t=>t.due_date&&new Date(t.due_date)<now&&t.status!=='completed');
  },[fTasks]);
  const compRate= fTasks.length>0?Math.round((done.length/fTasks.length)*100):0;

  // ── Derived: attendance ───────────────────────────────────────────────────
  const fAtt    = useMemo(()=>selUser==='all'?attendance:attendance.filter(a=>a.user_id===selUser),[attendance,selUser]);
  const totMins = useMemo(()=>fAtt.reduce((s,a)=>s+(a.duration_minutes||0),0),[fAtt]);
  const presDays= useMemo(()=>fAtt.filter(a=>a.status==='present'&&a.punch_in).length,[fAtt]);
  const avgMins = presDays>0?Math.round(totMins/presDays):0;
  const lateDays= useMemo(()=>fAtt.filter(a=>a.is_late).length,[fAtt]);

  // ── Unique users (dropdown) ───────────────────────────────────────────────
  const uUsers = useMemo(()=>{
    if (!isAdmin && !hasCrossVisReports) return [];
    const m=new Map();
    allUsers.forEach(u=>{if(u.id&&u.full_name)m.set(u.id,u);});
    const all = Array.from(m.values());
    if (selCompany === 'all') return all;
    return all.filter(u => u.company_id === selCompany);
  },[allUsers,isAdmin,selCompany]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const statusData = useMemo(()=>[
    {name:'Completed',  value:done.length, color:C.emeraldGreen},
    {name:'In Progress',value:wip.length,  color:C.mediumBlue  },
    {name:'Pending',    value:pend.length, color:C.amber       },
  ].filter(d=>d.value>0),[done,wip,pend]);

  const catData = useMemo(()=>{
    const cc={};
    fTasks.forEach(t=>{const c=t.category||'Other';cc[c]=(cc[c]||0)+1;});
    return Object.entries(cc)
      .map(([name,count],i)=>({name:name.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()),tasks:count,fill:PALETTE[i%PALETTE.length]}))
      .sort((a,b)=>b.tasks-a.tasks).slice(0,7);
  },[fTasks]);

  const weeklyData = useMemo(()=>{
    const today=new Date(), diff=today.getDay()-1;
    const mon=new Date(today); mon.setDate(today.getDate()-(diff>=0?diff:diff+7)); mon.setHours(0,0,0,0);
    const days=Array.from({length:7},(_,i)=>{
      const d=new Date(mon); d.setDate(mon.getDate()+i);
      return {name:d.toLocaleDateString('en-US',{weekday:'short'}),completed:0,pending:0};
    });
    fTasks.forEach(t=>{
      const gs=ds=>{const d=new Date(ds);d.setHours(0,0,0,0);return d;};
      if (t.status==='completed'&&t.completed_at){const i=Math.floor((gs(t.completed_at)-mon)/86400000);if(i>=0&&i<7)days[i].completed++;}
      if (t.status!=='completed'&&t.created_at){const i=Math.floor((gs(t.created_at)-mon)/86400000);if(i>=0&&i<7)days[i].pending++;}
    });
    return days;
  },[fTasks]);

  const attTrend = useMemo(()=>{
    const today=new Date();
    const days=Array.from({length:7},(_,i)=>{
      const d=new Date(today); d.setDate(today.getDate()-(6-i));
      return {name:d.toLocaleDateString('en-US',{weekday:'short'}),date:d.toISOString().slice(0,10),hours:0};
    });
    fAtt.forEach(a=>{const day=days.find(d=>d.date===a.date);if(day)day.hours=Math.round((a.duration_minutes||0)/60*10)/10;});
    return days;
  },[fAtt]);

  const prioData = useMemo(()=>{
    const cc={critical:0,urgent:0,high:0,medium:0,low:0};
    fTasks.forEach(t=>{const p=(t.priority||'medium').toLowerCase();if(cc[p]!==undefined)cc[p]++;});
    return [
      {name:'Critical',value:cc.critical,color:'#dc2626'},
      {name:'Urgent',  value:cc.urgent,  color:'#ea580c'},
      {name:'High',    value:cc.high,    color:C.amber  },
      {name:'Medium',  value:cc.medium,  color:C.mediumBlue},
      {name:'Low',     value:cc.low,     color:C.emeraldGreen},
    ].filter(d=>d.value>0);
  },[fTasks]);

  const radarData = useMemo(()=>{
    const p=performers[0]; if(!p) return [];
    return [
      {metric:'Attendance',    score:Math.round((p.attendance_score||0)/2.5*10)/10},
      {metric:'Task Done',     score:Math.round((p.task_completion_score||0)/3*10)/10},
      {metric:'Timeliness',    score:Math.round((p.task_timeliness_score||0)/2*10)/10},
      {metric:'Working Hours', score:p.working_hours_score||0},
      {metric:'Quality',       score:Math.round((p.quality_score||0)/0.5*10)/10},
    ];
  },[performers]);

  // ── Efficiency cards — real tasks + real attendance ───────────────────────
  const effCards = useMemo(()=>{
    if (!isAdmin && !hasCrossVisReports) {
      // Own data only (staff without any cross-vis — Issue #3)
      const myT=tasks.filter(t=>t.assigned_to===user?.id);
      const myA=attendance.filter(a=>a.user_id===user?.id);
      const myM=myA.reduce((s,a)=>s+(a.duration_minutes||0),0);
      const myD=myA.filter(a=>a.status==='present').length;
      return [{
        user_id:user?.id,user_name:user?.full_name||'You',
        total:myT.length,done:myT.filter(t=>t.status==='completed').length,
        pend:myT.filter(t=>t.status!=='completed').length,
        mins:myM,days:myD,
        pct:myT.length>0?Math.round((myT.filter(t=>t.status==='completed').length/myT.length)*100):0,
      }];
    }
    // Issue #2: Manager (hasCrossVisReports=true) + Admin — aggregate over allUsers
    // allUsers is already team-scoped by backend for managers; admin sees all.
    // User with explicit view_other_reports also uses this path.
    const uMap={};
    if (user?.id) uMap[user.id]={user_id:user.id,user_name:user.full_name||'You',total:0,done:0,pend:0,mins:0,days:0,pct:0};
    allUsers.forEach(u=>{uMap[u.id]={user_id:u.id,user_name:u.full_name,total:0,done:0,pend:0,mins:0,days:0,pct:0};});
    tasks.forEach(t=>{const u=t.assigned_to;if(u&&uMap[u]){uMap[u].total++;t.status==='completed'?uMap[u].done++:uMap[u].pend++;}});
    attendance.forEach(a=>{const u=a.user_id;if(u&&uMap[u]){uMap[u].mins+=(a.duration_minutes||0);if(a.status==='present')uMap[u].days++;}});
    Object.values(uMap).forEach(u=>{u.pct=u.total>0?Math.round((u.done/u.total)*100):0;});
    let cards=Object.values(uMap);
    if(selUser!=='all') cards=cards.filter(c=>c.user_id===selUser);
    return cards.sort((a,b)=>b.done-a.done);
  },[tasks,attendance,allUsers,isAdmin,user,selUser,hasCrossVisReports,crossVisReports]);

  const teamWL = useMemo(()=>(dashStats?.team_workload||[]).slice(0,12),[dashStats]);

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleCsv = () => {
    const h=['User','Total Tasks','Completed','Pending','Completion%','Screen Time(min)','Days Present'];
    const rows=effCards.map(d=>[d.user_name,d.total,d.done,d.pend,`${d.pct}%`,d.mins,d.days]);
    const csv=[h,...rows].map(r=>r.join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='efficiency_reports.csv';a.click();
    toast.success('CSV downloaded!');
  };

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePdf = async () => {
    try {
      const jsPDF = await getJsPDF();
      await getAutoTable(); // side-effect: patches doc.autoTable(...)
      const doc=new jsPDF('p','mm','a4'); let y=15;
      doc.setFontSize(20);doc.setTextColor(13,59,102);
      doc.text('Efficiency Reports & Analytics',15,y);y+=9;
      doc.setFontSize(10);doc.setTextColor(100,100,100);
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Period: ${rankPeriod}`,15,y);y+=10;

      doc.setFontSize(12);doc.setTextColor(13,59,102);doc.text('Key Performance Indicators',15,y);y+=8;
      doc.autoTable({
        head:[['Metric','Value']],
        body:[
          ['Total Tasks',fTasks.length.toString()],['Completed',done.length.toString()],
          ['In Progress',wip.length.toString()],['Overdue',overdue.length.toString()],
          ['Completion Rate',`${compRate}%`],['Days Present',presDays.toString()],
          ['Total Screen Time',fmt(totMins)],['Avg Daily Hours',fmt(avgMins)],
          ['Late Punch-ins',lateDays.toString()],
        ],
        startY:y,margin:15,theme:'grid',
        headStyles:{fillColor:[13,59,102],textColor:[255,255,255],fontStyle:'bold'},
        alternateRowStyles:{fillColor:[240,240,240]},
      });
      y=doc.lastAutoTable.finalY+12;

      if(effCards.length>0){
        if(y>180){doc.addPage();y=15;}
        doc.setFontSize(12);doc.setTextColor(13,59,102);doc.text('Efficiency Breakdown',15,y);y+=8;
        doc.autoTable({
          head:[['User','Tasks','Completed','Pending','Completion%','Screen Time','Days']],
          body:effCards.map(d=>[d.user_name,d.total,d.done,d.pend,`${d.pct}%`,fmt(d.mins),d.days]),
          startY:y,margin:15,theme:'grid',
          headStyles:{fillColor:[31,111,178],textColor:[255,255,255],fontStyle:'bold'},
        });
        y=doc.lastAutoTable.finalY+12;
      }

      if(performers.length>0){
        doc.addPage();y=15;
        doc.setFontSize(12);doc.setTextColor(13,59,102);doc.text('Performance Leaderboard',15,y);y+=8;
        doc.autoTable({
          head:[['Rank','Name','Final Score','Att. Score','Task Done','Timeliness','Hours Score','Quality','Consistency','Auto Absent','Att. %','Badge']],
          body:performers.map((m,i)=>[`#${i+1}`,m.user_name,m.final_score??m.overall_score*10,m.attendance_score,m.task_completion_score,m.task_timeliness_score,m.working_hours_score,m.quality_score,m.consistency_bonus,m.auto_absent_count,`${m.attendance_percent}%`,m.badge||'Needs Improvement']),
          startY:y,margin:15,theme:'grid',
          headStyles:{fillColor:[31,111,178],textColor:[255,255,255],fontStyle:'bold'},
        });
      }
      doc.save('efficiency_reports.pdf');
      toast.success('PDF exported!');
    } catch(e){console.error(e);toast.error('PDF failed');}
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <MiniLoader height={400} />;

  const tabs=[
    {id:'overview',   label:'Overview',    icon:BarChart3 },
    {id:'tasks',      label:'Tasks',       icon:Target    },
    {id:'attend',     label:'Attendance',  icon:Clock     },
    {id:'efficiency', label:'Efficiency',  icon:Zap       },
    {id:'performers', label:'Performers',  icon:Award     },
    // Team tab: Admin only. Non-admin users (including manager) see only own + cross-vis data.
    ...(isAdmin ? [{id:'team',label:'Team',icon:Users}] : []),
  ];

  const cursorStyle={fill:dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'};

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
   <>
    <LayoutCustomizer
      isOpen={showCustomize}
      onClose={() => setShowCustomize(false)}
      order={rptOrder}
      sectionLabels={RPT_LABELS}
      onDragEnd={rptMove}
      onReset={rptReset}
      isDark={dark}
    />
    <motion.div variants={cV} initial="hidden" animate="visible"
      className="space-y-4 min-h-full"
      style={{background:t.pageBg}}>

      {/* ══ HEADER — Dashboard-style banner ══ */}
      <motion.div variants={iV}>
        <div
          className="relative overflow-hidden rounded-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-4"
          style={{
            background: `linear-gradient(135deg, ${C.deepBlue} 0%, ${C.mediumBlue} 60%, #1a8fcc 100%)`,
            boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
          }}
        >
          {/* decorative circles */}
          <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5"
            style={{ background: 'white' }} />

          <div className="relative">
            {/* Title + action row */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Activity className="h-3 w-3" /> Analytics
                </p>
                <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                  Reports &amp; Analytics
                </h1>
                <p className="text-white/60 text-sm mt-1 flex flex-wrap items-center gap-2">
                  Live metrics from tasks, attendance &amp; performance
                  {fTasks.length>0&&(
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{background:'rgba(31,175,90,0.25)',color:'#6ee7b7'}}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>
                      {fTasks.length} tasks
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                {isAdmin && companies.length > 0 && (
                  <select value={selCompany} onChange={e => { setSelCompany(e.target.value); setSelUser('all'); }}
                    className="h-8 px-3 text-xs rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-white/50"
                    style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'white'}}>
                    <option value="all" style={{color:'#1e293b'}}>All Companies</option>
                    {companies.map(co=><option key={co.id} value={co.id} style={{color:'#1e293b'}}>{co.name}</option>)}
                  </select>
                )}
                {canSwitchUser && uUsers.length>0 && (
                  <select value={selUser} onChange={e=>setSelUser(e.target.value)}
                    className="h-8 px-3 text-xs rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-white/50"
                    style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'white'}}>
                    {isAdmin && <option value="all" style={{color:'#1e293b'}}>All Users</option>}
                    {!isAdmin && hasCrossVisReports && <option value={user?.id || 'all'} style={{color:'#1e293b'}}>My Reports</option>}
                    {uUsers.map(u=><option key={u.id} value={u.id} style={{color:'#1e293b'}}>{u.full_name}</option>)}
                  </select>
                )}
                <button onClick={()=>fetchAll(true)} disabled={refreshing}
                  className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                  style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'white'}}>
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>
                  {refreshing?'Refreshing…':'Refresh'}
                </button>
                {canDL&&(
                  <>
                    <button onClick={handleCsv}
                      className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                      style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'white'}}>
                      <Download className="w-3.5 h-3.5"/> CSV
                    </button>
                    <button onClick={handlePdf}
                      className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                      style={{background:C.emeraldGreen,color:'white',boxShadow:'0 4px 12px rgba(31,175,90,0.4)'}}>
                      <Download className="w-3.5 h-3.5"/> PDF
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowCustomize(true)}
                  className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                  style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',color:'white'}}>
                  <Settings2 size={13}/> Customize
                </button>
              </div>
            </div>

            {/* Tabs — styled for banner background */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
              {tabs.map(tb=>(
                <button key={tb.id} onClick={()=>setTab(tb.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex-shrink-0 active:scale-95"
                  style={tab===tb.id
                    ?{background:'white',color:C.deepBlue,boxShadow:'0 2px 8px rgba(0,0,0,0.15)'}
                    :{background:'rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.75)',border:'1px solid rgba(255,255,255,0.18)'}}>
                  <tb.icon className="w-3.5 h-3.5"/>{tb.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ORDERED SECTIONS */}
      {rptOrder.map((sectionId) => {
        if (sectionId === 'kpi_row') return (
      <React.Fragment key="kpi_row">
      {/* ══ KPI ROW — 6 cards, uniform height via grid ══ */}
      {/* grid-rows-1 + items-stretch ensures every card in the row is the same height */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch">
        {[
          {label:'Total Tasks',   value:fTasks.length,        sub:`${compRate}% completion`,    color:C.deepBlue,     icon:Target       },
          {label:'Completed',     value:done.length,           sub:`${done.length} of ${fTasks.length}`,color:C.emeraldGreen,icon:CheckCircle2},
          {label:'In Progress',   value:wip.length,            sub:'Currently active',           color:C.mediumBlue,   icon:Activity     },
          {label:'Overdue',       value:overdue.length,        sub:'Past due date',              color:C.coral,        icon:AlertTriangle},
          {label:'Days Present',  value:presDays,              sub:`${fmt(avgMins)} avg/day`,    color:C.mediumBlue,   icon:Calendar     },
          {label:'Screen Time',   value:fmtC(totMins),         sub:`${presDays} days logged`,   color:C.amber,        icon:Clock        },
        ].map((k,i)=><KpiCard key={i} {...k} dark={dark}/>)}
      </div>
      </React.Fragment>
        );
        if (sectionId === 'tab_panels') return (
      <React.Fragment key="tab_panels">
      {/* ══ TAB PANELS ══ */}
      <AnimatePresence mode="wait">

        {/* ──────── OVERVIEW ──────── */}
        {tab==='overview'&&(
          <motion.div key="ov" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Task status donut */}
              <Sec title="Task Status" desc="Current distribution" dark={dark}>
                {statusData.length>0?(
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                        paddingAngle={3} dataKey="value"
                        label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}
                        isAnimationActive={true}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                      <Legend wrapperStyle={{fontSize:10,color:t.textSub}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ):<Empty icon={Target} text="No task data" dark={dark}/>}
              </Sec>

              {/* Priority mix */}
              <Sec title="Priority Mix" desc="Task urgency levels" dark={dark}>
                {prioData.length>0?(
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={prioData} layout="vertical" barSize={12}>
                      <XAxis type="number" tick={{fontSize:10,fill:t.textSub}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" width={58} tick={{fontSize:10,fill:t.textSub}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                      <Bar dataKey="value" name="Tasks" radius={[0,6,6,0]}>
                        {prioData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ):<Empty icon={Shield} text="No priority data" dark={dark}/>}
              </Sec>

              {/* Compliance gauge */}
              <Sec title="Compliance Score" desc="Overall health" dark={dark}>
                <div className="flex flex-col items-center justify-center h-[220px] gap-3">
                  {dashStats?.compliance_status?(
                    <>
                      <div className="relative w-32 h-32">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10"
                            style={{stroke:dark?'#1e293b':'#f1f5f9'}}/>
                          <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                            stroke={dashStats.compliance_status.score>=80?C.emeraldGreen:dashStats.compliance_status.score>=50?C.amber:'#dc2626'}
                            strokeDasharray={`${2.64*dashStats.compliance_status.score} 264`}/>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-2xl font-black" style={{color:C.deepBlue}}>{dashStats.compliance_status.score}%</p>
                          <p className="text-[9px] font-bold uppercase tracking-wider" style={{color:t.textMute}}>Score</p>
                        </div>
                      </div>
                      <div className="w-full space-y-1.5">
                        {[
                          {label:'Overdue Tasks', val:dashStats.compliance_status.overdue_tasks,         col:'#dc2626'},
                          {label:'Expiring DSC',  val:dashStats.compliance_status.expiring_certificates, col:C.amber  },
                          {label:'Status',        val:(dashStats.compliance_status.status||'').toUpperCase(),
                            col:dashStats.compliance_status.score>=80?C.emeraldGreen:C.amber},
                        ].map((it,i)=>(
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span style={{color:t.textSub}}>{it.label}</span>
                            <span className="font-bold" style={{color:it.col}}>{it.val}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ):<Empty icon={Shield} text="No compliance data" dark={dark}/>}
                </div>
              </Sec>
            </div>

            {/* Weekly trend */}
            <Sec title="Weekly Activity Trend" desc="Task completions vs new tasks this week" dark={dark}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.emeraldGreen} stopOpacity={0.3}/>
                      <stop offset="100%" stopColor={C.emeraldGreen} stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.mediumBlue} stopOpacity={0.25}/>
                      <stop offset="100%" stopColor={C.mediumBlue} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{fontSize:11,fill:t.textSub}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:11,fill:t.textSub}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                  <Legend wrapperStyle={{fontSize:11,color:t.textSub}}/>
                  <Area type="monotone" dataKey="completed" stroke={C.emeraldGreen} strokeWidth={2} fill="url(#gc)" name="Completed"/>
                  <Area type="monotone" dataKey="pending"   stroke={C.mediumBlue}   strokeWidth={2} fill="url(#gp)"  name="New/Pending"/>
                </AreaChart>
              </ResponsiveContainer>
            </Sec>
          </motion.div>
        )}

        {/* ──────── TASKS ──────── */}
        {tab==='tasks'&&(
          <motion.div key="tk" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Sec title="Tasks by Category" desc="Volume per department" dark={dark}>
                {catData.length>0?(
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={catData} layout="vertical">
                      <XAxis type="number" tick={{fontSize:10,fill:t.textSub}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" width={100} tick={{fontSize:10,fill:t.textSub}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                      <Bar dataKey="tasks" name="Tasks" radius={[0,6,6,0]}>
                        {catData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ):<Empty icon={BarChart3} text="No category data" dark={dark}/>}
              </Sec>

              <Sec title="Status Distribution" dark={dark}>
                {statusData.length>0?(
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={58} outerRadius={92}
                        paddingAngle={4} dataKey="value"
                        label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                      <Legend wrapperStyle={{fontSize:10,color:t.textSub}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ):<Empty icon={Target} text="No task data" dark={dark}/>}
              </Sec>
            </div>

            {overdue.length>0&&(
              <Sec title={`Overdue Tasks (${overdue.length})`} desc="Past due — immediate attention required" dark={dark}>
                <div className="space-y-2 max-h-72 overflow-y-auto" style={{scrollbarWidth:'thin'}}>
                  {overdue.slice(0,15).map((tk,i)=>{
                    const days=Math.floor((new Date()-new Date(tk.due_date))/86400000);
                    return (
                      <div key={tk.id||i} className="flex items-center justify-between p-3 rounded-xl"
                        style={{background:dark?'rgba(239,68,68,0.1)':'#fef2f2',border:'1px solid rgba(239,68,68,0.25)'}}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{color:t.text}}>{tk.title||'Untitled'}</p>
                          <p className="text-xs mt-0.5" style={{color:t.textSub}}>
                            {tk.assigned_to_name&&<><span className="font-medium">{tk.assigned_to_name}</span> · </>}
                            Due: {tk.due_date?new Date(tk.due_date).toLocaleDateString():'—'}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg ml-3"
                          style={{background:'#fee2e2',color:'#dc2626'}}>{days}d overdue</span>
                      </div>
                    );
                  })}
                </div>
              </Sec>
            )}
          </motion.div>
        )}

        {/* ──────── ATTENDANCE ──────── */}
        {tab==='attend'&&(
          <motion.div key="at" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
              {[
                {label:'Days Present',  value:reportSummary.present,       sub:`${reportSummary.people} employees`, color:C.emeraldGreen, icon:CheckCircle2},
                {label:'Total Hours',   value:fmtC(reportSummary.minutes), sub:'Filtered report period', color:C.deepBlue,     icon:Clock},
                {label:'Avg / Day',     value:fmt(reportSummary.avg),      sub:'Per present record',     color:C.mediumBlue,   icon:Activity},
                {label:'Late Days',     value:reportSummary.late,         sub:`${reportSummary.early} early-out`, color:C.amber, icon:AlertTriangle},
              ].map((k,i)=><KpiCard key={i} {...k} dark={dark}/>)}
            </div>

            {/* Full attendance report controls — intentionally kept inside the existing Attendance tab. */}
            <Sec title="Attendance Report & Filters"
              desc="Filter the existing attendance records by period, company, department, employee and status. Exact punch timestamps are preserved in exports."
              dark={dark}
              action={
                <div className="flex flex-wrap gap-1.5">
                  {canDL&&<>
                    <button onClick={downloadAttendanceCsv}
                      className="h-7 px-2.5 text-[10px] font-bold rounded-lg flex items-center gap-1"
                      style={{background:C.deepBlue,color:'#fff'}}>
                      <Download className="w-3 h-3"/> CSV
                    </button>
                    <button onClick={downloadAttendancePdf}
                      className="h-7 px-2.5 text-[10px] font-bold rounded-lg flex items-center gap-1"
                      style={{background:C.emeraldGreen,color:'#fff'}}>
                      <Download className="w-3 h-3"/> PDF
                    </button>
                  </>}
                  <button onClick={resetAttendanceFilters}
                    className="h-7 px-2.5 text-[10px] font-bold rounded-lg"
                    style={{background:t.card2,color:t.textSub,border:`1px solid ${t.border}`}}>
                    Reset
                  </button>
                </div>
              }>
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                  {[
                    ['today','Today'],['week','This Week'],['month','This Month'],['last_month','Last Month'],
                    ['year','This Year'],['last_year','Last Year'],['custom','Custom']
                  ].map(([id,label])=>(
                    <button key={id} onClick={()=>setAttPreset(id)}
                      className="h-8 px-2 text-[10px] font-bold rounded-lg transition-all"
                      style={attPreset===id?{background:C.deepBlue,color:'#fff'}:{background:t.card2,color:t.textSub,border:`1px solid ${t.border}`}}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2">
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    From
                    <input type="date" value={attFrom} onChange={e=>{setAttPreset('custom');setAttFrom(e.target.value)}}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}/>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    To
                    <input type="date" value={attTo} onChange={e=>{setAttPreset('custom');setAttTo(e.target.value)}}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}/>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Company
                    <select value={attCompany} onChange={e=>{setAttCompany(e.target.value);setAttUser('all')}}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Companies</option>
                      {attendanceCompanies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Department
                    <select value={attDepartment} onChange={e=>setAttDepartment(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Departments</option>
                      {attendanceDepartments.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Employee
                    <select value={attUser} onChange={e=>setAttUser(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Employees</option>
                      {attendanceUsers.filter(u=>attCompany==='all'||String(u.company_id)===String(attCompany)).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''))).map(u=><option key={u.id||u._id} value={u.id||u._id}>{u.full_name||u.name||'Unknown'}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Role
                    <select value={attRole} onChange={e=>setAttRole(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Roles</option>
                      {attendanceRoles.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Status
                    <select value={attStatus} onChange={e=>setAttStatus(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Status</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="leave">Leave</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold" style={{color:t.textSub}}>
                    Special Filter
                    <select value={attFlag} onChange={e=>setAttFlag(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg px-2 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}>
                      <option value="all">All Records</option>
                      <option value="late">Late Arrival</option>
                      <option value="early">Early Out</option>
                      <option value="missing_out">Missing Punch-Out</option>
                      <option value="auto">Auto Marked</option>
                      <option value="wfh">WFH</option>
                      <option value="present">Has Punch-In</option>
                      <option value="absent">Absent Only</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={attSearch} onChange={e=>setAttSearch(e.target.value)}
                    placeholder="Search employee, ID, company, department, role, date or status…"
                    className="h-9 flex-1 rounded-lg px-3 text-xs focus:outline-none" style={{background:t.inputBg,color:t.text,border:`1px solid ${t.inputBdr}`}}/>
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-[10px]" style={{color:t.textMute}}>
                    <span>{reportDateRange.from} → {reportDateRange.to}</span>
                    <span className="font-bold" style={{color:C.deepBlue}}>{reportAttendanceRows.length} records</span>
                  </div>
                </div>
              </div>
            </Sec>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                ['Present',reportSummary.present,C.emeraldGreen],['Absent',reportSummary.absent,'#dc2626'],['Leave',reportSummary.leave,C.mediumBlue],['Half Day',reportSummary.half,C.amber],
                ['Late',reportSummary.late,C.amber],['Early Out',reportSummary.early,'#ea580c'],['Missing Out',reportSummary.missing,'#dc2626'],['Auto Marked',reportSummary.auto,C.deepBlue]
              ].map(([label,val,color])=>(
                <div key={label} className="rounded-xl p-2.5" style={{background:t.card,border:`1px solid ${t.border}`,boxShadow:t.shadow}}>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{color:t.textMute}}>{label}</p>
                  <p className="text-lg font-black mt-1" style={{color}}>{val}</p>
                </div>
              ))}
            </div>

            <Sec title="Detailed Attendance Report"
              desc={`${reportFilterLabel} • exact login/logout timestamps • ${reportAttendanceRows.length} filtered records`}
              dark={dark}>
              {reportAttendanceRows.length>0?(
                <div className="overflow-x-auto rounded-xl" style={{border:`1px solid ${t.border}`}}>
                  <table className="w-full text-sm min-w-[1450px]">
                    <thead>
                      <tr style={{background:t.card2}}>
                        {['Date','Employee','Emp. ID','Company','Department','Role','Status','Exact Login','Exact Logout','Duration','Late','Early Out','Missing Out','Auto','Mode','Location','Remarks'].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{color:t.textMute}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportAttendanceRows.map((a,i)=>{
                        const sc=a._status==='present'?{bg:dark?'rgba(31,175,90,0.15)':'#f0fdf4',col:C.emeraldGreen}:a._status==='absent'?{bg:dark?'rgba(239,68,68,0.12)':'#fef2f2',col:'#dc2626'}:{bg:dark?'rgba(245,158,11,0.12)':'#fffbeb',col:C.amber};
                        return (
                          <tr key={`${a._idx}-${i}`} style={{borderTop:`1px solid ${t.border2}`}}
                            onMouseEnter={e=>e.currentTarget.style.background=t.hover}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap" style={{color:t.text}}>{a.date||'—'}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap" style={{color:t.text}}>{a._employeeName}</td>
                            <td className="px-3 py-2.5 text-[10px] whitespace-nowrap" style={{color:t.textSub}}>{a._employeeId}</td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{color:t.textSub}}>{a._companyName}</td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{color:t.textSub}}>{a._department}</td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{color:t.textSub}}>{a._role}</td>
                            <td className="px-3 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-md capitalize whitespace-nowrap" style={{background:sc.bg,color:sc.col}}>{a._status}</span></td>
                            <td className="px-3 py-2.5 text-[10px] font-semibold whitespace-nowrap" style={{color:t.textSub}}>{exactDateTime(a.punch_in)}</td>
                            <td className="px-3 py-2.5 text-[10px] font-semibold whitespace-nowrap" style={{color:t.textSub}}>{exactDateTime(a.punch_out)}</td>
                            <td className="px-3 py-2.5 text-xs font-bold whitespace-nowrap" style={{color:C.deepBlue}}>{fmt(a.duration_minutes||0)}</td>
                            <td className="px-3 py-2.5 text-[10px] font-bold" style={{color:a._late?'#dc2626':t.textMute}}>{a._late?'YES':'—'}</td>
                            <td className="px-3 py-2.5 text-[10px] font-bold" style={{color:a._early?'#ea580c':t.textMute}}>{a._early?'YES':'—'}</td>
                            <td className="px-3 py-2.5 text-[10px] font-bold" style={{color:a._missingOut?'#dc2626':t.textMute}}>{a._missingOut?'YES':'—'}</td>
                            <td className="px-3 py-2.5 text-[10px] font-bold" style={{color:a._auto?C.mediumBlue:t.textMute}}>{a._auto?'YES':'—'}</td>
                            <td className="px-3 py-2.5 text-[10px] whitespace-nowrap" style={{color:t.textSub}}>{a.work_mode||a.attendance_type||(a._wfh?'WFH':'Office')}</td>
                            <td className="px-3 py-2.5 text-[10px] whitespace-nowrap" style={{color:t.textSub}}>{a.latitude??'—'}, {a.longitude??'—'}</td>
                            <td className="px-3 py-2.5 text-[10px] max-w-[220px]" style={{color:t.textMute}}>{a.leave_reason||a.notes||'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ):<Empty icon={Clock} text="No attendance records match the selected filters" dark={dark}/>} 
            </Sec>

            <div className="rounded-xl px-4 py-3 text-[10px]" style={{background:t.card2,border:`1px solid ${t.border}`,color:t.textMute}}>
              <strong style={{color:t.text}}>Report includes:</strong> exact punch-in/out timestamps, duration, status, late/early flags, missing punch-out, auto-marked attendance, work mode, location coordinates, employee/company/department/role and remarks. PDF and CSV use the same filtered dataset shown above.
            </div>
          </motion.div>
        )}

        {/* ──────── EFFICIENCY ──────── */}
        {tab==='efficiency'&&(
          <motion.div key="ef" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            <Sec title="Efficiency Breakdown"
              desc="Computed from real task assignments + attendance records"
              dark={dark}>
              {effCards.length>0?(
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {effCards.map((d,i)=>{
                    const bc=d.pct>=70?C.emeraldGreen:d.pct>=40?C.amber:'#dc2626';
                    return (
                      <motion.div key={d.user_id||i} variants={iV}
                        className="rounded-xl p-4"
                        style={{background:t.card,border:`1px solid ${t.border}`,boxShadow:t.shadow}}>
                        {/* header */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm flex-shrink-0"
                            style={{background:PALETTE[i%PALETTE.length]}}>
                            {(d.user_name||'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" style={{color:t.text}}>{d.user_name}</p>
                            <p className="text-xs" style={{color:t.textMute}}>{d.days} days present</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xl font-black leading-none" style={{color:bc}}>{d.pct}%</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{color:t.textMute}}>Done</p>
                          </div>
                        </div>
                        {/* bar */}
                        <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{background:dark?'#334155':'#f1f5f9'}}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{width:`${d.pct}%`,background:bc}}/>
                        </div>
                        {/* stats */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            {label:'Done',   val:d.done,          color:C.emeraldGreen},
                            {label:'Pending',val:d.pend,          color:C.amber       },
                            {label:'Hours',  val:fmtC(d.mins),    color:C.mediumBlue  },
                          ].map((it,j)=>(
                            <div key={j} className="rounded-lg p-2 text-center" style={{background:t.card2}}>
                              <p className="text-[9px] font-bold uppercase tracking-wider" style={{color:t.textMute}}>{it.label}</p>
                              <p className="text-sm font-black mt-0.5 leading-none" style={{color:it.color}}>{it.val}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span style={{color:t.textMute}}>Total assigned</span>
                          <span className="font-bold" style={{color:t.text}}>{d.total} tasks</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ):<Empty icon={Zap} text="No efficiency data" dark={dark}/>}
            </Sec>

            {/* comparison bar */}
            {effCards.length>1&&(
              <Sec title="Completion Rate Comparison" desc="Side-by-side across team" dark={dark}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={effCards.slice(0,10).map(d=>({name:d.user_name?.split(' ')[0]||'?',pct:d.pct,done:d.done}))} barSize={24}>
                    <XAxis dataKey="name" tick={{fontSize:10,fill:t.textSub}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:t.textSub}} unit="%" axisLine={false} tickLine={false} domain={[0,100]}/>
                    <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                    <Bar dataKey="pct" name="Completion%" radius={[6,6,0,0]}>
                      {effCards.slice(0,10).map((d,i)=>(
                        <Cell key={i} fill={d.pct>=70?C.emeraldGreen:d.pct>=40?C.amber:'#dc2626'}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Sec>
            )}
          </motion.div>
        )}

        {/* ──────── PERFORMERS ──────── */}
        {tab==='performers'&&(
          <motion.div key="pf" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Sec title={isAdmin?'Star Performers':'Your Rank'} desc="Ranked by final score (0–1000)" dark={dark}
                action={isAdmin&&(
                  <div className="flex gap-1">
                    {['all','monthly','weekly'].map(p=>(
                      <button key={p} onClick={()=>setRankPeriod(p)}
                        className="h-6 px-2.5 text-[10px] font-bold rounded-lg transition-all"
                        style={rankPeriod===p
                          ?{background:C.deepBlue,color:'#fff'}
                          :{background:t.card2,color:t.textSub,border:`1px solid ${t.border}`}}>
                        {p==='all'?'All Time':p.charAt(0).toUpperCase()+p.slice(1)}
                      </button>
                    ))}
                  </div>
                )}>
                {performers.length>0?(
                  <div className="space-y-2 max-h-[300px] overflow-y-auto" style={{scrollbarWidth:'thin'}}>
                    {performers.map((m,i)=><PerfRow key={m.user_id||i} m={m} rank={i+1} dark={dark}/>)}
                  </div>
                ):<Empty icon={Award} text="No performance data" dark={dark}/>}
              </Sec>

              <Sec title="Top Performer Breakdown" desc={performers[0]?`${performers[0].user_name} — score components`:'Score components (0–1000 scale)'} dark={dark}>
                {radarData.length>0?(
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke={dark?'#334155':'#e2e8f0'}/>
                      <PolarAngleAxis dataKey="metric" tick={{fontSize:10,fill:t.textSub}}/>
                      <Radar name="Score" dataKey="score" stroke={C.deepBlue} fill={C.deepBlue} fillOpacity={0.18} strokeWidth={2}/>
                      <Tooltip content={<ChartTip dark={dark}/>}/>
                    </RadarChart>
                  </ResponsiveContainer>
                ):<Empty icon={Star} text="No data" dark={dark}/>}
              </Sec>
            </div>

            {performers.length>0&&(
              <Sec title="Full Score Breakdown" desc="All 11 performance dimensions (0–1000 scale)" dark={dark}>
                <div className="overflow-x-auto rounded-xl" style={{border:`1px solid ${t.border}`}}>
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr style={{background:t.card2}}>
                        {['Rank','Employee','Final Score','Att. Score','Task Done','Timeliness','Hours Score','Quality','Consistency','Auto Absent','Att. %','Badge'].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                            style={{color:t.textMute}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {performers.map((m,i)=>{
                        const fs=m.final_score??m.overall_score*10;
                        const sc=fs>=850?C.emeraldGreen:fs>=650?C.amber:'#dc2626';
                        const badgeStyle=
                          m.badge==='Elite Performer'  ?{background:'#fde68a',color:'#78350f'}
                         :m.badge==='Star Performer'   ?{background:'#fef9c3',color:'#854d0e'}
                         :m.badge==='Top Performer'    ?{background:'#d1fae5',color:'#065f46'}
                         :m.badge==='Good Performer'   ?{background:'#dbeafe',color:'#1e40af'}
                         :m.badge==='Average Performer'?{background:'#f3f4f6',color:'#374151'}
                                                       :{background:'#fee2e2',color:'#991b1b'};
                        return (
                          <tr key={m.user_id||i} style={{borderTop:`1px solid ${t.border2}`}}
                            onMouseEnter={e=>e.currentTarget.style.background=t.hover}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td className="px-3 py-2.5 text-sm">
                              {i===0?'🥇':i===1?'🥈':i===2?'🥉':<span style={{color:t.textMute}}>#{i+1}</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{background:`linear-gradient(135deg,${C.deepBlue},${C.mediumBlue})`}}>
                                  {m.user_name?.charAt(0)?.toUpperCase()||'?'}
                                </div>
                                <span className="font-semibold text-xs whitespace-nowrap" style={{color:t.text}}>{m.user_name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-base font-black" style={{color:sc}}>{fs}</span>
                            </td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.attendance_score}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.task_completion_score}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.task_timeliness_score}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.working_hours_score}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.quality_score}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.consistency_bonus}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:m.auto_absent_count>0?'#dc2626':t.textSub}}>{m.auto_absent_count}</td>
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{m.attendance_percent}%</td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={badgeStyle}>
                                {m.badge||'Needs Improvement'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Sec>
            )}
          </motion.div>
        )}

        {/* ──────── TEAM (admin only) ──────── */}
        {tab==='team'&&isAdmin&&(
          <motion.div key="tm" variants={cV} initial="hidden" animate="visible" exit={{opacity:0}} className="space-y-4">
            {teamWL.length>0?(
              <Sec title="Team Workload Distribution"
                desc="Individual breakdown — live from task assignments" dark={dark}>
                <div className="overflow-x-auto rounded-xl" style={{border:`1px solid ${t.border}`}}>
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr style={{background:t.card2}}>
                        {['Employee','Total','Pending','Completed','Progress'].map(h=>(
                          <th key={h} className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
                            style={{color:t.textMute}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamWL.map((m,i)=>{
                        const pct=m.total_tasks>0?Math.round((m.completed_tasks/m.total_tasks)*100):0;
                        const bc=pct>=70?C.emeraldGreen:pct>=40?C.amber:'#dc2626';
                        return (
                          <tr key={m.user_id||i} style={{borderTop:`1px solid ${t.border2}`}}
                            onMouseEnter={e=>e.currentTarget.style.background=t.hover}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td className="px-5 py-3 font-semibold text-sm" style={{color:t.text}}>{m.user_name}</td>
                            <td className="px-5 py-3 font-bold" style={{color:C.deepBlue}}>{m.total_tasks}</td>
                            <td className="px-5 py-3 font-semibold" style={{color:C.amber}}>{m.pending_tasks}</td>
                            <td className="px-5 py-3 font-semibold" style={{color:C.emeraldGreen}}>{m.completed_tasks}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full overflow-hidden"
                                  style={{background:dark?'#334155':'#f1f5f9'}}>
                                  <div className="h-full rounded-full transition-all duration-700"
                                    style={{width:`${pct}%`,background:bc}}/>
                                </div>
                                <span className="text-xs font-bold w-9 text-right" style={{color:t.textSub}}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Sec>
            ):<Empty icon={Users} text="No team workload data" dark={dark}/>}
          </motion.div>
        )}

      </AnimatePresence>
      </React.Fragment>
        );
        return null;
      })}
    </motion.div>
    </>
  );
}
