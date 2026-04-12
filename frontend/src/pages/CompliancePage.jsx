// CompliancePage.jsx — Universal Compliance Tracker v2
// Full-page detail view · Row numbers · Dynamic FY years · Recurring due dates

import { useDark } from '@/hooks/useDark';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO, isPast } from 'date-fns';
import {
  CheckCircle2, X, Plus, Upload, Search, ChevronDown,
  Users, Trash2, Edit2, Loader2, RefreshCw, ChevronRight,
  FileUp, Zap, Target, Calendar, BookOpen, FolderOpen,
  ArrowLeft, StickyNote, ShieldCheck, AlertTriangle,
  Info, Repeat, LayoutGrid, List, MessageSquare, Send,
  BarChart3, ChevronLeft, TrendingUp,
} from 'lucide-react';

const D = {
  bg:'#0f172a',card:'#1e293b',raised:'#263348',border:'#334155',
  text:'#f1f5f9',muted:'#94a3b8',dimmer:'#64748b',
};
const CATEGORY_CFG = {
  ROC:    {label:'ROC / MCA',  color:'#1F6FB2',bg:'rgba(31,111,178,0.12)', border:'rgba(31,111,178,0.3)' },
  GST:    {label:'GST',        color:'#F97316',bg:'rgba(249,115,22,0.12)', border:'rgba(249,115,22,0.3)' },
  ITR:    {label:'Income Tax', color:'#1FAF5A',bg:'rgba(31,175,90,0.12)',  border:'rgba(31,175,90,0.3)'  },
  TDS:    {label:'TDS / TCS',  color:'#8B5CF6',bg:'rgba(139,92,246,0.12)',border:'rgba(139,92,246,0.3)' },
  AUDIT:  {label:'Audit',      color:'#F59E0B',bg:'rgba(245,158,11,0.12)',border:'rgba(245,158,11,0.3)' },
  PF_ESIC:{label:'PF / ESIC', color:'#0D9488',bg:'rgba(13,148,136,0.12)',border:'rgba(13,148,136,0.3)' },
  PT:     {label:'Prof. Tax',  color:'#EF4444',bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.3)'  },
  OTHER:  {label:'Other',      color:'#64748b',bg:'rgba(100,116,139,0.12)',border:'rgba(100,116,139,0.3)'},
};
const STATUS_CFG = {
  not_started:{label:'Not Started',color:'#64748b',bg:'rgba(100,116,139,0.12)',border:'rgba(100,116,139,0.25)',dot:'#94a3b8'},
  in_progress:{label:'In Progress',color:'#3B82F6',bg:'rgba(59,130,246,0.12)', border:'rgba(59,130,246,0.25)', dot:'#60a5fa'},
  completed:  {label:'Completed',  color:'#1FAF5A',bg:'rgba(31,175,90,0.12)',  border:'rgba(31,175,90,0.25)',  dot:'#4ade80'},
  filed:      {label:'Filed',      color:'#8B5CF6',bg:'rgba(139,92,246,0.12)', border:'rgba(139,92,246,0.25)', dot:'#a78bfa'},
  na:         {label:'N/A',        color:'#94a3b8',bg:'rgba(148,163,184,0.08)',border:'rgba(148,163,184,0.2)', dot:'#cbd5e1'},
};
const STATUSES   = ['not_started','in_progress','completed','filed','na'];
const CATEGORIES = ['ROC','GST','ITR','TDS','AUDIT','PF_ESIC','PT','OTHER'];
const FREQUENCIES = [
  {value:'monthly',    label:'Monthly'    },
  {value:'quarterly',  label:'Quarterly'  },
  {value:'half_yearly',label:'Half-Yearly'},
  {value:'annual',     label:'Annual'     },
  {value:'one_time',   label:'One-Time'   },
];

// Dynamic FY years 2010-11 to 2035-36, newest first
const FY_OPTIONS = Array.from({length:26},(_,i)=>{const y=2010+i; return `${y}-${String(y+1).slice(2)}`;}).reverse();

const RECURRING_DAYS = [
  ...Array.from({length:31},(_,i)=>({value:String(i+1),label:String(i+1)})),
  {value:'last',label:'Last day'},
];
const QUARTER_MONTHS = [
  {value:'1',label:'1st month of quarter'},{value:'2',label:'2nd month of quarter'},
  {value:'3',label:'3rd month of quarter'},{value:'4',label:'Month after quarter end'},
];

const containerVariants = {hidden:{opacity:0},visible:{opacity:1,transition:{staggerChildren:0.05}}};
const itemVariants = {hidden:{opacity:0,y:16},visible:{opacity:1,y:0,transition:{duration:0.35,ease:[0.23,1,0.32,1]}}};
const pageVariants = {
  hidden:{opacity:0,x:40},
  visible:{opacity:1,x:0,transition:{duration:0.32,ease:[0.23,1,0.32,1]}},
  exit:{opacity:0,x:-30,transition:{duration:0.22,ease:'easeIn'}},
};

const safeDate = s=>{try{const d=parseISO(s);return isNaN(d)?null:d;}catch{return null;}};
const fmtDate  = (s,f='dd MMM yyyy')=>{const d=safeDate(s);return d?format(d,f):'—';};
const timeAgo  = s=>{
  if(!s)return'—'; const d=new Date(s); if(isNaN(d))return'—';
  const diff=Math.floor((Date.now()-d)/1000);
  if(diff<60)return'just now'; if(diff<3600)return`${Math.floor(diff/60)}m ago`;
  if(diff<86400)return`${Math.floor(diff/3600)}h ago`; return`${Math.floor(diff/86400)}d ago`;
};

