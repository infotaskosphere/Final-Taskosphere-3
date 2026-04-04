import React, { useState, useEffect, useMemo } from 'react';
import GifLoader from '@/components/ui/GifLoader.jsx';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  BarChart3, TrendingUp, Clock, Award, Users, CheckCircle2,
  AlertTriangle, Target, Download, RefreshCw, Activity,
  Calendar, Star, Zap, Shield,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

// ─── KPI Card — strict equal-height layout ────────────────────────────────────
const KpiCard = ({ label, value, sub, color, icon:Icon, dark }) => {
  const t = tok(dark);
  return (
    <motion.div variants={iV} className="h-full">
      {/* outer wrapper fills the grid cell height */}
      <div className="rounded-xl overflow-hidden flex flex-col h-full"
        style={{background:t.card, border:`1px solid ${t.border}`, boxShadow:t.shadow}}>
        {/* accent stripe */}
        <div className="h-[3px] w-full flex-shrink-0" style={{background:color}} />
        {/* content — flex-1 so all cards stretch equally */}
        <div className="p-4 flex flex-col flex-1">
          {/* label + icon row — fixed height */}
          <div className="flex items-start justify-between gap-2 h-8">
            <p className="text-[10px] font-bold uppercase tracking-widest leading-tight"
              style={{color:t.textMute}}>{label}</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{background:`${color}1a`}}>
              <Icon className="w-4 h-4" style={{color}} />
            </div>
          </div>
          {/* value — fixed line-height so numbers don't shift */}
          <p className="mt-2 text-2xl font-black leading-none tracking-tight" style={{color}}>
            {value}
          </p>
          {/* sub — always renders (even empty) to keep spacing identical */}
          <p className="mt-1.5 text-xs font-medium leading-snug flex-1"
            style={{color:t.textSub, minHeight:'1.2rem'}}>
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
        <p className="text-sm font-black" style={P?{color:'#fff'}:{color:C.deepBlue}}>{m.overall_score}%</p>
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
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap"
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

  const isAdmin  = user?.role === 'admin';
  const canDL    = isAdmin || hasPermission('can_download_reports');

  // ── State ──────────────────────────────────────────────────────────────────
  const [tasks,      setTasks]      = useState([]);
  const [dashStats,  setDashStats]  = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [allUsers,   setAllUsers]   = useState([]);
  const [performers, setPerformers] = useState([]);
  const [rankPeriod, setRankPeriod] = useState('monthly');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selUser,    setSelUser]    = useState('all');
  const [tab,        setTab]        = useState('overview');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = async (ref=false) => {
    ref ? setRefreshing(true) : setLoading(true);
    const [r1,r2,r3,r4] = await Promise.allSettled([
      api.get('/tasks'),
      api.get('/dashboard/stats'),
      api.get('/attendance/history'),
      isAdmin ? api.get('/users') : Promise.resolve({data:[]}),
    ]);
    if (r1.status==='fulfilled') setTasks(r1.value?.data||[]);
    if (r2.status==='fulfilled') setDashStats(r2.value?.data||null);
    if (r3.status==='fulfilled') setAttendance(r3.value?.data||[]);
    if (r4.status==='fulfilled') setAllUsers(r4.value?.data||[]);
    setLoading(false); setRefreshing(false);
  };

  const fetchPerf = async () => {
    try {
      const p = rankPeriod==='all'?'all_time':rankPeriod;
      const r = await api.get('/reports/performance-rankings',{params:{period:p}});
      setPerformers(r.data||[]);
    } catch { setPerformers([]); }
  };

  useEffect(()=>{ if(user) fetchAll(); },[user]);
  useEffect(()=>{ fetchPerf(); },[rankPeriod]);

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
    if (!isAdmin) return [];
    const m=new Map();
    allUsers.forEach(u=>{if(u.id&&u.full_name)m.set(u.id,u);});
    return Array.from(m.values());
  },[allUsers,isAdmin]);

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
      {metric:'Attendance',score:p.attendance_percent||0},
      {metric:'Task Done', score:p.task_completion_percent||0},
      {metric:'On Time',   score:p.timely_punchin_percent||0},
      {metric:'Todo Rate', score:p.todo_ontime_percent||0},
      {metric:'Overall',   score:p.overall_score||0},
    ];
  },[performers]);

  // ── Efficiency cards — real tasks + real attendance ───────────────────────
  const effCards = useMemo(()=>{
    if (!isAdmin) {
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
    const uMap={};
    allUsers.forEach(u=>{uMap[u.id]={user_id:u.id,user_name:u.full_name,total:0,done:0,pend:0,mins:0,days:0,pct:0};});
    tasks.forEach(t=>{const u=t.assigned_to;if(u&&uMap[u]){uMap[u].total++;t.status==='completed'?uMap[u].done++:uMap[u].pend++;}});
    attendance.forEach(a=>{const u=a.user_id;if(u&&uMap[u]){uMap[u].mins+=(a.duration_minutes||0);if(a.status==='present')uMap[u].days++;}});
    Object.values(uMap).forEach(u=>{u.pct=u.total>0?Math.round((u.done/u.total)*100):0;});
    let cards=Object.values(uMap);
    if(selUser!=='all') cards=cards.filter(c=>c.user_id===selUser);
    return cards.sort((a,b)=>b.done-a.done);
  },[tasks,attendance,allUsers,isAdmin,user,selUser]);

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
        doc.setFontSize(12);doc.setTextColor(13,59,102);doc.text('Star Performers',15,y);y+=8;
        doc.autoTable({
          head:[['Rank','Name','Score','Attendance%','Task Done%','Punch-In%','Hours','Badge']],
          body:performers.map((m,i)=>[`#${i+1}`,m.user_name,`${m.overall_score}%`,`${m.attendance_percent}%`,`${m.task_completion_percent}%`,`${m.timely_punchin_percent}%`,fmtH(m.total_hours),m.badge||'Good']),
          startY:y,margin:15,theme:'grid',
          headStyles:{fillColor:[31,111,178],textColor:[255,255,255],fontStyle:'bold'},
        });
      }
      doc.save('efficiency_reports.pdf');
      toast.success('PDF exported!');
    } catch(e){console.error(e);toast.error('PDF failed');}
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <GifLoader />;

  const tabs=[
    {id:'overview',   label:'Overview',    icon:BarChart3 },
    {id:'tasks',      label:'Tasks',       icon:Target    },
    {id:'attend',     label:'Attendance',  icon:Clock     },
    {id:'efficiency', label:'Efficiency',  icon:Zap       },
    {id:'performers', label:'Performers',  icon:Award     },
    ...(isAdmin?[{id:'team',label:'Team',icon:Users}]:[]),
  ];

  const cursorStyle={fill:dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)'};

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <motion.div variants={cV} initial="hidden" animate="visible"
      className="space-y-4 p-4 md:p-6 min-h-screen"
      style={{background:t.pageBg}}>

      {/* ══ HEADER ══ */}
      <motion.div variants={iV}>
        <div className="rounded-2xl overflow-hidden"
          style={{background:t.card,border:`1px solid ${t.border}`,boxShadow:t.shadow}}>
          <div className="h-1 w-full"
            style={{background:`linear-gradient(90deg,${C.deepBlue},${C.mediumBlue},${C.emeraldGreen})`}}/>
          <div className="p-4 md:p-5">
            {/* title row */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h1 className="text-xl font-black tracking-tight" style={{color:C.deepBlue}}>
                  Reports &amp; Analytics
                </h1>
                <p className="text-sm mt-0.5 flex flex-wrap items-center gap-2" style={{color:t.textSub}}>
                  Live metrics from tasks, attendance &amp; performance
                  {fTasks.length>0&&(
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{background:`${C.emeraldGreen}18`,color:C.emeraldGreen}}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"/>
                      {fTasks.length} tasks
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin&&uUsers.length>0&&(
                  <select value={selUser} onChange={e=>setSelUser(e.target.value)}
                    className="h-8 px-3 text-xs rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{background:t.inputBg,border:`1px solid ${t.inputBdr}`,color:t.text}}>
                    <option value="all">All Users</option>
                    {uUsers.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                )}
                <button onClick={()=>fetchAll(true)} disabled={refreshing}
                  className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all"
                  style={{background:t.card2,border:`1px solid ${t.border}`,color:t.text}}>
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>
                  {refreshing?'Refreshing…':'Refresh'}
                </button>
                {canDL&&(
                  <>
                    <button onClick={handleCsv}
                      className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 text-white transition-all"
                      style={{background:'#1e293b'}}>
                      <Download className="w-3.5 h-3.5"/> CSV
                    </button>
                    <button onClick={handlePdf}
                      className="h-8 px-3 text-xs font-semibold rounded-xl flex items-center gap-1.5 text-white transition-all"
                      style={{background:C.deepBlue}}>
                      <Download className="w-3.5 h-3.5"/> PDF
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {tabs.map(tb=>(
                <TabBtn key={tb.id} id={tb.id} label={tb.label} icon={tb.icon}
                  active={tab===tb.id} onClick={setTab} dark={dark}/>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

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
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={88}
                        paddingAngle={3} dataKey="value"
                        label={({name,percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                      <Legend wrapperStyle={{fontSize:11,color:t.textSub}}/>
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
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={65} outerRadius={105}
                        paddingAngle={4} dataKey="value"
                        label={({name,value,percent})=>`${name}: ${value} (${(percent*100).toFixed(0)}%)`}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                      </Pie>
                      <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
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
                {label:'Days Present',  value:presDays,         sub:'This period',        color:C.emeraldGreen, icon:CheckCircle2},
                {label:'Total Hours',   value:fmtC(totMins),    sub:'Logged time',         color:C.deepBlue,     icon:Clock       },
                {label:'Avg / Day',     value:fmt(avgMins),     sub:'Per present day',     color:C.mediumBlue,   icon:Activity    },
                {label:'Late Days',     value:lateDays,         sub:'Arrived after time',  color:C.amber,        icon:AlertTriangle},
              ].map((k,i)=><KpiCard key={i} {...k} dark={dark}/>)}
            </div>

            <Sec title="Daily Hours — Last 7 Days" desc="From actual punch records" dark={dark}>
              {attTrend.some(d=>d.hours>0)?(
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={attTrend} barSize={28}>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:t.textSub}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fill:t.textSub}} unit="h" axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTip dark={dark}/>} cursor={cursorStyle}/>
                    <Bar dataKey="hours" name="Hours" radius={[6,6,0,0]}>
                      {attTrend.map((d,i)=>(
                        <Cell key={i} fill={d.hours>=8?C.emeraldGreen:d.hours>=4?C.mediumBlue:dark?'#334155':'#e2e8f0'}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ):<Empty icon={Clock} text="No attendance records for the last 7 days" dark={dark}/>}
            </Sec>

            {fAtt.length>0&&(
              <Sec title="Attendance Log" desc="Recent punch records" dark={dark}>
                <div className="overflow-x-auto rounded-xl" style={{border:`1px solid ${t.border}`}}>
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr style={{background:t.card2}}>
                        {(isAdmin?['Employee','Date','In','Out','Duration','Status','Notes']:['Date','In','Out','Duration','Status','Notes']).map(h=>(
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
                            style={{color:t.textMute}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fAtt.slice(0,20).map((a,i)=>{
                        const pi=a.punch_in ?new Date(a.punch_in ).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—';
                        const po=a.punch_out?new Date(a.punch_out).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—';
                        const sc=a.status==='present'
                          ?{bg:dark?'rgba(31,175,90,0.15)':'#f0fdf4',col:C.emeraldGreen}
                          :a.status==='absent'
                          ?{bg:dark?'rgba(239,68,68,0.12)':'#fef2f2',col:'#dc2626'}
                          :{bg:dark?'rgba(245,158,11,0.12)':'#fffbeb',col:C.amber};
                        const flags=[a.is_late&&'⏰ Late',a.punched_out_early&&'🚪 Early',a.auto_marked&&'🤖 Auto'].filter(Boolean);
                        return (
                          <tr key={i} style={{borderTop:`1px solid ${t.border2}`}}
                            onMouseEnter={e=>e.currentTarget.style.background=t.hover}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            {isAdmin&&<td className="px-4 py-2.5 text-xs font-medium" style={{color:t.text}}>{a.user_name||'—'}</td>}
                            <td className="px-4 py-2.5 font-medium text-xs" style={{color:t.text}}>{a.date}</td>
                            <td className="px-4 py-2.5 text-xs" style={{color:t.textSub}}>{pi}</td>
                            <td className="px-4 py-2.5 text-xs" style={{color:t.textSub}}>{po}</td>
                            <td className="px-4 py-2.5 text-xs font-bold" style={{color:C.deepBlue}}>{fmt(a.duration_minutes||0)}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md capitalize"
                                style={{background:sc.bg,color:sc.col}}>{a.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-[10px]" style={{color:t.textMute}}>
                              {flags.length?flags.join(' '):<span style={{color:C.emeraldGreen}}>✓ OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {fAtt.length>20&&(
                    <p className="text-xs text-center py-2" style={{color:t.textMute}}>
                      Showing 20 of {fAtt.length} records
                    </p>
                  )}
                </div>
              </Sec>
            )}
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
              <Sec title={isAdmin?'Star Performers':'Your Rank'} desc="Ranked by overall score" dark={dark}
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

              <Sec title="Top Performer Breakdown" desc={performers[0]?`${performers[0].user_name} — components`:'Score radar'} dark={dark}>
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
              <Sec title="Full Score Breakdown" desc="All 5 performance dimensions" dark={dark}>
                <div className="overflow-x-auto rounded-xl" style={{border:`1px solid ${t.border}`}}>
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr style={{background:t.card2}}>
                        {['Rank','Employee','Overall','Attendance','Task Done','Punch-In','Todo','Hours','Badge'].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                            style={{color:t.textMute}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {performers.map((m,i)=>{
                        const sc=m.overall_score>=85?C.emeraldGreen:m.overall_score>=60?C.amber:'#dc2626';
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
                              <span className="text-base font-black" style={{color:sc}}>{m.overall_score}%</span>
                            </td>
                            {[m.attendance_percent,m.task_completion_percent,m.timely_punchin_percent,m.todo_ontime_percent].map((v,j)=>(
                              <td key={j} className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{v}%</td>
                            ))}
                            <td className="px-3 py-2.5 text-xs font-semibold" style={{color:t.textSub}}>{fmtH(m.total_hours)}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={m.badge==='Star Performer'?{background:'#fef9c3',color:'#854d0e'}
                                     :m.badge==='Top Performer' ?{background:'#d1fae5',color:'#065f46'}
                                     :{background:t.card2,color:t.textSub}}>
                                {m.badge||'Good Performer'}
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

        {/* ──────── TEAM (admin) ──────── */}
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
    </motion.div>
  );
}
