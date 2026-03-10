import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  CheckCircle, Filter, Upload, Sparkles, FileText,
  X, CheckSquare, Loader2, SkipForward
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
};

const CATEGORIES  = ['GST','Income Tax','TDS','ROC','Audit','Trademark','RERA','FEMA','Other'];
const DEPARTMENTS = ['GST','IT','ACC','TDS','ROC','TM','MSME','FEMA','DSC','OTHER'];

const STATUS_STYLES = {
  pending:   { bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200',   dot:'bg-amber-400',   label:'Pending'   },
  completed: { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', dot:'bg-emerald-400', label:'Completed' },
  overdue:   { bg:'bg-red-50',     text:'text-red-700',     border:'border-red-200',     dot:'bg-red-400',     label:'Overdue'   },
  upcoming:  { bg:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-200',    dot:'bg-blue-400',    label:'Upcoming'  },
};

const cv = { hidden:{ opacity:0 }, visible:{ opacity:1, transition:{ staggerChildren:0.06 } } };
const iv = { hidden:{ opacity:0, y:16 }, visible:{ opacity:1, y:0, transition:{ duration:0.35 } } };

// ─────────────────────────────────────────────
// SMART IMPORT MODAL
// ─────────────────────────────────────────────
function SmartImportModal({ open, onClose, clients, users, user, onImportDone }) {
  const [file, setFile]                     = useState(null);
  const [extracting, setExtracting]         = useState(false);
  const [extractedDates, setExtractedDates] = useState([]);
  const [step, setStep]                     = useState('upload');
  const [selected, setSelected]             = useState({});
  const [saving, setSaving]                 = useState(false);

  const reset = () => { setFile(null); setExtracting(false); setExtractedDates([]); setStep('upload'); setSelected({}); };
  const close = () => { reset(); onClose(); };

  const onFile = (f) => {
    if (!f) return;
    // Block image files — server does not support OCR
    if (f.type.startsWith('image/')) {
      toast.error('Image files are not supported. Please upload a PDF or DOCX file.');
      return;
    }
    setFile(f);
  };

  const extract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await api.post('/duedates/extract-from-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const list = res.data?.extracted || [];
      if (!list.length) { toast.error('No compliance dates found. Try a clearer PDF or DOCX.'); return; }
      const withIds = list.map((item, i) => ({ ...item, _id:`ex_${i}`, reminder_days:30, assigned_to:'unassigned', client_id:'no_client' }));
      const sel = {};
      withIds.forEach(d => { sel[d._id] = true; });
      setExtractedDates(withIds);
      setSelected(sel);
      setStep('review');
      toast.success(`Found ${withIds.length} compliance date${withIds.length !== 1 ? 's' : ''}!`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Extraction failed. Please try again.');
    } finally { setExtracting(false); }
  };

  const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
  const selectAll = ()  => { const m={}; extractedDates.forEach(d=>{m[d._id]=true;});  setSelected(m); };
  const clearAll  = ()  => { const m={}; extractedDates.forEach(d=>{m[d._id]=false;}); setSelected(m); };
  const selCount  = Object.values(selected).filter(Boolean).length;

  const doImport = async () => {
    const list = extractedDates.filter(d => selected[d._id]);
    if (!list.length) { toast.error('Select at least one item'); return; }
    setSaving(true);
    let ok = 0;
    for (const item of list) {
      try {
        await api.post('/duedates', {
          title:         item.title,
          description:   item.description || '',
          due_date:      new Date(item.due_date).toISOString(),
          reminder_days: item.reminder_days || 30,
          category:      item.category   || 'Other',
          department:    item.department || 'OTHER',
          assigned_to:   item.assigned_to === 'unassigned' ? null : item.assigned_to,
          client_id:     item.client_id   === 'no_client'  ? null : item.client_id,
          status:        'pending',
        });
        ok++;
      } catch {}
    }
    setSaving(false);
    toast.success(`${ok} due date${ok !== 1 ? 's' : ''} imported!`);
    onImportDone();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Smart Import</DialogTitle>
          <DialogDescription>Upload PDF or Word to extract compliance dates</DialogDescription>
        </DialogHeader>

        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b" style={{ background:`linear-gradient(135deg,${COLORS.deepBlue} 0%,${COLORS.mediumBlue} 100%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Smart Import</h2>
              <p className="text-blue-200 text-xs">Upload PDF or Word — server extracts compliance dates automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {['upload','review'].map((s,i) => (
              <React.Fragment key={s}>
                {i>0 && <div className="h-px w-6 bg-white/30" />}
                <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${step===s?'bg-white text-blue-700':'bg-white/20 text-white'}`}>
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">{i+1}</span>
                  {s==='upload'?'Upload':'Review & Import'}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">

            {/* ── STEP 1: UPLOAD ── */}
            {step === 'upload' && (
              <motion.div key="upload" initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:20}}>
                <div
                  onDragOver={e=>e.preventDefault()}
                  onDrop={e=>{e.preventDefault();onFile(e.dataTransfer?.files?.[0]);}}
                  onClick={()=>document.getElementById('smart-file').click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${file?'border-blue-400 bg-blue-50':'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                >
                  {/* accept only PDF and DOCX */}
                  <input
                    id="smart-file"
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="hidden"
                    onChange={e=>onFile(e.target.files?.[0])}
                  />

                  {file ? (
                    <div className="space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center">
                        <FileText className="h-8 w-8 text-blue-500"/>
                      </div>
                      <p className="font-semibold text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size/1024).toFixed(1)} KB</p>
                      <button
                        onClick={e=>{e.stopPropagation();setFile(null);}}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3"/>Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Upload className="h-7 w-7 text-slate-400"/>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 mb-1">Drop file or click to browse</p>
                        <p className="text-xs text-slate-400">PDF and DOCX supported</p>
                      </div>
                      <div className="flex justify-center gap-3">
                        <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 text-red-500">
                          <FileText className="h-3.5 w-3.5"/>PDF
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-500">
                          <FileText className="h-3.5 w-3.5"/>Word
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-100 flex gap-3">
                  <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-amber-700">
                    Our server scans your document and extracts compliance deadlines automatically.
                    No external API is used — all processing happens on your backend.
                  </p>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" onClick={close}>Cancel</Button>
                  <Button
                    onClick={extract}
                    disabled={!file || extracting}
                    className="text-white px-6"
                    style={{background:`linear-gradient(135deg,${COLORS.deepBlue} 0%,${COLORS.mediumBlue} 100%)`}}
                  >
                    {extracting
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Extracting...</>
                      : <><Sparkles className="h-4 w-4 mr-2"/>Extract Dates</>
                    }
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: REVIEW ── */}
            {step === 'review' && (
              <motion.div key="review" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-slate-800">{extractedDates.length}</span> found ·{' '}
                    <span className="font-bold" style={{color:COLORS.mediumBlue}}>{selCount}</span> selected
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline font-medium">Select All</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={clearAll}  className="text-xs text-slate-500 hover:underline font-medium">Clear All</button>
                  </div>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {extractedDates.map(item => {
                    const isSel = selected[item._id];
                    return (
                      <motion.div
                        key={item._id} layout
                        onClick={()=>toggle(item._id)}
                        className={`rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${isSel?'border-blue-300 bg-blue-50':'border-slate-200 bg-white opacity-60'}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border-2 transition-all ${isSel?'bg-blue-500 border-blue-500':'border-slate-300 bg-white'}`}>
                            {isSel && <CheckSquare className="h-3.5 w-3.5 text-white"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                              <Badge className="text-[10px] px-2 py-0" style={{background:'#EEF4FF',color:COLORS.mediumBlue}}>{item.category}</Badge>
                              <Badge className="text-[10px] px-2 py-0 bg-slate-100 text-slate-600">{item.department}</Badge>
                            </div>
                            {item.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{item.description}</p>}
                            <div className="flex items-center gap-1 mt-2">
                              <Calendar className="h-3 w-3 text-slate-400"/>
                              <span className="text-xs font-medium text-slate-600">
                                {item.due_date ? format(new Date(item.due_date),'dd MMM yyyy') : 'Date TBD'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={e=>{e.stopPropagation();toggle(item._id);}}
                            className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg font-medium transition-all ${isSel?'bg-red-50 text-red-500 hover:bg-red-100':'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}
                          >
                            {isSel
                              ? <span className="flex items-center gap-1"><SkipForward className="h-3 w-3"/>Ignore</span>
                              : <span className="flex items-center gap-1"><Plus className="h-3 w-3"/>Add</span>
                            }
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={()=>setStep('upload')}>← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    <Button
                      onClick={doImport}
                      disabled={saving || selCount===0}
                      className="text-white px-6"
                      style={{background:`linear-gradient(135deg,${COLORS.emeraldGreen} 0%,#17a34a 100%)`}}
                    >
                      {saving
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Importing...</>
                        : <><CheckCircle className="h-4 w-4 mr-2"/>Import {selCount} Date{selCount!==1?'s':''}</>
                      }
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function DueDates() {
  const { user } = useAuth();
  const [dueDates, setDueDates]         = useState([]);
  const [clients, setClients]           = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [importOpen, setImportOpen]     = useState(false);
  const [editingDueDate, setEditing]    = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCat, setFilterCat]       = useState('all');
  const [filterMonth, setFilterMonth]   = useState('all');
  const [formData, setFormData]         = useState({
    title:'', description:'', due_date:'', reminder_days:30,
    category:'', department:'', assigned_to:'unassigned', client_id:'no_client', status:'pending',
  });

  useEffect(() => {
    fetchDueDates(); fetchClients();
    if (user?.role==='admin'||user?.role==='manager') fetchUsers();
  }, [user]);

  const fetchDueDates = async () => { try { const r=await api.get('/duedates'); setDueDates(r.data); } catch { toast.error('Failed to fetch due dates'); } };
  const fetchClients  = async () => { try { const r=await api.get('/clients'); setClients(r.data); } catch {} };
  const fetchUsers    = async () => { try { const r=await api.get('/users');   setUsers(r.data);   } catch {} };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const payload = {
        ...formData,
        assigned_to: formData.assigned_to==='unassigned'?null:formData.assigned_to,
        client_id:   formData.client_id==='no_client'?null:(formData.client_id||null),
        due_date:    new Date(formData.due_date).toISOString(),
      };
      if (editingDueDate) { await api.put(`/duedates/${editingDueDate.id}`, payload); toast.success('Updated!'); }
      else                { await api.post('/duedates', payload); toast.success('Created!'); }
      setDialogOpen(false); resetForm(); fetchDueDates();
    } catch { toast.error('Failed to save'); } finally { setLoading(false); }
  };

  const handleEdit = dd => {
    setEditing(dd);
    setFormData({ title:dd.title, description:dd.description||'', due_date:format(new Date(dd.due_date),'yyyy-MM-dd'), reminder_days:dd.reminder_days, category:dd.category||'', department:dd.department||'', assigned_to:dd.assigned_to||'unassigned', client_id:dd.client_id||'no_client', status:dd.status });
    setDialogOpen(true);
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this due date?')) return;
    try { await api.delete(`/duedates/${id}`); toast.success('Deleted!'); fetchDueDates(); }
    catch { toast.error('Failed to delete'); }
  };

  const resetForm = () => {
    setFormData({ title:'', description:'', due_date:'', reminder_days:30, category:'', department:'', assigned_to:'unassigned', client_id:'no_client', status:'pending' });
    setEditing(null);
  };

  const getUserName   = id => users.find(u=>u.id===id)?.full_name||'Unassigned';
  const getClientName = id => clients.find(c=>c.id===id)?.company_name||'-';

  const getStatus = dd => {
    if (dd.status==='completed') return 'completed';
    const d = differenceInDays(new Date(dd.due_date), new Date());
    return d<0?'overdue':d<=7?'upcoming':'pending';
  };

  const filtered = dueDates.filter(dd => {
    const ms = dd.title.toLowerCase().includes(searchQuery.toLowerCase());
    const mS = filterStatus==='all'||getStatus(dd)===filterStatus;
    const mC = filterCat==='all'||dd.category===filterCat;
    const mM = filterMonth==='all'||new Date(dd.due_date).getMonth()===parseInt(filterMonth);
    return ms&&mS&&mC&&mM;
  });

  const stats = {
    total:     dueDates.length,
    upcoming:  dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d>=0&&d<=7; }).length,
    pending:   dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d>7; }).length,
    overdue:   dueDates.filter(dd=>{ const d=differenceInDays(new Date(dd.due_date),new Date()); return dd.status!=='completed'&&d<0; }).length,
    completed: dueDates.filter(dd=>dd.status==='completed').length,
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
    .map((label,i) => ({ value:String(i), label }));

  const addToCalendar = dd => {
    const t    = encodeURIComponent(dd.title);
    const desc = encodeURIComponent(dd.description||'');
    const s    = format(new Date(dd.due_date),'yyyyMMdd');
    const e    = format(new Date(new Date(dd.due_date).getTime()+86400000),'yyyyMMdd');
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${t}&details=${desc}&dates=${s}/${e}`,'_blank');
  };

  const StatCard = ({ label, value, color, status, ring }) => (
    <motion.div whileHover={{y:-2}} whileTap={{scale:0.98}}>
      <Card
        className={`border cursor-pointer transition-all hover:shadow-lg ${filterStatus===status?`ring-2 ${ring}`:'border-slate-200'}`}
        onClick={()=>setFilterStatus(filterStatus===status?'all':status)}
      >
        <CardContent className="p-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-4xl font-bold tabular-nums ${color}`}>{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <motion.div className="space-y-6" variants={cv} initial="hidden" animate="visible">

      {/* Header */}
      <motion.div variants={iv} className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{color:COLORS.deepBlue}}>Compliance Calendar</h1>
          <p className="text-slate-500 mt-1 text-sm">Track and manage all statutory filing deadlines</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={()=>setImportOpen(true)}
            className="border-2 gap-2 font-semibold transition-all hover:scale-105"
            style={{borderColor:COLORS.mediumBlue, color:COLORS.mediumBlue}}
          >
            <Sparkles className="h-4 w-4"/>Smart Import
          </Button>
          <Dialog open={dialogOpen} onOpenChange={o=>{setDialogOpen(o);if(!o)resetForm();}}>
            <DialogTrigger asChild>
              <Button
                className="text-white gap-2 font-semibold px-5 shadow-lg transition-all hover:scale-105"
                style={{background:`linear-gradient(135deg,${COLORS.deepBlue} 0%,${COLORS.mediumBlue} 100%)`}}
              >
                <Plus className="h-4 w-4"/>New Due Date
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-2xl" style={{color:COLORS.deepBlue}}>
                  {editingDueDate?'Edit Due Date':'Add New Due Date'}
                </DialogTitle>
                <DialogDescription>
                  {editingDueDate?'Update compliance due date details.':'Create a new compliance due date reminder.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input placeholder="e.g., GST Return Filing" value={formData.title} onChange={e=>setFormData({...formData,title:e.target.value})} required/>
                </div>
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select value={formData.department} onValueChange={v=>setFormData({...formData,department:v})}>
                    <SelectTrigger><SelectValue placeholder="Select department"/></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select value={formData.category||undefined} onValueChange={v=>setFormData({...formData,category:v})}>
                      <SelectTrigger><SelectValue placeholder="Select category"/></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date *</Label>
                    <Input type="date" value={formData.due_date} onChange={e=>setFormData({...formData,due_date:e.target.value})} required/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={formData.client_id||'no_client'} onValueChange={v=>setFormData({...formData,client_id:v==='no_client'?'':v})}>
                      <SelectTrigger><SelectValue placeholder="Select client"/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_client">No Client</SelectItem>
                        {clients.map(c=><SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {(user?.role==='admin'||user?.role==='manager') && (
                    <div className="space-y-2">
                      <Label>Assign To</Label>
                      <Select value={formData.assigned_to} onValueChange={v=>setFormData({...formData,assigned_to:v})}>
                        <SelectTrigger><SelectValue placeholder="Select user"/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map(u=><SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Remind Before (days)</Label>
                    <Input type="number" min="1" value={formData.reminder_days} onChange={e=>setFormData({...formData,reminder_days:parseInt(e.target.value)||30})}/>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={v=>setFormData({...formData,status:v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea placeholder="Additional notes..." value={formData.description} onChange={e=>setFormData({...formData,description:e.target.value})} rows={2}/>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={()=>{setDialogOpen(false);resetForm();}}>Cancel</Button>
                  <Button type="submit" disabled={loading} className="text-white" style={{background:COLORS.deepBlue}}>
                    {loading?'Saving...':editingDueDate?'Update':'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={iv} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total"     value={stats.total}     color="text-slate-700"   status="all"       ring="ring-slate-400"/>
        <StatCard label="Upcoming"  value={stats.upcoming}  color="text-blue-600"    status="upcoming"  ring="ring-blue-400"/>
        <StatCard label="Pending"   value={stats.pending}   color="text-amber-500"   status="pending"   ring="ring-amber-400"/>
        <StatCard label="Overdue"   value={stats.overdue}   color="text-red-500"     status="overdue"   ring="ring-red-400"/>
        <StatCard label="Completed" value={stats.completed} color="text-emerald-500" status="completed" ring="ring-emerald-400"/>
      </motion.div>

      {/* Filters */}
      <motion.div variants={iv} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"/>
          <Input placeholder="Search due dates..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="pl-10 bg-white border-slate-200"/>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white border-slate-200">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400"/><SelectValue placeholder="Status"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-36 bg-white border-slate-200"><SelectValue placeholder="Category"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-36 bg-white border-slate-200">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400"/><SelectValue placeholder="Month"/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={iv}>
        <Card className="border border-slate-200 overflow-hidden" style={{boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{background:'linear-gradient(to right,#f8fafc,#f1f5f9)'}}>
                  {['Status','Title','Category','Client','Due Date','Assigned To','Days Left',''].map(h=>(
                    <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-slate-300"/>
                      </div>
                      <p className="text-slate-400 text-sm font-medium">No due dates found</p>
                      <p className="text-slate-300 text-xs">Try Smart Import to extract from a compliance document</p>
                    </div>
                  </td></tr>
                ) : filtered.map((dd, idx) => {
                  const ds    = getStatus(dd);
                  const sty   = STATUS_STYLES[ds];
                  const dLeft = differenceInDays(new Date(dd.due_date), new Date());
                  return (
                    <motion.tr
                      key={dd.id}
                      initial={{opacity:0}} animate={{opacity:1}} transition={{delay:idx*0.03}}
                      className="hover:bg-slate-50/70 transition-colors group border-b border-slate-100 last:border-0"
                    >
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${sty.bg} ${sty.text} ${sty.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sty.dot}`}/>{sty.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm" style={{color:COLORS.deepBlue}}>{dd.title}</p>
                          {dd.assigned_to===user?.id && <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-0">You</Badge>}
                        </div>
                        {dd.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{dd.description}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className="text-[11px] font-medium" style={{borderColor:COLORS.mediumBlue+'60',color:COLORS.mediumBlue,background:'#EEF4FF'}}>
                          {dd.category||'Other'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        {dd.client_id
                          ? <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-300"/><span className="text-xs text-slate-500">{getClientName(dd.client_id)}</span></div>
                          : <span className="text-slate-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {format(new Date(dd.due_date),'dd MMM yyyy')}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-300"/>
                          <span className="text-xs text-slate-500">{getUserName(dd.assigned_to)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {dd.status==='completed'
                          ? <span className="text-xs text-emerald-500 font-semibold">✓ Done</span>
                          : <span className={`text-xs font-bold tabular-nums ${dLeft<0?'text-red-500':dLeft<=7?'text-amber-500':'text-slate-500'}`}>
                              {dLeft<0?`${Math.abs(dLeft)}d ago`:`${dLeft}d left`}
                            </span>
                        }
                      </td>
                      <td className="px-5 py-4">
                        {(user?.role==='admin'||dd.assigned_to===user?.id) && (
                          <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 rounded-lg"    onClick={()=>handleEdit(dd)}>
                              <Edit className="h-3.5 w-3.5 text-blue-500"/>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 rounded-lg"     onClick={()=>handleDelete(dd.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-400"/>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-50 rounded-lg" onClick={()=>addToCalendar(dd)}>
                              <Calendar className="h-3.5 w-3.5 text-emerald-500"/>
                            </Button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length>0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-400">
                Showing <span className="font-semibold text-slate-600">{filtered.length}</span> of{' '}
                <span className="font-semibold text-slate-600">{dueDates.length}</span> due dates
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      <SmartImportModal
        open={importOpen}
        onClose={()=>setImportOpen(false)}
        clients={clients}
        users={users}
        user={user}
        onImportDone={fetchDueDates}
      />
    </motion.div>
  );
}