function StatusPill({status,onClick,size='sm'}){
  const cfg=STATUS_CFG[status]||STATUS_CFG.not_started;
  return(
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border transition-all ${onClick?'hover:opacity-80 active:scale-95 cursor-pointer':'cursor-default'} ${size==='xs'?'text-[10px] px-2 py-0.5':'text-xs px-2.5 py-1'}`}
      style={{color:cfg.color,backgroundColor:cfg.bg,borderColor:cfg.border}}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:cfg.dot}}/>
      {cfg.label}
      {onClick&&<ChevronDown className="w-2.5 h-2.5 opacity-50"/>}
    </button>
  );
}

function StatusDropdown({current,onSelect,isDark}){
  return(
    <div className="rounded-xl overflow-hidden shadow-2xl border z-50 min-w-[160px]"
      style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
      {STATUSES.map(s=>{
        const cfg=STATUS_CFG[s];
        return(
          <button key={s} onClick={()=>onSelect(s)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium hover:opacity-80 text-left"
            style={{backgroundColor:s===current?(isDark?'rgba(255,255,255,0.06)':'#f1f5f9'):'transparent',color:cfg.color}}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:cfg.dot}}/>
            {cfg.label}
            {s===current&&<CheckCircle2 className="w-3 h-3 ml-auto opacity-60"/>}
          </button>
        );
      })}
    </div>
  );
}

function ProgressBar({pct,color='#1FAF5A',height='h-1.5',isDark}){
  return(
    <div className={`${height} rounded-full overflow-hidden`} style={{backgroundColor:isDark?'rgba(255,255,255,0.08)':'#f1f5f9'}}>
      <motion.div className="h-full rounded-full"
        style={{background:`linear-gradient(90deg,${color},${color}bb)`}}
        initial={{width:0}} animate={{width:`${Math.min(100,pct||0)}%`}}
        transition={{duration:0.9,ease:'easeOut'}}/>
    </div>
  );
}

// ── Add/Edit Compliance Modal ──────────────────────────────────────────────
function ComplianceFormModal({existing,onClose,onSave,isDark}){
  const[name,setName]=useState(existing?.name||'');
  const[category,setCategory]=useState(existing?.category||'ROC');
  const[frequency,setFrequency]=useState(existing?.frequency||'annual');
  const[fyYear,setFyYear]=useState(existing?.fy_year||'2025-26');
  const[period,setPeriod]=useState(existing?.period_label||'');
  const[dueType,setDueType]=useState(existing?.recurring_due?'recurring':'specific');
  const[dueDate,setDueDate]=useState(existing?.due_date||'');
  const[recurDay,setRecurDay]=useState(existing?.recurring_day||'11');
  const[recurMonth,setRecurMonth]=useState(existing?.recurring_quarter_month||'3');
  const[desc,setDesc]=useState(existing?.description||'');
  const[saving,setSaving]=useState(false);
  const[templates,setTemplates]=useState([]);

  const isRecurring=['monthly','quarterly','half_yearly'].includes(frequency);
  useEffect(()=>{api.get('/compliance/common-templates').then(r=>setTemplates(r.data||[])).catch(()=>{});},[]);
  useEffect(()=>{if(isRecurring)setDueType('recurring');else setDueType('specific');},[frequency]);

  const inputStyle={backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'};
  const inputCls='w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';

  const recurringLabel=()=>{
    const day=recurDay==='last'?'Last day':`${recurDay}`;
    if(frequency==='monthly')return`Due on day ${day} of every month`;
    if(frequency==='quarterly'){const mo=QUARTER_MONTHS.find(m=>m.value===recurMonth)?.label||'';return`Due on day ${day} · ${mo}`;}
    if(frequency==='half_yearly')return`Due on day ${day} of every 6th month`;
    return'';
  };

  const handleSave=async()=>{
    if(!name.trim()){toast.error('Name is required');return;}
    setSaving(true);
    try{
      const payload={
        name:name.trim(),category,frequency,
        fy_year:fyYear||undefined,
        period_label:period||undefined,
        description:desc||undefined,
        ...(dueType==='specific'&&dueDate?{due_date:dueDate}:{}),
        ...(dueType==='recurring'?{
          recurring_due:true,recurring_day:recurDay,
          recurring_quarter_month:frequency==='quarterly'?recurMonth:undefined,
          period_label:period||recurringLabel(),
        }:{}),
      };
      if(existing?.id){await api.patch(`/compliance/${existing.id}`,payload);toast.success('Updated');}
      else{await api.post('/compliance/',payload);toast.success('Created');}
      onSave();
    }catch(err){toast.error(err?.response?.data?.detail||'Save failed');}
    finally{setSaving(false);}
  };

  return(
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)'}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{backgroundColor:isDark?D.card:'#fff',border:isDark?`1px solid ${D.border}`:'1px solid #e2e8f0'}}
        initial={{scale:0.92,y:24}} animate={{scale:1,y:0}} exit={{scale:0.92,y:24}}
        transition={{type:'spring',stiffness:220,damping:22}} onClick={e=>e.stopPropagation()}>

        <div className="px-6 py-5 flex items-center justify-between text-white flex-shrink-0"
          style={{background:'linear-gradient(135deg,#0D3B66,#1F6FB2)'}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><BookOpen className="w-5 h-5 text-white"/></div>
            <div><h2 className="text-lg font-black">{existing?'Edit Compliance':'New Compliance'}</h2>
              <p className="text-blue-200 text-xs">Define compliance type and due schedule</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4 text-white"/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4" style={{scrollbarWidth:'thin'}}>
          {!existing&&templates.length>0&&(
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:isDark?D.muted:'#64748b'}}>Quick Templates</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.slice(0,14).map(t=>(
                  <button key={t.name} onClick={()=>{setName(t.name);setCategory(t.category);setFrequency(t.frequency);}}
                    className="text-[11px] px-2 py-1 rounded-lg border font-semibold transition-all hover:opacity-80 active:scale-95"
                    style={{backgroundColor:CATEGORY_CFG[t.category]?.bg,borderColor:CATEGORY_CFG[t.category]?.border,color:CATEGORY_CFG[t.category]?.color}}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>Compliance Name *</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. AOC-4 Filing FY 2025-26" className={inputCls} style={inputStyle}/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>Category</label>
              <select value={category} onChange={e=>setCategory(e.target.value)} className={inputCls} style={inputStyle}>
                {CATEGORIES.map(c=><option key={c} value={c}>{CATEGORY_CFG[c]?.label||c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>Frequency</label>
              <select value={frequency} onChange={e=>setFrequency(e.target.value)} className={inputCls} style={inputStyle}>
                {FREQUENCIES.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>FY Year</label>
              <select value={fyYear} onChange={e=>setFyYear(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— Select —</option>
                {FY_OPTIONS.map(y=><option key={y} value={y}>FY {y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>Period Label</label>
              <input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="e.g. Q1 FY25-26, Apr 2025" className={inputCls} style={inputStyle}/>
            </div>
          </div>

          {/* Smart due date section */}
          <div className="rounded-2xl border overflow-hidden" style={{borderColor:isDark?D.border:'#e2e8f0'}}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{backgroundColor:isDark?D.raised:'#f8fafc'}}>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" style={{color:isDark?D.dimmer:'#94a3b8'}}/>
                <span className="text-xs font-bold uppercase tracking-wider" style={{color:isDark?D.muted:'#64748b'}}>Due Date</span>
              </div>
              {isRecurring&&(
                <div className="flex items-center gap-1 rounded-lg overflow-hidden border text-xs font-semibold" style={{borderColor:isDark?D.border:'#e2e8f0'}}>
                  {[['specific','One-time'],['recurring','Recurring']].map(([v,l])=>(
                    <button key={v} onClick={()=>setDueType(v)} className="px-2.5 py-1 transition-all"
                      style={{backgroundColor:dueType===v?'#1F6FB2':'transparent',color:dueType===v?'#fff':isDark?D.dimmer:'#64748b'}}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 space-y-3">
              {dueType==='specific'?(
                <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className={inputCls} style={inputStyle}/>
              ):(
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2"><Repeat className="w-3.5 h-3.5 text-blue-500"/>
                      <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#374151'}}>Due on day</span></div>
                    <select value={recurDay} onChange={e=>setRecurDay(e.target.value)}
                      className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle}>
                      {RECURRING_DAYS.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <span className="text-xs" style={{color:isDark?D.dimmer:'#94a3b8'}}>of every</span>
                    {frequency==='monthly'&&<span className="text-xs font-bold text-blue-500">month</span>}
                    {frequency==='half_yearly'&&<span className="text-xs font-bold text-blue-500">6th month</span>}
                  </div>
                  {frequency==='quarterly'&&(
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#374151'}}>Quarter month:</span>
                      <select value={recurMonth} onChange={e=>setRecurMonth(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={inputStyle}>
                        {QUARTER_MONTHS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                  )}
                  {recurringLabel()&&(
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{backgroundColor:isDark?'rgba(59,130,246,0.1)':'#eff6ff'}}>
                      <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0"/>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{recurringLabel()}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 block" style={{color:isDark?D.muted:'#374151'}}>Description (optional)</label>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} placeholder="Notes about this compliance type…"
              className={`${inputCls} resize-none`} style={inputStyle}/>
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.raised:'#f8fafc'}}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{color:isDark?D.muted:undefined}}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving||!name.trim()} className="font-semibold text-white rounded-xl px-5" style={{backgroundColor:'#1F6FB2'}}>
            {saving?<><Loader2 className="w-4 h-4 mr-1.5 animate-spin"/>Saving…</>:<><CheckCircle2 className="w-4 h-4 mr-1.5"/>{existing?'Save Changes':'Create'}</>}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Import Excel Modal ─────────────────────────────────────────────────────
function ImportExcelModal({complianceId,complianceName,onClose,onImported,isDark,allUsers=[],compliance}){
  const[step,setStep]=useState(1);
  const[file,setFile]=useState(null);
  const[preview,setPreview]=useState(null);
  const[previewing,setPreviewing]=useState(false);
  const[clientCol,setClientCol]=useState('Client Name');
  const[statusCol,setStatusCol]=useState('');
  const[notesCol,setNotesCol]=useState('');
  const[assignedToCol,setAssignedToCol]=useState('');   // column in excel for assigned_to
  const[defaultAssignedTo,setDefaultAssignedTo]=useState(''); // fallback user id
  const[result,setResult]=useState(null);
  const fileRef=useRef(null);
  const inputStyle={backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'};

  // Auto-select a default user based on compliance category
  useEffect(()=>{
    if(allUsers.length&&compliance?.category){
      const cat=(compliance.category||'').toLowerCase();
      const match=allUsers.find(u=>(u.departments||[]).some(d=>d.toLowerCase().includes(cat)||cat.includes(d.toLowerCase())));
      if(match)setDefaultAssignedTo(match.id);
    }
  },[allUsers,compliance?.category]);

  const handleFileChange=async e=>{
    const f=e.target.files?.[0]; if(!f)return;
    setFile(f);setPreviewing(true);
    try{
      const fd=new FormData();fd.append('file',f);
      const res=await api.post(`/compliance/${complianceId}/preview-excel`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      setPreview(res.data);
      const cols=res.data.columns||[];
      setClientCol(cols.find(c=>c.toLowerCase().includes('client')||c.toLowerCase().includes('company'))||cols[0]||'');
      setStatusCol(cols.find(c=>c.toLowerCase().includes('status'))||'');
      setNotesCol(cols.find(c=>c.toLowerCase().includes('note'))||'');
      setStep(2);
    }catch(err){toast.error(err?.response?.data?.detail||'Could not read file');}
    finally{setPreviewing(false);}
  };

  const handleImport=async()=>{
    setStep(3);
    try{
      const fd=new FormData();
      fd.append('file',file);fd.append('client_col',clientCol);
      fd.append('status_col',statusCol);fd.append('notes_col',notesCol);
      if(assignedToCol)fd.append('assigned_to_col',assignedToCol);
      if(defaultAssignedTo)fd.append('default_assigned_to',defaultAssignedTo);
      const res=await api.post(`/compliance/${complianceId}/import-excel`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      setResult(res.data);setStep(4);onImported();
      toast.success(`Import complete — ${res.data.added} added, ${res.data.updated} updated`);
    }catch(err){toast.error(err?.response?.data?.detail||'Import failed');setStep(2);}
  };

  return(
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{background:'rgba(0,0,0,0.8)',backdropFilter:'blur(8px)'}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{backgroundColor:isDark?D.card:'#fff',border:isDark?`1px solid ${D.border}`:'1px solid #e2e8f0'}}
        initial={{scale:0.92,y:24}} animate={{scale:1,y:0}} exit={{scale:0.92,y:24}}
        transition={{type:'spring',stiffness:220,damping:22}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 text-white flex-shrink-0 flex items-center justify-between"
          style={{background:'linear-gradient(135deg,#0D3B66,#1FAF5A)'}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><FileUp className="w-5 h-5 text-white"/></div>
            <div><h2 className="text-lg font-black">Import Excel / CSV</h2>
              <p className="text-green-200 text-xs truncate max-w-[280px]">{complianceName}</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4 text-white"/></button>
        </div>
        <div className="flex items-center gap-2 px-6 py-3 border-b" style={{borderColor:isDark?D.border:'#f1f5f9'}}>
          {['Upload','Map Columns','Importing','Done'].map((label,i)=>{
            const num=i+1;const done=step>num;const active=step===num;
            return(<React.Fragment key={label}>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{backgroundColor:done?'#1FAF5A':active?'#1F6FB2':isDark?D.raised:'#e2e8f0',color:done||active?'#fff':isDark?D.muted:'#64748b'}}>
                  {done?'✓':num}</div>
                <span className="text-xs font-semibold hidden sm:block"
                  style={{color:active?(isDark?D.text:'#0f172a'):isDark?D.dimmer:'#94a3b8'}}>{label}</span>
              </div>
              {i<3&&<div className="flex-1 h-px" style={{backgroundColor:isDark?D.border:'#e2e8f0'}}/>}
            </React.Fragment>);
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-6" style={{scrollbarWidth:'thin'}}>
          {step===1&&(
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden"/>
              <button onClick={()=>fileRef.current?.click()} disabled={previewing}
                className="flex flex-col items-center justify-center w-full py-14 rounded-2xl border-2 border-dashed transition-all hover:border-blue-400 gap-3"
                style={{borderColor:isDark?D.border:'#cbd5e1',backgroundColor:isDark?'rgba(255,255,255,0.02)':'#f8fafc'}}>
                {previewing?<><Loader2 className="w-8 h-8 text-blue-500 animate-spin"/><p className="text-sm font-semibold text-blue-500">Reading file…</p></>
                  :<><Upload className="w-8 h-8" style={{color:isDark?D.muted:'#64748b'}}/>
                    <p className="text-sm font-semibold" style={{color:isDark?D.text:'#1e293b'}}>Click to upload Excel or CSV</p>
                    <p className="text-xs" style={{color:isDark?D.dimmer:'#94a3b8'}}>Columns: Client Name, Status (optional), Notes (optional)</p></>}
              </button>
            </div>
          )}
          {step===2&&preview&&(
            <div className="space-y-4">
              <div className="p-3 rounded-xl border" style={{borderColor:isDark?'rgba(31,175,90,0.3)':'#bbf7d0',backgroundColor:isDark?'rgba(31,175,90,0.08)':'#f0fdf4'}}>
                <p className="text-sm font-semibold" style={{color:isDark?'#4ade80':'#15803d'}}>✓ {preview.total_rows} rows · {preview.columns.length} columns</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[['Client Name *',clientCol,setClientCol,true],['Status',statusCol,setStatusCol,false],['Notes',notesCol,setNotesCol,false],['Assigned To (col)',assignedToCol,setAssignedToCol,false]].map(([label,val,set,req])=>(
                  <div key={label}>
                    <label className="text-xs font-semibold mb-1 block" style={{color:isDark?D.muted:'#374151'}}>{label}</label>
                    <select value={val} onChange={e=>set(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}}>
                      {!req&&<option value="">— Skip —</option>}
                      {(preview.columns||[]).map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {/* Default assigned-to user (used when no column selected or cell is empty) */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{color:isDark?D.muted:'#374151'}}>
                  Default Assigned To <span className="font-normal opacity-60">(used when column is empty)</span>
                </label>
                <select value={defaultAssignedTo} onChange={e=>setDefaultAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}}>
                  <option value="">— Unassigned —</option>
                  {allUsers.map(u=>(
                    <option key={u.id} value={u.id}>{`${u.full_name}${(u.departments||[]).length?' ('+u.departments.join(', ')+')':''}`}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto rounded-xl border" style={{borderColor:isDark?D.border:'#e2e8f0'}}>
                <table className="w-full text-xs">
                  <thead><tr style={{backgroundColor:isDark?D.raised:'#f8fafc'}}>
                    {(preview.columns||[]).slice(0,5).map(c=><th key={c} className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{color:isDark?D.dimmer:'#64748b'}}>{c}</th>)}
                  </tr></thead>
                  <tbody>{(preview.rows||[]).slice(0,5).map((row,i)=>(
                    <tr key={i} style={{borderTop:isDark?`1px solid ${D.border}`:'1px solid #f1f5f9'}}>
                      {(preview.columns||[]).slice(0,5).map(c=><td key={c} className="px-3 py-2 truncate max-w-[150px]" style={{color:isDark?D.muted:'#374151'}}>{row[c]!=null?String(row[c]):''}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {step===3&&<div className="flex flex-col items-center justify-center py-16 gap-4"><Loader2 className="w-10 h-10 text-blue-500 animate-spin"/><p className="text-sm font-semibold" style={{color:isDark?D.text:'#1e293b'}}>Importing…</p></div>}
          {step===4&&result&&(
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{backgroundColor:'rgba(31,175,90,0.15)'}}><CheckCircle2 className="w-8 h-8 text-emerald-500"/></div>
              <h3 className="text-lg font-black" style={{color:isDark?D.text:'#0f172a'}}>Import Complete!</h3>
              <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
                {[['Added',result.added,'#1FAF5A'],['Updated',result.updated,'#3B82F6'],['Total',result.total_rows_in_file,isDark?D.muted:'#64748b']].map(([l,v,c])=>(
                  <div key={l} className="text-center p-3 rounded-xl border" style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.raised:'#f8fafc'}}>
                    <p className="text-2xl font-black" style={{color:c}}>{v}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide" style={{color:isDark?D.dimmer:'#94a3b8'}}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.raised:'#f8fafc'}}>
          {step===4?<Button onClick={onClose} className="font-semibold text-white rounded-xl px-5" style={{backgroundColor:'#1FAF5A'}}>Done</Button>
            :step===2?<><Button variant="ghost" onClick={()=>{setStep(1);setFile(null);setPreview(null);}} className="font-semibold rounded-xl" style={{color:isDark?D.muted:undefined}}>Back</Button>
              <Button onClick={handleImport} disabled={!clientCol} className="font-semibold text-white rounded-xl px-5" style={{backgroundColor:'#1F6FB2'}}><Upload className="w-4 h-4 mr-1.5"/>Import {preview?.total_rows} Rows</Button></>
            :<Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{color:isDark?D.muted:undefined}}>Cancel</Button>}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Assign Clients Modal ───────────────────────────────────────────────────
function AssignClientsModal({compliance,onClose,onAssigned,isDark,allUsers=[]}){
  const[clients,setClients]=useState([]);
  const[search,setSearch]=useState('');
  const[selected,setSelected]=useState(new Set());
  const[loading,setLoading]=useState(true);
  const[assigning,setAssigning]=useState(false);
  const[typeFilter,setTypeFilter]=useState('all');
  const[assignedTo,setAssignedTo]=useState('');  // default assigned_to user

  // Pre-select user whose department matches compliance category
  useEffect(()=>{
    if(allUsers.length&&compliance.category){
      const cat=compliance.category.toLowerCase();
      const match=allUsers.find(u=>(u.departments||[]).some(d=>d.toLowerCase().includes(cat)||cat.includes(d.toLowerCase())));
      if(match)setAssignedTo(match.id);
    }
  },[allUsers,compliance.category]);

  useEffect(()=>{api.get('/clients').then(r=>setClients(Array.isArray(r.data)?r.data:(r.data?.clients||[]))).catch(()=>{}).finally(()=>setLoading(false));},[]);
  const clientTypes=useMemo(()=>[...new Set(clients.map(c=>c.client_type).filter(Boolean))],[clients]);
  const filtered=useMemo(()=>{
    let list=typeFilter!=='all'?clients.filter(c=>c.client_type===typeFilter):clients;
    if(search)list=list.filter(c=>(c.company_name||'').toLowerCase().includes(search.toLowerCase()));
    return list;
  },[clients,search,typeFilter]);

  const handleAssign=async()=>{
    if(!selected.size){toast.error('Select at least one client');return;}
    setAssigning(true);
    try{
      const payload={client_ids:[...selected]};
      if(assignedTo)payload.assigned_to=assignedTo;
      await api.post(`/compliance/${compliance.id}/assignments/bulk-assign`,payload);
      toast.success(`${selected.size} client${selected.size>1?'s':''} assigned`);onAssigned();
    }
    catch(err){toast.error(err?.response?.data?.detail||'Assignment failed');}
    finally{setAssigning(false);}
  };

  return(
    <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)'}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose}>
      <motion.div className="w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{backgroundColor:isDark?D.card:'#fff',border:isDark?`1px solid ${D.border}`:'1px solid #e2e8f0',maxHeight:'88vh'}}
        initial={{scale:0.92,y:24}} animate={{scale:1,y:0}} exit={{scale:0.92,y:24}}
        transition={{type:'spring',stiffness:220,damping:22}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 text-white flex items-center justify-between flex-shrink-0"
          style={{background:'linear-gradient(135deg,#0D3B66,#8B5CF6)'}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-white"/></div>
            <div><h2 className="text-lg font-black">Assign Clients</h2>
              <p className="text-purple-200 text-xs truncate max-w-[250px]">{compliance.name}</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4 text-white"/></button>
        </div>

        {/* Default Assigned To picker */}
        <div className="px-4 py-3 border-b flex-shrink-0 flex items-center gap-3"
          style={{borderColor:isDark?D.border:'#f1f5f9',backgroundColor:isDark?D.raised:'#fafafa'}}>
          <span className="text-xs font-bold flex-shrink-0" style={{color:isDark?D.muted:'#374151'}}>Assign to:</span>
          <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}
            className="flex-1 px-3 py-1.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}}>
            <option value="">— Unassigned —</option>
            {allUsers.map(u=>(
              <option key={u.id} value={u.id}>{`${u.full_name}${(u.departments||[]).length?' ('+u.departments.join(', ')+')':''}`}</option>
            ))}
          </select>
        </div>

        <div className="p-3 border-b flex-shrink-0 flex gap-2" style={{borderColor:isDark?D.border:'#f1f5f9'}}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:isDark?D.dimmer:'#94a3b8'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
              className="w-full pl-8 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}}/>
          </div>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm focus:outline-none"
            style={{backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}}>
            <option value="all">All Types</option>
            {clientTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="px-4 py-2 flex items-center justify-between border-b flex-shrink-0" style={{borderColor:isDark?D.border:'#f1f5f9'}}>
          <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#64748b'}}>{selected.size} selected · {filtered.length} shown</span>
          <div className="flex gap-2">
            <button onClick={()=>setSelected(new Set(filtered.map(c=>c.id)))} className="text-xs font-semibold text-blue-500">All</button>
            <button onClick={()=>setSelected(new Set())} className="text-xs font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>Clear</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{scrollbarWidth:'thin'}}>
          {loading?<div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-blue-500 animate-spin"/></div>
            :filtered.map((client,idx)=>{
              const isSel=selected.has(client.id);
              return(
                <button key={client.id}
                  onClick={()=>setSelected(prev=>{const s=new Set(prev);isSel?s.delete(client.id):s.add(client.id);return s;})}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border-b text-left transition-colors"
                  style={{borderColor:isDark?D.border:'#f1f5f9',backgroundColor:isSel?(isDark?'rgba(59,130,246,0.08)':'#eff6ff'):'transparent'}}>
                  <span className="text-[11px] font-bold w-7 text-right flex-shrink-0 tabular-nums" style={{color:isDark?D.dimmer:'#94a3b8'}}>{idx+1}</span>
                  <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                    style={{borderColor:isSel?'#3B82F6':isDark?D.border:'#d1d5db',backgroundColor:isSel?'#3B82F6':'transparent'}}>
                    {isSel&&<span className="text-white text-[9px]">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{color:isDark?D.text:'#0f172a'}}>{client.company_name}</p>
                    <p className="text-[11px]" style={{color:isDark?D.dimmer:'#94a3b8'}}>{client.client_type}</p>
                  </div>
                </button>
              );
            })}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t flex-shrink-0"
          style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.raised:'#f8fafc'}}>
          <Button variant="ghost" onClick={onClose} className="font-semibold rounded-xl" style={{color:isDark?D.muted:undefined}}>Cancel</Button>
          <Button onClick={handleAssign} disabled={assigning||!selected.size} className="font-semibold text-white rounded-xl px-5" style={{backgroundColor:'#8B5CF6'}}>
            {assigning?<><Loader2 className="w-4 h-4 mr-1.5 animate-spin"/>Assigning…</>:<><Users className="w-4 h-4 mr-1.5"/>Assign {selected.size} Clients</>}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
// ── Full Page Detail View ──────────────────────────────────────────────────
function ComplianceDetailPage({compliance:initialCompliance,onBack,isDark,allUsers}){
  const{user}=useAuth();
  const[compliance,setCompliance]=useState(initialCompliance);
  const[items,setItems]=useState([]);
  const[total,setTotal]=useState(0);
  const[loading,setLoading]=useState(true);
  const[statusFilter,setStatusFilter]=useState('all');
  const[search,setSearch]=useState('');
  const[selectedIds,setSelectedIds]=useState(new Set());
  const[openDropdown,setOpenDropdown]=useState(null);
  const[bulkOpen,setBulkOpen]=useState(false);
  const[showImport,setShowImport]=useState(false);
  const[showAssign,setShowAssign]=useState(false);
  const[editingNote,setEditingNote]=useState(null);
  const[refreshKey,setRefreshKey]=useState(0);
  // New tabs
  const[activeTab,setActiveTab]=useState('clients'); // 'clients' | 'monthly' | 'comments'
  const[comments,setComments]=useState([]);
  const[commentsLoading,setCommentsLoading]=useState(false);
  const[commentText,setCommentText]=useState('');
  const[commentClient,setCommentClient]=useState('all'); // 'all' or client_id
  const[sendingComment,setSendingComment]=useState(false);
  const[monthlySummary,setMonthlySummary]=useState({months:[],total_clients:0});
  const[monthlyLoading,setMonthlyLoading]=useState(false);
  const[monthlyViewYear,setMonthlyViewYear]=useState(()=>new Date().getFullYear());
  const[monthlyAssignment,setMonthlyAssignment]=useState(null); // for per-client month editing

  const userMap=useMemo(()=>{const m={};(allUsers||[]).forEach(u=>{m[u.id]=u.full_name;});return m;},[allUsers]);

  const fetchItems=useCallback(async()=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({limit:1000});
      if(statusFilter!=='all')params.set('status',statusFilter);
      if(search.trim())params.set('search',search.trim());
      const[asgn,cm]=await Promise.all([
        api.get(`/compliance/${compliance.id}/assignments?${params}`),
        api.get('/compliance/').then(r=>(r.data||[]).find(c=>c.id===compliance.id)||compliance),
      ]);
      setItems(asgn.data.items||[]);setTotal(asgn.data.total||0);setCompliance(cm);
    }catch{toast.error('Failed to load');}
    finally{setLoading(false);}
  },[compliance.id,statusFilter,search,refreshKey]);

  const fetchComments=useCallback(async()=>{
    setCommentsLoading(true);
    try{
      const params=commentClient!=='all'?`?client_id=${commentClient}`:'';
      const res=await api.get(`/compliance/${compliance.id}/comments${params}`);
      setComments(Array.isArray(res.data)?res.data:[]);
    }catch{toast.error('Failed to load comments');}
    finally{setCommentsLoading(false);}
  },[compliance.id,commentClient]);

  const fetchMonthlySummary=useCallback(async()=>{
    setMonthlyLoading(true);
    try{
      const res=await api.get(`/compliance/${compliance.id}/monthly-summary`);
      setMonthlySummary(res.data||{months:[],total_clients:0});
    }catch{toast.error('Failed to load monthly data');}
    finally{setMonthlyLoading(false);}
  },[compliance.id]);

  useEffect(()=>{fetchItems();},[fetchItems]);
  useEffect(()=>{if(activeTab==='comments')fetchComments();},[activeTab,fetchComments]);
  useEffect(()=>{if(activeTab==='monthly')fetchMonthlySummary();},[activeTab,fetchMonthlySummary]);
  useEffect(()=>{
    if(!openDropdown&&!bulkOpen)return;
    const fn=()=>{setOpenDropdown(null);setBulkOpen(false);};
    document.addEventListener('mousedown',fn);return()=>document.removeEventListener('mousedown',fn);
  },[openDropdown,bulkOpen]);

  const updateStatus=async(id,newStatus)=>{
    setItems(prev=>prev.map(a=>a.id===id?{...a,status:newStatus,updated_at:new Date().toISOString()}:a));
    setOpenDropdown(null);
    try{await api.patch(`/compliance/${compliance.id}/assignments/${id}`,{status:newStatus});}
    catch{toast.error('Update failed');fetchItems();}
  };

  const saveNote=async(id,note)=>{
    setItems(prev=>prev.map(a=>a.id===id?{...a,notes:note}:a));setEditingNote(null);
    try{await api.patch(`/compliance/${compliance.id}/assignments/${id}`,{status:items.find(a=>a.id===id)?.status||'not_started',notes:note});}
    catch{toast.error('Note save failed');}
  };

  const bulkUpdate=async newStatus=>{
    if(!selectedIds.size){toast.error('Select rows first');return;}setBulkOpen(false);
    try{
      await api.patch(`/compliance/${compliance.id}/assignments/bulk-update`,{assignment_ids:[...selectedIds],status:newStatus});
      toast.success(`${selectedIds.size} records → ${STATUS_CFG[newStatus]?.label}`);
      setSelectedIds(new Set());setRefreshKey(k=>k+1);
    }catch{toast.error('Bulk update failed');}
  };

  const deleteAssignment=async id=>{
    if(!confirm('Remove this client?'))return;
    setItems(prev=>prev.filter(a=>a.id!==id));
    try{await api.delete(`/compliance/${compliance.id}/assignments/${id}`);}
    catch{fetchItems();}
  };

  const addComment=async()=>{
    if(!commentText.trim())return;
    setSendingComment(true);
    try{
      const payload={text:commentText.trim()};
      if(commentClient!=='all')payload.client_id=commentClient;
      const res=await api.post(`/compliance/${compliance.id}/comments`,payload);
      setComments(prev=>[res.data,...prev]);
      setCommentText('');
      toast.success('Comment added');
    }catch{toast.error('Failed to add comment');}
    finally{setSendingComment(false);}
  };

  const deleteComment=async(commentId)=>{
    try{
      await api.delete(`/compliance/${compliance.id}/comments/${commentId}`);
      setComments(prev=>prev.filter(c=>c.id!==commentId));
    }catch{toast.error('Failed to delete comment');}
  };

  const updateMonthlyStatus=async(assignmentId,month,status)=>{
    try{
      await api.patch(`/compliance/${compliance.id}/assignments/${assignmentId}/monthly`,{month,status});
      fetchMonthlySummary();
      toast.success(`${month} → ${STATUS_CFG[status]?.label}`);
    }catch{toast.error('Update failed');}
  };

  const catCfg=CATEGORY_CFG[compliance.category]||CATEGORY_CFG.OTHER;
  const stats=compliance._stats||{};
  const overdue=compliance.due_date&&isPast(safeDate(compliance.due_date))&&(stats.done||0)<(stats.total||0);
  const allSelected=items.length>0&&items.every(a=>selectedIds.has(a.id));
  const someSelected=items.some(a=>selectedIds.has(a.id));

  const STATUS_TABS=[
    {key:'all',         label:'All',         count:stats.total       ||0},
    {key:'not_started', label:'Not Started',  count:stats.not_started ||0},
    {key:'in_progress', label:'In Progress',  count:stats.in_progress ||0},
    {key:'completed',   label:'Completed',    count:stats.completed   ||0},
    {key:'filed',       label:'Filed',        count:stats.filed       ||0},
    {key:'na',          label:'N/A',          count:stats.na          ||0},
  ];

  // ── Period config based on compliance frequency ─────────────────────────
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const periodConfig=useMemo(()=>{
    const freq=compliance.frequency;
    const now=new Date();
    const curMonthKey=format(now,'yyyy-MM');
    const curQuarter=Math.floor((now.getMonth())/3)+1;
    const curHalf=now.getMonth()<6?1:2;

    if(freq==='monthly'||!freq){
      // 12 columns: Jan–Dec
      const periods=Array.from({length:12},(_,i)=>{
        const mk=`${monthlyViewYear}-${String(i+1).padStart(2,'0')}`;
        return{key:mk,label:MONTHS[i],isCurrent:mk===curMonthKey};
      });
      return{type:'monthly',label:'Monthly',periods,colLabel:'Month'};
    }
    if(freq==='quarterly'){
      // 4 columns: Q1–Q4
      const QUARTER_RANGES=[[1,2,3],[4,5,6],[7,8,9],[10,11,12]];
      const periods=QUARTER_RANGES.map((months,qi)=>{
        const mk=`${monthlyViewYear}-Q${qi+1}`;
        return{key:mk,label:`Q${qi+1}`,sublabel:`${MONTHS[months[0]-1]}–${MONTHS[months[2]-1]}`,isCurrent:monthlyViewYear===now.getFullYear()&&curQuarter===qi+1};
      });
      return{type:'quarterly',label:'Quarterly',periods,colLabel:'Quarter'};
    }
    if(freq==='half_yearly'){
      // 2 columns: H1, H2
      const periods=[
        {key:`${monthlyViewYear}-H1`,label:'H1',sublabel:'Apr – Sep',isCurrent:monthlyViewYear===now.getFullYear()&&curHalf===1},
        {key:`${monthlyViewYear}-H2`,label:'H2',sublabel:'Oct – Mar',isCurrent:monthlyViewYear===now.getFullYear()&&curHalf===2},
      ];
      return{type:'half_yearly',label:'Half-Yearly',periods,colLabel:'Half Year'};
    }
    if(freq==='annual'){
      // 1 column: the year itself
      const periods=[
        {key:`${monthlyViewYear}`,label:`FY ${monthlyViewYear}`,sublabel:'Full Year',isCurrent:monthlyViewYear===now.getFullYear()},
      ];
      return{type:'annual',label:'Annual',periods,colLabel:'Year'};
    }
    // one_time — single row
    const periods=[{key:`${monthlyViewYear}`,label:'One-Time',sublabel:'',isCurrent:monthlyViewYear===now.getFullYear()}];
    return{type:'one_time',label:'One-Time',periods,colLabel:'Period'};
  },[compliance.frequency,monthlyViewYear]);

  const monthlyRows=useMemo(()=>{
    const map={};
    (monthlySummary.months||[]).forEach(m=>{map[m.month]=m;});
    return periodConfig.periods.map(p=>({...p,data:map[p.key]||null}));
  },[monthlySummary,periodConfig]);

  return(
    <motion.div className="min-h-screen flex flex-col" style={{background:isDark?D.bg:'#f8fafc'}}
      variants={pageVariants} initial="hidden" animate="visible" exit="exit">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b" style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',borderLeft:`4px solid ${catCfg.color}`}}>
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-70 flex-shrink-0" style={{color:isDark?D.muted:'#64748b'}}>
            <ArrowLeft className="w-4 h-4"/>Back
          </button>
          <div className="w-px h-5 flex-shrink-0" style={{backgroundColor:isDark?D.border:'#e2e8f0'}}/>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex-shrink-0"
              style={{backgroundColor:catCfg.bg,color:catCfg.color,border:`1px solid ${catCfg.border}`}}>{catCfg.label}</span>
            <h1 className="text-base font-black truncate" style={{color:isDark?D.text:'#0f172a'}}>{compliance.name}</h1>
            {compliance.fy_year&&<span className="text-[11px] font-semibold flex-shrink-0" style={{color:isDark?D.muted:'#64748b'}}>FY {compliance.fy_year}</span>}
            {compliance.due_date&&(
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0"
                style={{backgroundColor:overdue?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.1)',color:overdue?'#ef4444':'#d97706'}}>
                Due {fmtDate(compliance.due_date)}{overdue?' · OVERDUE':''}
              </span>
            )}
            {compliance.period_label&&!compliance.due_date&&<span className="text-[11px] flex-shrink-0" style={{color:isDark?D.muted:'#64748b'}}>{compliance.period_label}</span>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-sm font-black tabular-nums" style={{color:catCfg.color}}>{stats.pct||0}%</p>
              <p className="text-[10px] font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{stats.done||0}/{stats.total||0} done</p>
            </div>
            <div className="w-24"><ProgressBar pct={stats.pct||0} color={catCfg.color} height="h-2" isDark={isDark}/></div>
          </div>
        </div>
        <div className="px-5 py-2 flex items-center gap-4 border-t overflow-x-auto" style={{borderColor:isDark?D.border:'#f1f5f9',scrollbarWidth:'none'}}>
          {[{k:'total',l:'Total',c:isDark?D.text:'#0f172a'},{k:'not_started',l:'Not Started',c:STATUS_CFG.not_started.color},
            {k:'in_progress',l:'WIP',c:STATUS_CFG.in_progress.color},{k:'completed',l:'Completed',c:STATUS_CFG.completed.color},
            {k:'filed',l:'Filed',c:STATUS_CFG.filed.color}].map(({k,l,c})=>(
            <div key={k} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-sm font-black tabular-nums" style={{color:c}}>{k==='total'?(stats.total||0):(stats[k]||0)}</span>
              <span className="text-[10px] font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{l}</span>
              {k!=='filed'&&<span className="text-[10px]" style={{color:isDark?D.border:'#e2e8f0'}}>·</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Main Tab Bar */}
      <div className="flex border-b overflow-x-auto flex-shrink-0" style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',scrollbarWidth:'none'}}>
        {[
          {key:'clients', label:'Clients', icon:Users,    count:stats.total||0},
          {key:'monthly', label:`${periodConfig?.label||'Period'} Tracker`, icon:BarChart3, count:null},
          {key:'comments',label:'Comments', icon:MessageSquare, count:comments.length||null},
        ].map(({key,label,icon:Icon,count})=>(
          <button key={key} onClick={()=>setActiveTab(key)}
            className="flex-shrink-0 px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2"
            style={{borderColor:activeTab===key?catCfg.color:'transparent',color:activeTab===key?catCfg.color:isDark?D.dimmer:'#64748b',backgroundColor:activeTab===key?(isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.01)'):'transparent'}}>
            <Icon className="w-3.5 h-3.5"/>
            {label}
            {count!=null&&count>0&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
              style={{backgroundColor:activeTab===key?catCfg.bg:isDark?D.raised:'#f1f5f9',color:activeTab===key?catCfg.color:isDark?D.dimmer:'#94a3b8'}}>{count}</span>}
          </button>
        ))}
      </div>

      {/* ─── CLIENTS TAB ─────────────────────────────────────────────────── */}
      {activeTab==='clients'&&(<>
        {/* Toolbar */}
        <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap flex-shrink-0"
          style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:isDark?D.dimmer:'#94a3b8'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client…"
              className="w-full pl-8 pr-3 py-1.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.text:'#1e293b'}}/>
          </div>
          {selectedIds.size>0&&(
            <div className="relative" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>setBulkOpen(b=>!b)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold text-white" style={{backgroundColor:catCfg.color}}>
                <Zap className="w-3.5 h-3.5"/>Update {selectedIds.size}<ChevronDown className="w-3 h-3"/>
              </button>
              <AnimatePresence>
                {bulkOpen&&(
                  <motion.div className="absolute left-0 top-full mt-1 z-50"
                    initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}>
                    <StatusDropdown current={null} onSelect={bulkUpdate} isDark={isDark}/>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <button onClick={()=>setShowAssign(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border hover:opacity-80"
            style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.muted:'#374151'}}>
            <Plus className="w-3.5 h-3.5"/>Add Clients
          </button>
          <button onClick={()=>setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold border hover:opacity-80"
            style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.muted:'#374151'}}>
            <Upload className="w-3.5 h-3.5"/>Import Excel
          </button>
          <button onClick={()=>setRefreshKey(k=>k+1)} className="p-1.5 rounded-lg hover:opacity-70" style={{color:isDark?D.dimmer:'#94a3b8'}}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`}/>
          </button>
          <span className="ml-auto text-xs font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{items.length} of {total} records</span>
        </div>

        {/* Status sub-tabs */}
        <div className="flex border-b overflow-x-auto flex-shrink-0" style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',scrollbarWidth:'none'}}>
          {STATUS_TABS.map(({key,label,count})=>(
            <button key={key} onClick={()=>{setStatusFilter(key);setSelectedIds(new Set());}}
              className="flex-shrink-0 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5"
              style={{borderColor:statusFilter===key?catCfg.color:'transparent',color:statusFilter===key?catCfg.color:isDark?D.dimmer:'#64748b'}}>
              {label}
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{backgroundColor:statusFilter===key?catCfg.bg:isDark?D.raised:'#f1f5f9',color:statusFilter===key?catCfg.color:isDark?D.dimmer:'#94a3b8'}}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto" style={{scrollbarWidth:'thin'}}>
          <div className="sticky top-0 z-10 grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
            style={{gridTemplateColumns:'36px 48px 1fr 148px 160px 180px 100px 40px',backgroundColor:isDark?D.raised:'#f8fafc',color:isDark?D.dimmer:'#94a3b8',borderColor:isDark?D.border:'#e2e8f0'}}>
            <div className="flex items-center justify-center">
              <button onClick={()=>allSelected?setSelectedIds(new Set()):setSelectedIds(new Set(items.map(a=>a.id)))}
                className="w-4 h-4 rounded border-2 flex items-center justify-center"
                style={{borderColor:someSelected?'#3B82F6':isDark?D.border:'#d1d5db',backgroundColor:allSelected?'#3B82F6':'transparent'}}>
                {allSelected?<span className="text-white text-[9px]">✓</span>:someSelected?<span style={{color:'#3B82F6',fontSize:8}}>—</span>:null}
              </button>
            </div>
            <div className="text-center">#</div>
            <div>Client Name</div>
            <div>Status</div>
            <div>Assigned To</div>
            <div>Notes</div>
            <div>Updated</div>
            <div/>
          </div>

          {loading?(
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-blue-500 animate-spin"/></div>
          ):items.length===0?(
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FolderOpen className="w-10 h-10" style={{color:isDark?D.border:'#d1d5db'}}/>
              <p className="text-sm font-semibold" style={{color:isDark?D.muted:'#64748b'}}>
                {search||statusFilter!=='all'?'No matching clients':'No clients assigned yet'}
              </p>
              {!search&&statusFilter==='all'&&(
                <button onClick={()=>setShowAssign(true)} className="text-sm font-semibold text-blue-500 hover:text-blue-400">+ Assign clients now</button>
              )}
            </div>
          ):(
            <div className="divide-y" style={{borderColor:isDark?D.border:'#f1f5f9'}}>
              {items.map((a,idx)=>{
                const isSel=selectedIds.has(a.id);
                const isEditNote=editingNote?.id===a.id;
                return(
                  <motion.div key={a.id}
                    className="group grid px-4 py-2.5 items-center gap-2 transition-colors"
                    style={{gridTemplateColumns:'36px 48px 1fr 148px 160px 180px 100px 40px',backgroundColor:isSel?(isDark?'rgba(59,130,246,0.06)':'#eff6ff'):'transparent'}}
                    whileHover={{backgroundColor:isDark?'rgba(255,255,255,0.03)':'#fafafa'}}>
                    <div className="flex items-center justify-center">
                      <button onClick={()=>setSelectedIds(prev=>{const s=new Set(prev);isSel?s.delete(a.id):s.add(a.id);return s;})}
                        className="w-4 h-4 rounded border-2 flex items-center justify-center"
                        style={{borderColor:isSel?'#3B82F6':isDark?D.border:'#d1d5db',backgroundColor:isSel?'#3B82F6':'transparent'}}>
                        {isSel&&<span className="text-white text-[9px]">✓</span>}
                      </button>
                    </div>
                    <div className="text-center">
                      <span className="text-[11px] font-bold tabular-nums" style={{color:isDark?D.dimmer:'#94a3b8'}}>{idx+1}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{color:isDark?D.text:'#0f172a'}}>{a.client_name}</p>
                    </div>
                    <div className="relative flex-shrink-0" onClick={e=>e.stopPropagation()}>
                      <StatusPill status={a.status} size="xs" onClick={()=>setOpenDropdown(d=>d===a.id?null:a.id)}/>
                      <AnimatePresence>
                        {openDropdown===a.id&&(
                          <motion.div className="absolute left-0 top-full mt-1 z-50"
                            initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}>
                            <StatusDropdown current={a.status} onSelect={s=>updateStatus(a.id,s)} isDark={isDark}/>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="min-w-0 flex-shrink-0">
                      <p className="text-xs truncate" style={{color:isDark?D.muted:'#64748b'}}>{a.assigned_to_name||userMap[a.assigned_to]||'—'}</p>
                    </div>
                    <div className="min-w-0 flex-shrink-0" onClick={e=>e.stopPropagation()}>
                      {isEditNote?(
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editingNote.value} onChange={e=>setEditingNote(n=>({...n,value:e.target.value}))}
                            onKeyDown={e=>{if(e.key==='Enter')saveNote(a.id,editingNote.value);if(e.key==='Escape')setEditingNote(null);}}
                            className="flex-1 px-2 py-0.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            style={{backgroundColor:isDark?D.raised:'#fff',borderColor:isDark?D.border:'#d1d5db',color:isDark?D.text:'#1e293b'}} placeholder="Add note…"/>
                          <button onClick={()=>saveNote(a.id,editingNote.value)} className="text-emerald-500"><CheckCircle2 className="w-3.5 h-3.5"/></button>
                          <button onClick={()=>setEditingNote(null)} className="text-red-400"><X className="w-3 h-3"/></button>
                        </div>
                      ):(
                        <button onClick={()=>setEditingNote({id:a.id,value:a.notes||''})}
                          className="w-full text-left text-xs truncate hover:opacity-70 transition-opacity flex items-center gap-1 group/note"
                          style={{color:a.notes?(isDark?D.muted:'#64748b'):(isDark?D.dimmer:'#cbd5e1')}}>
                          <StickyNote className="w-3 h-3 opacity-0 group-hover/note:opacity-60 flex-shrink-0"/>
                          {a.notes||<span className="italic">add note</span>}
                        </button>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <p className="text-[11px] tabular-nums" style={{color:isDark?D.dimmer:'#94a3b8'}}>{timeAgo(a.updated_at)}</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center justify-end">
                      <button onClick={()=>deleteAssignment(a.id)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-100"
                        style={{color:'#ef4444'}}>
                        <X className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t flex items-center justify-between flex-wrap gap-2 flex-shrink-0"
          style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff'}}>
          <p className="text-xs font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>
            {items.length} of {total} records{selectedIds.size>0?` · ${selectedIds.size} selected`:''}
          </p>
          <div className="flex items-center gap-4">
            {['not_started','in_progress','completed','filed'].map(k=>(
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{backgroundColor:STATUS_CFG[k]?.dot}}/>
                <span className="text-[11px] font-bold tabular-nums" style={{color:STATUS_CFG[k]?.color}}>{stats[k]||0}</span>
                <span className="text-[10px]" style={{color:isDark?D.dimmer:'#94a3b8'}}>{STATUS_CFG[k]?.label}</span>
              </div>
            ))}
          </div>
        </div>
      </>)}

      {/* ─── MONTHLY TRACKER TAB ─────────────────────────────────────────── */}
      {activeTab==='monthly'&&(
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4" style={{scrollbarWidth:'thin'}}>
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-black" style={{color:isDark?D.text:'#0f172a'}}>
                {periodConfig.label} Compliance Tracker
              </h2>
              <p className="text-xs mt-0.5" style={{color:isDark?D.muted:'#64748b'}}>
                {monthlySummary.total_clients||0} clients · click any period cell to cycle status
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setMonthlyViewYear(y=>y-1)} className="w-8 h-8 rounded-xl border flex items-center justify-center hover:opacity-70"
                style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff',color:isDark?D.muted:'#64748b'}}>
                <ChevronLeft className="w-4 h-4"/>
              </button>
              <span className="text-sm font-black px-3 py-1.5 rounded-xl border"
                style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff',color:isDark?D.text:'#0f172a'}}>{monthlyViewYear}</span>
              <button onClick={()=>setMonthlyViewYear(y=>y+1)} className="w-8 h-8 rounded-xl border flex items-center justify-center hover:opacity-70"
                style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff',color:isDark?D.muted:'#64748b'}}>
                <ChevronRight className="w-4 h-4"/>
              </button>
              <button onClick={fetchMonthlySummary} className="p-2 rounded-xl border hover:opacity-70"
                style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff',color:isDark?D.muted:'#64748b'}}>
                <RefreshCw className={`w-3.5 h-3.5 ${monthlyLoading?'animate-spin':''}`}/>
              </button>
            </div>
          </div>

          {monthlyLoading?(
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-blue-500 animate-spin"/></div>
          ):(
            <>
              {/* Period summary cards — grid adapts to frequency */}
              <div className={`grid gap-3 ${
                periodConfig.type==='annual'||periodConfig.type==='one_time'?'grid-cols-1 max-w-xs':
                periodConfig.type==='half_yearly'?'grid-cols-2 max-w-md':
                periodConfig.type==='quarterly'?'grid-cols-2 sm:grid-cols-4':
                'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
              }`}>
                {monthlyRows.map(({key,label,sublabel,isCurrent,data})=>{
                  const total=data?.total||0;
                  const done=(data?.completed||0)+(data?.filed||0);
                  const pct=total?Math.round(done/total*100):0;
                  return(
                    <div key={key} className="rounded-2xl border p-4 transition-all hover:shadow-md"
                      style={{
                        backgroundColor:isDark?D.card:'#fff',
                        borderColor:isCurrent?catCfg.color:(isDark?D.border:'#e2e8f0'),
                        borderWidth:isCurrent?2:1,
                      }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black" style={{color:isDark?D.text:'#0f172a'}}>{label}</span>
                        {isCurrent&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{backgroundColor:catCfg.bg,color:catCfg.color}}>NOW</span>}
                      </div>
                      {sublabel&&<p className="text-[10px] mb-2" style={{color:isDark?D.dimmer:'#94a3b8'}}>{sublabel}</p>}
                      {total>0?(
                        <>
                          <ProgressBar pct={pct} color={catCfg.color} isDark={isDark}/>
                          <div className="flex justify-between items-center mt-1.5">
                            <span className="text-xs font-black" style={{color:catCfg.color}}>{pct}%</span>
                            <span className="text-[10px]" style={{color:isDark?D.dimmer:'#94a3b8'}}>{done}/{total}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {[['completed','C'],['filed','F'],['in_progress','WIP'],['not_started','NS']].map(([k,abbr])=>
                              (data?.[k]||0)>0?<span key={k} className="text-[9px] font-bold px-1 py-0.5 rounded"
                                style={{backgroundColor:STATUS_CFG[k]?.bg,color:STATUS_CFG[k]?.color}}>{data[k]} {abbr}</span>:null
                            )}
                          </div>
                        </>
                      ):(
                        <div className="text-center py-3">
                          <span className="text-[10px]" style={{color:isDark?D.border:'#c8d3e0'}}>No data yet</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-client period table */}
              {items.length>0&&(
                <div className="rounded-2xl border overflow-hidden" style={{borderColor:isDark?D.border:'#e2e8f0'}}>
                  <div className="px-4 py-3 border-b flex items-center justify-between"
                    style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0'}}>
                    <p className="text-xs font-black uppercase tracking-wider" style={{color:isDark?D.muted:'#64748b'}}>
                      Per-Client {periodConfig.label} Status — {monthlyViewYear}
                    </p>
                    <span className="text-xs" style={{color:isDark?D.dimmer:'#94a3b8'}}>Click cell to cycle status</span>
                  </div>
                  <div className="overflow-x-auto" style={{scrollbarWidth:'thin'}}>
                    <table className="w-full text-xs border-collapse"
                      style={{minWidth:periodConfig.type==='monthly'?900:periodConfig.type==='quarterly'?500:periodConfig.type==='half_yearly'?400:300}}>
                      <thead>
                        <tr style={{backgroundColor:isDark?D.raised:'#f8fafc',borderBottom:`1px solid ${isDark?D.border:'#e2e8f0'}`}}>
                          <th className="px-4 py-2 text-left font-bold sticky left-0 z-10"
                            style={{color:isDark?D.dimmer:'#94a3b8',backgroundColor:isDark?D.raised:'#f8fafc',minWidth:180}}>Client</th>
                          {periodConfig.periods.map(p=>(
                            <th key={p.key} className="px-2 py-2 text-center font-bold"
                              style={{color:p.isCurrent?catCfg.color:(isDark?D.dimmer:'#94a3b8'),
                                minWidth:periodConfig.type==='monthly'?56:80}}>
                              {p.label}
                              {p.sublabel&&<div className="text-[9px] font-normal opacity-70">{p.sublabel}</div>}
                              {p.isCurrent&&<span className="ml-0.5 text-[8px]" style={{color:catCfg.color}}>●</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice(0,50).map((a,ri)=>(
                          <tr key={a.id} style={{borderBottom:`1px solid ${isDark?'rgba(255,255,255,0.04)':'#f1f5f9'}`,
                            backgroundColor:ri%2===0?'transparent':(isDark?'rgba(255,255,255,0.01)':'rgba(0,0,0,0.01)')}}>
                            <td className="px-4 py-2 font-semibold sticky left-0 z-10 truncate max-w-[180px]"
                              style={{color:isDark?D.text:'#0f172a',backgroundColor:isDark?D.card:'#fff'}}>{a.client_name}</td>
                            {periodConfig.periods.map(p=>{
                              const st=(a.monthly_statuses||{})[p.key]||'not_started';
                              const cfg=STATUS_CFG[st]||STATUS_CFG.not_started;
                              const CYCLE=['not_started','in_progress','completed','filed','na'];
                              const nextSt=CYCLE[(CYCLE.indexOf(st)+1)%CYCLE.length];
                              return(
                                <td key={p.key} className="px-1 py-1 text-center">
                                  <button
                                    onClick={()=>updateMonthlyStatus(a.id,p.key,nextSt)}
                                    className="w-full py-1 px-1 rounded-lg text-[10px] font-bold transition-all hover:opacity-80 active:scale-95"
                                    style={{backgroundColor:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`}}
                                    title={`${a.client_name} · ${p.label} · ${cfg.label} → click to change`}>
                                    {st==='not_started'?'—':st==='in_progress'?'WIP':st==='completed'?'✓':st==='filed'?'F':'N/A'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {items.length>50&&<p className="text-center text-xs py-2" style={{color:isDark?D.dimmer:'#94a3b8'}}>Showing first 50 clients</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ─── COMMENTS TAB ────────────────────────────────────────────────── */}
      {activeTab==='comments'&&(
        <div className="flex-1 overflow-auto flex flex-col" style={{scrollbarWidth:'thin'}}>
          {/* Add comment bar */}
          <div className="px-5 py-4 border-b flex-shrink-0" style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-black"
                style={{backgroundColor:catCfg.color}}>
                {(user?.full_name||'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 space-y-2">
                {/* Client filter for comment */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#64748b'}}>Comment for:</span>
                  <select value={commentClient} onChange={e=>setCommentClient(e.target.value)}
                    className="text-xs px-2 py-1 border rounded-lg focus:outline-none"
                    style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.text:'#1e293b'}}>
                    <option value="all">All clients (general)</option>
                    {items.map(a=><option key={a.id} value={a.client_id}>{a.client_name}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <textarea value={commentText} onChange={e=>setCommentText(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))addComment();}}
                    placeholder="Add a comment, note, or reason for delay… (Ctrl+Enter to submit)"
                    rows={2}
                    className="flex-1 px-3 py-2 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.text:'#1e293b'}}/>
                  <button onClick={addComment} disabled={sendingComment||!commentText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 flex-shrink-0"
                    style={{backgroundColor:catCfg.color}}>
                    {sendingComment?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Client filter for viewing comments */}
          <div className="px-5 py-2 border-b flex items-center gap-2 flex-shrink-0"
            style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0'}}>
            <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#64748b'}}>Filter:</span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={()=>setCommentClient('all')}
                className="text-xs px-2.5 py-1 rounded-lg font-semibold border transition-all"
                style={{backgroundColor:commentClient==='all'?catCfg.bg:(isDark?D.card:'#fff'),borderColor:commentClient==='all'?catCfg.color:(isDark?D.border:'#e2e8f0'),color:commentClient==='all'?catCfg.color:(isDark?D.dimmer:'#94a3b8')}}>
                All
              </button>
              {items.slice(0,12).map(a=>(
                <button key={a.id} onClick={()=>setCommentClient(a.client_id)}
                  className="text-xs px-2.5 py-1 rounded-lg font-semibold border transition-all"
                  style={{backgroundColor:commentClient===a.client_id?catCfg.bg:(isDark?D.card:'#fff'),borderColor:commentClient===a.client_id?catCfg.color:(isDark?D.border:'#e2e8f0'),color:commentClient===a.client_id?catCfg.color:(isDark?D.dimmer:'#64748b')}}>
                  {a.client_name}
                </button>
              ))}
            </div>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-auto p-5 space-y-3" style={{scrollbarWidth:'thin'}}>
            {commentsLoading?(
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-blue-500 animate-spin"/></div>
            ):comments.length===0?(
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <MessageSquare className="w-10 h-10" style={{color:isDark?D.border:'#d1d5db'}}/>
                <p className="text-sm font-semibold" style={{color:isDark?D.muted:'#64748b'}}>No comments yet</p>
                <p className="text-xs" style={{color:isDark?D.dimmer:'#94a3b8'}}>Add the first comment or reason for delay above</p>
              </div>
            ):(
              comments.map(c=>(
                <motion.div key={c.id} layout initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                  className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-black"
                    style={{backgroundColor:catCfg.color}}>
                    {(c.author_name||'U')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 rounded-2xl p-3 border"
                    style={{backgroundColor:isDark?D.raised:'#f8fafc',borderColor:isDark?D.border:'#e2e8f0'}}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black" style={{color:isDark?D.text:'#0f172a'}}>{c.author_name}</span>
                        {c.client_name&&(
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{backgroundColor:catCfg.bg,color:catCfg.color}}>
                            {c.client_name}
                          </span>
                        )}
                        <span className="text-[10px]" style={{color:isDark?D.dimmer:'#94a3b8'}}>{timeAgo(c.created_at)}</span>
                      </div>
                      <button onClick={()=>deleteComment(c.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:bg-red-100 flex-shrink-0"
                        style={{color:'#ef4444'}}>
                        <X className="w-3 h-3"/>
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{color:isDark?D.muted:'#374151'}}>{c.text}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showImport&&<ImportExcelModal complianceId={compliance.id} complianceName={compliance.name} compliance={compliance} allUsers={allUsers} isDark={isDark} onClose={()=>setShowImport(false)} onImported={()=>{setRefreshKey(k=>k+1);setShowImport(false);}}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showAssign&&<AssignClientsModal compliance={compliance} isDark={isDark} allUsers={allUsers} onClose={()=>setShowAssign(false)} onAssigned={()=>{setRefreshKey(k=>k+1);setShowAssign(false);}}/>}
      </AnimatePresence>
    </motion.div>
  );
}

function ComplianceCard({item,onClick,onEdit,onDelete,isDark,viewMode='board'}){
  const cfg=CATEGORY_CFG[item.category]||CATEGORY_CFG.OTHER;
  const stats=item._stats||{};
  const freqLabel=FREQUENCIES.find(f=>f.value===item.frequency)?.label||item.frequency;
  const overdue=item.due_date&&isPast(safeDate(item.due_date))&&(stats.done||0)<(stats.total||0);
  const dueLabel=item.period_label||(item.due_date?`Due ${fmtDate(item.due_date)}`:null);

  // ── LIST ROW ──────────────────────────────────────────────────────────────
  if(viewMode==='list'){
    return(
      <motion.div variants={itemVariants}
        className="grid items-center px-4 py-3 gap-3 cursor-pointer border-b group transition-colors"
        style={{
          gridTemplateColumns:'4px 1fr 110px 100px 130px 100px 80px 72px',
          backgroundColor:'transparent',
          borderColor:isDark?D.border:'#f1f5f9',
        }}
        whileHover={{backgroundColor:isDark?'rgba(255,255,255,0.025)':'#f8fafc'}}
        onClick={onClick}>
        {/* category stripe */}
        <div className="h-8 rounded-full" style={{backgroundColor:cfg.color,width:4,minWidth:4}}/>
        {/* Name */}
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{color:isDark?D.text:'#0f172a'}}>{item.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{backgroundColor:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`}}>{cfg.label}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{backgroundColor:isDark?D.raised:'#f1f5f9',color:isDark?D.dimmer:'#64748b'}}>{freqLabel}</span>
          </div>
        </div>
        {/* FY */}
        <div className="flex-shrink-0">
          {item.fy_year?<span className="text-xs font-semibold" style={{color:'#1F6FB2'}}>FY {item.fy_year}</span>:<span style={{color:isDark?D.border:'#e2e8f0'}}>—</span>}
        </div>
        {/* Due date */}
        <div className="flex-shrink-0">
          {dueLabel
            ?<span className={`text-xs font-semibold ${overdue?'text-red-500':''}`}
               style={{color:overdue?'#ef4444':isDark?D.muted:'#64748b'}}>{dueLabel}</span>
            :<span style={{color:isDark?D.border:'#e2e8f0'}}>—</span>}
        </div>
        {/* Progress */}
        <div className="flex-shrink-0">
          <ProgressBar pct={stats.pct||0} color={cfg.color} isDark={isDark}/>
          <p className="text-[10px] mt-0.5 text-right font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{stats.done||0}/{stats.total||0}</p>
        </div>
        {/* Pct */}
        <div className="flex-shrink-0">
          <span className="text-sm font-black tabular-nums" style={{color:cfg.color}}>{stats.pct||0}%</span>
        </div>
        {/* Clients */}
        <div className="flex-shrink-0">
          <span className="text-xs font-semibold" style={{color:isDark?D.muted:'#64748b'}}>{stats.total||0} clients</span>
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
          <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-100 opacity-60"
            style={{backgroundColor:isDark?D.raised:'#f1f5f9'}}><Edit2 className="w-3.5 h-3.5" style={{color:isDark?D.muted:'#64748b'}}/></button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-100 opacity-60"
            style={{backgroundColor:isDark?D.raised:'#f1f5f9'}}><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>
        </div>
      </motion.div>
    );
  }

  // ── BOARD CARD (uniform height via flex-col) ─────────────────────────────
  return(
    <motion.div variants={itemVariants} whileHover={{y:-3,transition:{duration:0.18}}} whileTap={{scale:0.985}} className="group h-full">
      <div className="rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg h-full flex flex-col"
        style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',borderLeft:`4px solid ${cfg.color}`}} onClick={onClick}>
        <div className="p-4 flex-1 flex flex-col">
          {/* Tags row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest flex-shrink-0"
                style={{backgroundColor:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`}}>{cfg.label}</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{backgroundColor:isDark?D.raised:'#f1f5f9',color:isDark?D.dimmer:'#64748b'}}>{freqLabel}</span>
              {item.fy_year&&<span className="text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{backgroundColor:isDark?'rgba(31,111,178,0.12)':'#eff6ff',color:'#1F6FB2'}}>FY {item.fy_year}</span>}
              {overdue&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded text-red-500 flex-shrink-0"
                style={{backgroundColor:'rgba(239,68,68,0.12)'}}>OVERDUE</span>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e=>e.stopPropagation()}>
              <button onClick={onEdit} className="w-6 h-6 rounded-lg flex items-center justify-center hover:opacity-100 opacity-60"
                style={{backgroundColor:isDark?D.raised:'#f8fafc'}}><Edit2 className="w-3 h-3" style={{color:isDark?D.muted:'#64748b'}}/></button>
              <button onClick={onDelete} className="w-6 h-6 rounded-lg flex items-center justify-center hover:opacity-100 opacity-60"
                style={{backgroundColor:isDark?D.raised:'#f8fafc'}}><Trash2 className="w-3 h-3 text-red-400"/></button>
            </div>
          </div>

          <h3 className="text-sm font-bold leading-snug mb-0.5" style={{color:isDark?D.text:'#0f172a'}}>{item.name}</h3>
          {/* Fixed height due date line to keep all cards aligned */}
          <div className="h-5 mb-3">
            {dueLabel&&<p className="text-[11px] flex items-center gap-1" style={{color:overdue?'#ef4444':isDark?D.dimmer:'#94a3b8'}}>
              <Calendar className="w-3 h-3 flex-shrink-0"/>{dueLabel}</p>}
          </div>

          {/* Push stats to bottom */}
          <div className="mt-auto">
            <div className="mb-1.5"><ProgressBar pct={stats.pct||0} color={cfg.color} isDark={isDark}/></div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black" style={{color:cfg.color}}>{stats.pct||0}%</span>
              <span className="text-[11px]" style={{color:isDark?D.dimmer:'#94a3b8'}}>{stats.done||0} / {stats.total||0}</span>
            </div>

            {/* Status bar */}
            <div className="flex h-1 rounded-full overflow-hidden gap-px mb-3">
              {[['filed'],['completed'],['in_progress'],['not_started']].map(([k])=>
                (stats[k]||0)>0?<div key={k} style={{width:`${(stats[k]||0)/(stats.total||1)*100}%`,backgroundColor:STATUS_CFG[k]?.dot,opacity:0.8}}/>:null
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[['not_started','pending'],['in_progress','WIP'],['completed','done'],['filed','filed']].map(([k,abbr])=>
                (stats[k]||0)>0?<span key={k} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{backgroundColor:STATUS_CFG[k]?.bg,color:STATUS_CFG[k]?.color}}>{stats[k]} {abbr}</span>:null
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-2 border-t flex items-center justify-between flex-shrink-0"
          style={{borderColor:isDark?D.border:'#f9fafb',backgroundColor:isDark?'rgba(255,255,255,0.02)':'#fafafa'}}>
          <span className="text-[10px] font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{stats.total||0} clients</span>
          <div className="flex items-center gap-1 text-[10px] font-bold" style={{color:cfg.color}}>Open<ChevronRight className="w-3 h-3"/></div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function CompliancePage(){
  const isDark=useDark();
  const{user}=useAuth();
  const[compliance,setCompliance]=useState([]);
  const[dashboard,setDashboard]=useState(null);
  const[loading,setLoading]=useState(true);
  const[allUsers,setAllUsers]=useState([]);
  const[catFilter,setCatFilter]=useState('all');
  const[fyFilter,setFyFilter]=useState('all');
  const[searchQ,setSearchQ]=useState('');
  const[showAddModal,setShowAddModal]=useState(false);
  const[editingItem,setEditingItem]=useState(null);
  const[detailItem,setDetailItem]=useState(null);
  const[refreshKey,setRefreshKey]=useState(0);
  const[viewMode,setViewMode]=useState('board'); // 'board' | 'list'

  const fetchAll=useCallback(async()=>{
    setLoading(true);
    try{
      const params=new URLSearchParams();
      if(catFilter!=='all')params.set('category',catFilter);
      if(fyFilter!=='all')params.set('fy_year',fyFilter);
      const[listRes,dashRes,usersRes]=await Promise.all([
        api.get(`/compliance/?${params}`),
        api.get('/compliance/dashboard/summary'),
        api.get('/users').catch(()=>({data:[]})),
      ]);
      setCompliance(Array.isArray(listRes.data)?listRes.data:[]);
      setDashboard(dashRes.data||null);
      setAllUsers(Array.isArray(usersRes.data)?usersRes.data:[]);
    }catch{toast.error('Failed to load compliance data');}
    finally{setLoading(false);}
  },[catFilter,fyFilter,refreshKey]);

  useEffect(()=>{fetchAll();},[fetchAll]);

  const handleDelete=async(id,name)=>{
    if(!confirm(`Delete "${name}" and all assignments?`))return;
    try{await api.delete(`/compliance/${id}`);toast.success('Deleted');setRefreshKey(k=>k+1);}
    catch{toast.error('Delete failed');}
  };

  const filtered=useMemo(()=>{
    if(!searchQ.trim())return compliance;
    const q=searchQ.toLowerCase();
    return compliance.filter(c=>c.name.toLowerCase().includes(q)||(CATEGORY_CFG[c.category]?.label||'').toLowerCase().includes(q));
  },[compliance,searchQ]);

  const fyYears=useMemo(()=>[...new Set(compliance.map(c=>c.fy_year).filter(Boolean))],[compliance]);

  // Full page detail view
  if(detailItem){
    return(
      <AnimatePresence mode="wait">
        <ComplianceDetailPage key={detailItem.id} compliance={detailItem} isDark={isDark} allUsers={allUsers}
          onBack={()=>{setDetailItem(null);setRefreshKey(k=>k+1);}}/>
      </AnimatePresence>
    );
  }

  return(
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8" style={{background:isDark?D.bg:'#f8fafc'}}>
      <motion.div className="max-w-[1600px] mx-auto space-y-6" variants={containerVariants} initial="hidden" animate="visible">

        <motion.div variants={itemVariants}>
          <div className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{background:'linear-gradient(135deg,#0D3B66 0%,#1F6FB2 100%)',boxShadow:'0 8px 32px rgba(13,59,102,0.25)'}}>
            <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10" style={{background:'radial-gradient(circle,white 0%,transparent 70%)'}}/>
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Compliance Management</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">Universal Compliance Tracker</h1>
                <p className="text-white/60 text-sm mt-1">Track ROC, GST, ITR, TDS filings across all clients in real time</p>
              </div>
              <button onClick={()=>setShowAddModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white border border-white/30 hover:bg-white/15 transition-all self-start md:self-auto">
                <Plus className="w-4 h-4"/>Add Compliance
              </button>
            </div>
          </div>
        </motion.div>

        {dashboard&&(
          <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {icon:BookOpen,     label:'Compliance Types',   value:dashboard.total_compliance_types, unit:'defined',color:'#1F6FB2'},
              {icon:Users,        label:'Client Assignments', value:dashboard.total_assignments,      unit:'total records',color:'#8B5CF6'},
              {icon:CheckCircle2, label:'Completed / Filed',  value:dashboard.completed_or_filed,     unit:`${dashboard.overall_pct}% done`,color:'#1FAF5A'},
              {icon:AlertTriangle,label:'Pending',            value:dashboard.pending,unit:`${dashboard.overdue>0?dashboard.overdue+' overdue':'none overdue'}`,color:dashboard.overdue>0?'#EF4444':'#F59E0B'},
            ].map(({icon:Icon,label,value,unit,color})=>(
              <div key={label} className="rounded-2xl border p-4 hover:shadow-md transition-all"
                style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color:isDark?D.dimmer:'#94a3b8'}}>{label}</p>
                    <p className="text-2xl font-black" style={{color}}>{value??'—'}</p>
                    <p className="text-[11px] mt-0.5" style={{color:isDark?D.dimmer:'#94a3b8'}}>{unit}</p>
                  </div>
                  <div className="p-2 rounded-xl" style={{backgroundColor:`${color}15`}}><Icon className="w-4 h-4" style={{color}}/></div>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{color:isDark?D.dimmer:'#94a3b8'}}/>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search compliance…"
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.text:'#1e293b'}}/>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['all',...CATEGORIES].map(cat=>{
              const cfg=cat==='all'?null:CATEGORY_CFG[cat];const active=catFilter===cat;
              return(<button key={cat} onClick={()=>setCatFilter(cat)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                style={{backgroundColor:active?(cfg?.bg||(isDark?D.raised:'#f1f5f9')):(isDark?D.card:'#fff'),borderColor:active?(cfg?.color||'#1F6FB2'):(isDark?D.border:'#e2e8f0'),color:active?(cfg?.color||'#1F6FB2'):(isDark?D.muted:'#64748b')}}>
                {cat==='all'?'All':(cfg?.label||cat)}
              </button>);
            })}
          </div>
          {fyYears.length>0&&(
            <select value={fyFilter} onChange={e=>setFyFilter(e.target.value)}
              className="px-3 py-2 border rounded-xl text-sm focus:outline-none"
              style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.text:'#1e293b'}}>
              <option value="all">All FY</option>
              {fyYears.map(y=><option key={y} value={y}>FY {y}</option>)}
            </select>
          )}
          <button onClick={()=>setRefreshKey(k=>k+1)} className="p-2 rounded-xl border hover:opacity-80"
            style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0',color:isDark?D.muted:'#64748b'}}>
            <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>
          </button>
          {/* View toggle */}
          <div className="flex items-center border rounded-xl overflow-hidden flex-shrink-0"
            style={{borderColor:isDark?D.border:'#e2e8f0',backgroundColor:isDark?D.card:'#fff'}}>
            <button onClick={()=>setViewMode('board')} title="Board View"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all"
              style={{backgroundColor:viewMode==='board'?(isDark?D.raised:'#f1f5f9'):'transparent',
                color:viewMode==='board'?'#1F6FB2':(isDark?D.dimmer:'#94a3b8')}}>
              <LayoutGrid className="w-3.5 h-3.5"/><span className="hidden sm:inline">Board</span>
            </button>
            <button onClick={()=>setViewMode('list')} title="List View"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all"
              style={{backgroundColor:viewMode==='list'?(isDark?D.raised:'#f1f5f9'):'transparent',
                color:viewMode==='list'?'#1F6FB2':(isDark?D.dimmer:'#94a3b8')}}>
              <List className="w-3.5 h-3.5"/><span className="hidden sm:inline">List</span>
            </button>
          </div>
          {filtered.length>0&&<span className="text-xs font-semibold" style={{color:isDark?D.dimmer:'#94a3b8'}}>{filtered.length} types</span>}
        </motion.div>

        {loading?(
          <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 text-blue-500 animate-spin"/></div>
        ):filtered.length===0?(
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border"
            style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{backgroundColor:isDark?D.raised:'#f1f5f9'}}>
              <ShieldCheck className="w-8 h-8" style={{color:isDark?D.dimmer:'#cbd5e1'}}/>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{color:isDark?D.text:'#0f172a'}}>{searchQ||catFilter!=='all'?'No matching compliance':'No compliance defined yet'}</p>
              <p className="text-sm mt-1" style={{color:isDark?D.muted:'#64748b'}}>{searchQ||catFilter!=='all'?'Adjust filters':'Add a compliance type to start tracking'}</p>
            </div>
            {!searchQ&&catFilter==='all'&&(
              <button onClick={()=>setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{backgroundColor:'#1F6FB2'}}>
                <Plus className="w-4 h-4"/>Add First Compliance
              </button>
            )}
          </motion.div>
        ):viewMode==='list'?(
          <motion.div className="rounded-2xl border overflow-hidden" variants={containerVariants}
            style={{backgroundColor:isDark?D.card:'#fff',borderColor:isDark?D.border:'#e2e8f0'}}>
            {/* List header */}
            <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
              style={{gridTemplateColumns:'4px 1fr 110px 100px 130px 100px 80px 72px',
                backgroundColor:isDark?D.raised:'#f8fafc',color:isDark?D.dimmer:'#94a3b8',borderColor:isDark?D.border:'#e2e8f0'}}>
              <div/><div>Compliance Name</div><div>FY Year</div><div>Due Date</div>
              <div>Progress</div><div>% Done</div><div>Clients</div><div>Actions</div>
            </div>
            {filtered.map(item=>(
              <ComplianceCard key={item.id} item={item} isDark={isDark} viewMode="list"
                onClick={()=>setDetailItem(item)}
                onEdit={e=>{e&&e.stopPropagation();setEditingItem(item);}}
                onDelete={e=>{e&&e.stopPropagation();handleDelete(item.id,item.name);}}/>
            ))}
          </motion.div>
        ):(
          <motion.div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch" variants={containerVariants}>
            {filtered.map(item=>(
              <ComplianceCard key={item.id} item={item} isDark={isDark} viewMode="board"
                onClick={()=>setDetailItem(item)}
                onEdit={e=>{e&&e.stopPropagation();setEditingItem(item);}}
                onDelete={e=>{e&&e.stopPropagation();handleDelete(item.id,item.name);}}/>
            ))}
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {(showAddModal||editingItem)&&(
          <ComplianceFormModal isDark={isDark} existing={editingItem||undefined}
            onClose={()=>{setShowAddModal(false);setEditingItem(null);}}
            onSave={()=>{setShowAddModal(false);setEditingItem(null);setRefreshKey(k=>k+1);}}/>
        )}
      </AnimatePresence>
    </div>
  );
}
