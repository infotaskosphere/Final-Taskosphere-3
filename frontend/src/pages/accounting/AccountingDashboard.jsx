import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, BookOpen, Upload, FileText,
  BarChart3, PieChart, Scale, ChevronRight, AlertCircle, Zap,
  IndianRupee, Layers, BookMarked, Receipt, Activity, Building2,
  RefreshCw, Clock, CheckCircle, CreditCard, AlertTriangle,
  ExternalLink, ChevronDown, ChevronUp, FileCheck,
} from 'lucide-react';

const COLORS = {
  deepBlue:'#0D3B66', mediumBlue:'#1F6FB2',
  emerald:'#1FAF5A',  amber:'#F59E0B',
  coral:'#EF4444',    purple:'#7C3AED',
  teal:'#0D9488',
};
const card  = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";
const fmt   = (n) => new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(Math.abs(n)||0);
const fmtRs = (n) => `₹${fmt(n)}`;
const fmtD  = (n) => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Math.abs(n)||0);

const STATUS_COLORS = {
  paid:      {bg:'#dcfce7',text:'#16a34a',label:'Paid'},
  draft:     {bg:'#f1f5f9',text:'#64748b',label:'Draft'},
  sent:      {bg:'#dbeafe',text:'#2563eb',label:'Sent'},
  overdue:   {bg:'#fee2e2',text:'#dc2626',label:'Overdue'},
  cancelled: {bg:'#f3f4f6',text:'#9ca3af',label:'Cancelled'},
};
const FY_OPTIONS = [
  {label:'2025-26',from:'2025-04-01',to:'2026-03-31'},
  {label:'2024-25',from:'2024-04-01',to:'2025-03-31'},
  {label:'2023-24',from:'2023-04-01',to:'2024-03-31'},
];

function Badge({status}) {
  const s = STATUS_COLORS[status]||STATUS_COLORS.draft;
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{background:s.bg,color:s.text}}>{s.label}</span>;
}

function SecHead({title,count,color,expanded,onToggle}) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-gray-800 dark:text-white">{title}</span>
        {count!=null && <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{background:color}}>{count}</span>}
      </div>
      {expanded ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
    </button>
  );
}

