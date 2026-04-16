import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, ChevronDown, ChevronUp, X, Save, Layers } from 'lucide-react';

const COLORS = { mediumBlue:'#1F6FB2', emerald:'#1FAF5A', coral:'#EF4444', amber:'#F59E0B', purple:'#7C3AED', teal:'#0D9488' };
const card = "rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm";

const TYPE_COLORS = {
  Asset:'#1F6FB2', Liability:'#F59E0B', Capital:'#7C3AED', Revenue:'#1FAF5A', Expense:'#EF4444',
};

const TYPES    = ['Asset','Liability','Capital','Revenue','Expense'];
const SUB_TYPES= {
  Asset:    ['Bank','Cash','Receivable','Current Asset','Fixed Asset','Prepaid','Investment','Tax Asset'],
  Liability:['Current Liability','Long Term Liability','Payable','Tax Liability'],
  Capital:  ['Equity','Retained Earnings'],
  Revenue:  ['Operating Revenue','Other Income'],
  Expense:  ['Direct Expense','Indirect Expense','Depreciation','Tax Expense'],
};

const emptyForm = { code:'', name:'', type:'Asset', sub_type:'Current Asset', normal_balance:'Dr', opening_balance:0, description:'' };

export default function ChartOfAccounts() {
  const dark = useDark();
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filterType, setFT]     = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(emptyForm);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState({});

  const fetch = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/accounting/accounts'); setAccounts(r.data||[]); }
    catch { toast.error('Failed to load accounts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const save = async () => {
    if (!form.code || !form.name) { toast.error('Code and Name are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/accounting/accounts/${editing}`, form);
        toast.success('Account updated');
      } else {
        await api.post('/accounting/accounts', form);
        toast.success('Account created');
      }
      setShowForm(false); setEditing(null); setForm(emptyForm); fetch();
    } catch(e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const startEdit = a => {
    setForm({ code:a.code,name:a.name,type:a.type,sub_type:a.sub_type,normal_balance:a.normal_balance||'Dr',opening_balance:a.opening_balance||0,description:a.description||'' });
    setEditing(a.code); setShowForm(true);
  };

  // Group by type
  const filtered = accounts.filter(a => {
    const matchSearch = !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase());
    const matchType   = filterType === 'All' || a.type === filterType;
    return matchSearch && matchType;
  });

  const grouped = TYPES.reduce((acc, t) => { acc[t] = filtered.filter(a => a.type === t); return acc; }, {});

  const fmt = n => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n||0);

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers size={22} style={{color:COLORS.mediumBlue}}/> Chart of Accounts
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Indian Accounting Standards – Double Entry System</p>
        </div>
        <button onClick={()=>{setForm(emptyForm);setEditing(null);setShowForm(true);}}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition"
          style={{background:COLORS.mediumBlue}}>
          <Plus size={15}/> Add Account
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code or name…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white w-48"/>
        </div>
        <div className="flex gap-1">
          {['All',...TYPES].map(t => (
            <button key={t} onClick={()=>setFT(t)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${filterType===t?'text-white':'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
              style={filterType===t?{background:TYPE_COLORS[t]||COLORS.mediumBlue}:{}}>{t}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} accounts</span>
      </div>

      {/* Account Groups */}
      {loading ? (
        <div className={`${card} p-8 text-center text-gray-400 text-sm`}>Loading accounts…</div>
      ) : (
        <div className="space-y-3">
          {TYPES.map(type => {
            const accs = grouped[type] || [];
            if (accs.length === 0) return null;
            const isOpen = expanded[type] !== false;
            const total = accs.reduce((s,a) => s + (a.running_balance||0), 0);
            return (
              <div key={type} className={card}>
                <button className="w-full flex items-center justify-between p-4" onClick={()=>setExpanded(e=>({...e,[type]:!isOpen}))}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{background:TYPE_COLORS[type]}}/>
                    <span className="font-semibold text-gray-800 dark:text-white text-sm">{type}</span>
                    <span className="text-xs text-gray-400">({accs.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Balance: ₹{fmt(total)}</span>
                    {isOpen ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.2}} className="overflow-hidden">
                      <div className="border-t border-gray-100 dark:border-gray-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase tracking-wide">
                              <th className="text-left px-4 py-2">Code</th>
                              <th className="text-left px-4 py-2">Account Name</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Sub Type</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Normal</th>
                              <th className="text-right px-4 py-2">Opening Bal</th>
                              <th className="text-right px-4 py-2">Running Bal</th>
                              <th className="px-4 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {accs.map(a => (
                              <tr key={a.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2 font-mono font-semibold" style={{color:TYPE_COLORS[a.type]}}>{a.code}</td>
                                <td className="px-4 py-2 text-gray-800 dark:text-white font-medium">{a.name}</td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">{a.sub_type}</td>
                                <td className="px-4 py-2 hidden md:table-cell">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${a.normal_balance==='Dr'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                    {a.normal_balance}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">₹{fmt(a.opening_balance)}</td>
                                <td className="px-4 py-2 text-right font-semibold" style={{color: (a.running_balance||0)>=0?TYPE_COLORS[a.type]:COLORS.coral}}>
                                  ₹{fmt(Math.abs(a.running_balance||0))}
                                </td>
                                <td className="px-4 py-2">
                                  <button onClick={()=>startEdit(a)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500">
                                    <Edit2 size={12}/>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <div className="absolute inset-0 bg-black/40" onClick={()=>setShowForm(false)}/>
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-gray-900 dark:text-white">{editing ? 'Edit Account' : 'New Account'}</h2>
                <button onClick={()=>setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
              </div>
              <div className="space-y-3">
                {[
                  {label:'Account Code *',key:'code',type:'text',placeholder:'e.g. 1010',disabled:!!editing},
                  {label:'Account Name *',key:'name',type:'text',placeholder:'e.g. Sundry Debtors'},
                  {label:'Description',key:'description',type:'text',placeholder:'Optional'},
                  {label:'Opening Balance (₹)',key:'opening_balance',type:'number',placeholder:'0'},
                ].map(f=>(
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{f.label}</label>
                    <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:f.type==='number'?parseFloat(e.target.value)||0:e.target.value}))}
                      placeholder={f.placeholder} disabled={f.disabled}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-3 py-1.5 disabled:opacity-50"/>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                    <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value,sub_type:SUB_TYPES[e.target.value][0]}))}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      {TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sub Type</label>
                    <select value={form.sub_type} onChange={e=>setForm(p=>({...p,sub_type:e.target.value}))}
                      className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1.5">
                      {(SUB_TYPES[form.type]||[]).map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Normal Balance</label>
                  <div className="flex gap-3">
                    {['Dr','Cr'].map(b=>(
                      <label key={b} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={form.normal_balance===b} onChange={()=>setForm(p=>({...p,normal_balance:b}))} className="accent-blue-500"/>
                        <span className="text-sm text-gray-700 dark:text-gray-200">{b} ({b==='Dr'?'Debit':'Credit'})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={()=>setShowForm(false)} className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                  style={{background:COLORS.mediumBlue}}>
                  {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RefreshCw({ size, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
    </svg>
  );
}