function Collapse({open,children}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}}
                    exit={{height:0,opacity:0}} transition={{duration:0.2}} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AccountingDashboard() {
  const dark = useDark();
  const nav  = useNavigate();

  const [summary,    setSummary]    = useState(null);
  const [accLoading, setAccLoading] = useState(true);
  const [fy,         setFy]         = useState(FY_OPTIONS[0]);

  const [invStats,   setInvStats]   = useState(null);
  const [recentInv,  setRecentInv]  = useState([]);
  const [invLoading, setInvLoading] = useState(true);

  const [companies,  setCompanies]  = useState([]);
  const [coLoading,  setCoLoading]  = useState(true);

  const [open, setOpen] = useState({inv:true, recent:true, co:true, acc:true});
  const tog = k => setOpen(p=>({...p,[k]:!p[k]}));

  const fetchSummary = useCallback(async () => {
    setAccLoading(true);
    try {
      const r = await api.get(`/accounting/reports/summary?from_date=${fy.from}&to_date=${fy.to}`);
      setSummary(r.data);
    } catch(e) {
      if(e?.response?.status===422||e?.response?.status===500)
        setSummary({total_journal_entries:0,total_bank_statements:0,total_accounts:0,net_profit:0,total_income:0,total_expense:0,total_assets:0,total_liabilities:0});
      else toast.error('Failed to load accounting summary');
    } finally { setAccLoading(false); }
  },[fy]);

  const fetchInvoices = useCallback(async () => {
    setInvLoading(true);
    try {
      const [s,l] = await Promise.all([
        api.get('/invoices/stats'),
        api.get('/invoices?page=1&page_size=8'),
      ]);
      setInvStats(s.data);
      setRecentInv(l.data.invoices||[]);
    } catch { toast.error('Failed to load invoices'); }
    finally { setInvLoading(false); }
  },[]);

  const fetchCompanies = useCallback(async () => {
    setCoLoading(true);
    try {
      const r = await api.get('/companies');
      setCompanies(r.data||[]);
    } catch { toast.error('Failed to load companies'); }
    finally { setCoLoading(false); }
  },[]);

  useEffect(()=>{fetchSummary();},[fetchSummary]);
  useEffect(()=>{fetchInvoices();fetchCompanies();},[fetchInvoices,fetchCompanies]);

  const refreshAll = ()=>{fetchSummary();fetchInvoices();fetchCompanies();};
  const spinning   = accLoading||invLoading||coLoading;

  const accMetrics = summary ? [
    {icon:TrendingUp,  label:'Total Income',     value:fmtRs(summary.total_income),        color:COLORS.emerald,    path:'/accounting/pl'},
    {icon:TrendingDown,label:'Total Expenses',   value:fmtRs(summary.total_expense),       color:COLORS.coral,      path:'/accounting/pl'},
    {icon:Activity,    label:'Net Profit/Loss',  value:fmtRs(summary.net_profit),          color:summary.net_profit>=0?COLORS.emerald:COLORS.coral, path:'/accounting/pl'},
    {icon:Scale,       label:'Total Assets',     value:fmtRs(summary.total_assets),        color:COLORS.mediumBlue, path:'/accounting/balance-sheet'},
    {icon:Building2,   label:'Total Liabilities',value:fmtRs(summary.total_liabilities),   color:COLORS.amber,      path:'/accounting/balance-sheet'},
    {icon:BookOpen,    label:'Journal Entries',  value:summary.total_journal_entries,      color:COLORS.purple,     path:'/accounting/journal'},
    {icon:Upload,      label:'Bank Statements',  value:summary.total_bank_statements,      color:COLORS.teal,       path:'/accounting/bank-statements'},
    {icon:Layers,      label:'Accounts',         value:summary.total_accounts,             color:COLORS.deepBlue,   path:'/accounting/accounts'},
  ] : [];

  const quickActions = [
    {icon:Upload,     label:'Upload Bank Statement',desc:'Import SBI/HDFC/ICICI/Axis PDF or Excel',path:'/accounting/bank-statements',color:COLORS.mediumBlue},
    {icon:BookMarked, label:'Journal Entry',        desc:'Post manual double-entry',               path:'/accounting/journal',        color:COLORS.purple},
    {icon:Layers,     label:'Chart of Accounts',    desc:'Manage accounts (Ind AS)',               path:'/accounting/accounts',       color:COLORS.teal},
    {icon:BarChart3,  label:'P & L Statement',      desc:'Profit & Loss account',                  path:'/accounting/pl',             color:COLORS.emerald},
    {icon:Scale,      label:'Balance Sheet',        desc:'Assets & Liabilities',                   path:'/accounting/balance-sheet',  color:COLORS.deepBlue},
    {icon:Receipt,    label:'Trial Balance',        desc:'Debit & Credit balances',                path:'/accounting/trial-balance',  color:COLORS.amber},
    {icon:FileText,   label:'Ledger View',          desc:'Account-wise transactions',              path:'/accounting/ledger',         color:COLORS.coral},
    {icon:PieChart,   label:'Trading Account',      desc:'Gross profit computation',               path:'/accounting/trading',        color:COLORS.purple},
    {icon:Zap,        label:'AI Reconciliation',    desc:'Review & fix AI categorisations',        path:'/accounting/reconcile',      color:COLORS.amber},
    {icon:Receipt,    label:'Opening Balances',     desc:'Set year-start account balances',        path:'/accounting/opening-balances',color:COLORS.teal},
  ];

  const invKpis = invStats ? [
    {icon:IndianRupee,  label:'Total Revenue',  value:fmtRs(invStats.total_revenue),     color:COLORS.emerald,    sub:`${invStats.total_invoices} invoices`},
    {icon:Clock,        label:'Outstanding',    value:fmtRs(invStats.total_outstanding), color:COLORS.amber,      sub:`${invStats.overdue_count} overdue`},
    {icon:CheckCircle,  label:'Paid Invoices',  value:invStats.paid_count,               color:COLORS.mediumBlue, sub:'fully paid'},
    {icon:CreditCard,   label:'This Month',     value:fmtRs(invStats.month_revenue),     color:COLORS.purple,     sub:`${invStats.month_invoices} invoices`},
    {icon:FileText,     label:'GST Collected',  value:fmtRs(invStats.total_gst),         color:COLORS.teal,       sub:'total GST'},
    {icon:AlertTriangle,label:'Draft',          value:invStats.draft_count,              color:COLORS.coral,      sub:'not sent yet'},
  ] : [];

  return (
    <div className="p-4 md:p-6 min-h-screen space-y-5" style={{background:dark?'#0f172a':'#f1f5f9'}}>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={26} style={{color:COLORS.mediumBlue}}/>AI Accounting
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Invoices · Companies · Journal Entries · Financial Statements
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {FY_OPTIONS.map(o=>(
              <button key={o.label} onClick={()=>setFy(o)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  fy.label===o.label?'text-white border-transparent':
                  'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}
                style={fy.label===o.label?{background:COLORS.mediumBlue}:{}}>
                FY {o.label}
              </button>
            ))}
          </div>
          <button onClick={refreshAll}
            className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition">
            <RefreshCw size={16} className={`text-gray-500 ${spinning?'animate-spin':''}`}/>
          </button>
        </div>
      </div>

      {/* ── INVOICE SUMMARY ── */}
      <div className={card}>
        <SecHead title="Invoice Summary" count={invStats?.total_invoices} color={COLORS.mediumBlue} expanded={open.inv} onToggle={()=>tog('inv')}/>
        <Collapse open={open.inv}>
          {invLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4">
              {[...Array(6)].map((_,i)=><div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"/>)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
                {invKpis.map((k,i)=>(
                  <motion.div key={k.label} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="p-1.5 rounded-lg" style={{background:k.color+'18'}}>
                        <k.icon size={13} style={{color:k.color}}/>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
                    </div>
                    <p className="text-base font-bold text-gray-900 dark:text-white leading-tight">{k.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
                  </motion.div>
                ))}
              </div>
              {invStats?.top_clients?.length>0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Top Clients by Revenue</p>
                  <div className="space-y-2">
                    {invStats.top_clients.map((c,i)=>{
                      const pct = invStats.total_revenue>0 ? Math.round((c.revenue/invStats.total_revenue)*100) : 0;
                      return (
                        <div key={c.name} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-4">{i+1}</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 w-40 truncate">{c.name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                            <div className="h-1.5 rounded-full" style={{width:`${pct}%`,background:COLORS.mediumBlue}}/>
                          </div>
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-24 text-right">₹{fmtD(c.revenue)}</span>
                          <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex justify-end">
                <button onClick={()=>nav('/invoicing')} className="flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{color:COLORS.mediumBlue}}>
                  <ExternalLink size={12}/> Open Invoices Module
                </button>
              </div>
            </>
          )}
        </Collapse>
      </div>

      {/* ── RECENT INVOICES ── */}
      <div className={card}>
        <SecHead title="Recent Invoices" count={recentInv.length} color={COLORS.purple} expanded={open.recent} onToggle={()=>tog('recent')}/>
        <Collapse open={open.recent}>
          {invLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_,i)=><div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"/>)}</div>
          ) : recentInv.length===0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Receipt size={28} className="mx-auto mb-2 opacity-40"/>
              No invoices found.{' '}
              <button onClick={()=>nav('/invoicing')} className="underline text-blue-500">Create one</button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                      <th className="px-4 py-2 text-left">Invoice #</th>
                      <th className="px-4 py-2 text-left">Client</th>
                      <th className="px-4 py-2 text-left">Company</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Due</th>
                      <th className="px-4 py-2 text-center">Status</th>
                      <th className="px-4 py-2 text-center">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {recentInv.map(inv=>{
                      const co = companies.find(c=>c.id===inv.company_id);
                      return (
                        <tr key={inv.id||inv.invoice_no} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                          <td className="px-4 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">{inv.invoice_no}</td>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{inv.client_name}</td>
                          <td className="px-4 py-2 text-gray-500 dark:text-gray-400 max-w-[120px] truncate">{co?.name||inv.company_name||'—'}</td>
                          <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{inv.invoice_date}</td>
                          <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-white">₹{fmtD(inv.grand_total)}</td>
                          <td className="px-4 py-2 text-right">
                            {inv.amount_due>0
                              ? <span className="text-red-500 font-semibold">₹{fmtD(inv.amount_due)}</span>
                              : <span className="text-green-500">Paid</span>}
                          </td>
                          <td className="px-4 py-2 text-center"><Badge status={inv.status}/></td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={()=>nav('/invoicing')} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition">
                              <ExternalLink size={12}/>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex justify-between items-center">
                <span className="text-xs text-gray-400">Showing latest {recentInv.length} invoices</span>
                <button onClick={()=>nav('/invoicing')} className="flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{color:COLORS.mediumBlue}}>
                  <ExternalLink size={12}/> View All Invoices
                </button>
              </div>
            </>
          )}
        </Collapse>
      </div>

      {/* ── COMPANIES ── */}
      <div className={card}>
        <SecHead title="Company Profiles" count={companies.length} color={COLORS.teal} expanded={open.co} onToggle={()=>tog('co')}/>
        <Collapse open={open.co}>
          {coLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
              {[...Array(3)].map((_,i)=><div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"/>)}
            </div>
          ) : companies.length===0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Building2 size={28} className="mx-auto mb-2 opacity-40"/>
              No companies found. Add one from the Invoicing module.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {companies.map((co,i)=>{
                const coInvs = recentInv.filter(inv=>inv.company_id===co.id);
                const coRevenue = coInvs.reduce((s,inv)=>s+(inv.grand_total||0),0);
                return (
                  <motion.div key={co.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-800/50 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      {co.logo ? (
                        <img src={co.logo} alt={co.name} className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-gray-700 bg-white"/>
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{background:COLORS.mediumBlue}}>
                          {(co.name||'?')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{co.name}</p>
                        {co.gstin
                          ? <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{background:'#dcfce7',color:'#15803d'}}>GST: {co.gstin}</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded" style={{background:'#fef9c3',color:'#854d0e'}}>GST Not Registered</span>}
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                      {co.email && <div className="flex items-center gap-1.5 truncate"><FileCheck size={11}/>{co.email}</div>}
                      {co.phone && <div className="flex items-center gap-1.5"><Activity size={11}/>{co.phone}</div>}
                    </div>
                    {coInvs.length>0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Receipt size={11} style={{color:COLORS.mediumBlue}}/>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{coInvs.length} recent invoice{coInvs.length!==1?'s':''}</span>
                        </div>
                        {coRevenue>0 && <span className="text-xs font-semibold" style={{color:COLORS.emerald}}>₹{fmtD(coRevenue)}</span>}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex justify-end">
            <button onClick={()=>nav('/invoicing')} className="flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{color:COLORS.teal}}>
              <ExternalLink size={12}/> Manage Companies in Invoicing
            </button>
          </div>
        </Collapse>
      </div>

      {/* ── ACCOUNTING METRICS + QUICK ACTIONS ── */}
      <div className={card}>
        <SecHead title={`Accounting Overview — FY ${fy.label}`} color={COLORS.deepBlue} expanded={open.acc} onToggle={()=>tog('acc')}/>
        <Collapse open={open.acc}>
          {accLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
              {[...Array(8)].map((_,i)=><div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"/>)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
              {accMetrics.map((m,i)=>(
                <motion.div key={m.label} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}
                  onClick={()=>nav(m.path)}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="p-1.5 rounded-lg" style={{background:m.color+'18'}}>
                      <m.icon size={15} style={{color:m.color}}/>
                    </div>
                    <ChevronRight size={12} className="text-gray-300 group-hover:translate-x-0.5 transition-transform"/>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{m.label}</p>
                  <p className="text-base font-bold text-gray-900 dark:text-white">{m.value}</p>
                </motion.div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 dark:border-gray-800 p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {quickActions.map((a,i)=>(
                <motion.button key={a.label} initial={{opacity:0,scale:0.97}} animate={{opacity:1,scale:1}} transition={{delay:0.05+i*0.03}}
                  onClick={()=>nav(a.path)}
                  className="flex flex-col items-start gap-1 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow transition-all bg-gray-50 dark:bg-gray-800 text-left group">
                  <div className="p-1.5 rounded-lg mb-0.5" style={{background:a.color+'1A'}}>
                    <a.icon size={14} style={{color:a.color}}/>
                  </div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-white leading-tight">{a.label}</p>
                  <p className="text-xs text-gray-400 leading-tight hidden md:block">{a.desc}</p>
                </motion.button>
              ))}
            </div>
          </div>
        </Collapse>
      </div>

      {/* Info banner */}
      <div className={`${card} p-4`} style={{borderLeft:`4px solid ${COLORS.mediumBlue}`}}>
        <div className="flex items-start gap-3">
          <AlertCircle size={18} style={{color:COLORS.mediumBlue,flexShrink:0,marginTop:2}}/>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">How AI Accounting Works</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              1. Upload your bank statement (SBI / HDFC / ICICI / Axis — PDF or Excel). &nbsp;
              2. AI auto-categorises each transaction using Indian Accounting Standards. &nbsp;
              3. Double-entry journal entries are posted automatically. &nbsp;
              4. View Ledgers, Trial Balance, Trading A/c, P&amp;L and Balance Sheet instantly.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
