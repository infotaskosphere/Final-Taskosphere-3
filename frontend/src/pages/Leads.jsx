import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Building2, User, Phone,
  Mail, Calendar, List, LayoutGrid, Check, TrendingUp,
  AlertTriangle, Clock, Zap, CheckCircle2, Loader2,
  Circle, X, ArrowRight, IndianRupee, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const PIPELINE_STAGES = [
  { id: 'new',         label: 'New',         stripe: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200'       },
  { id: 'contacted',   label: 'Contacted',   stripe: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'meeting',     label: 'Meeting',     stripe: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'proposal',    label: 'Proposal',    stripe: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200'   },
  { id: 'negotiation', label: 'Negotiation', stripe: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'on_hold',     label: 'On Hold',     stripe: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200'   },
  { id: 'won',         label: 'Won',         stripe: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'lost',        label: 'Lost',        stripe: 'bg-red-500',     badge: 'bg-red-50 text-red-600 border-red-200'         },
];

const ACTIVE_STAGES   = ['new','contacted','meeting','proposal','negotiation','on_hold'];
const KANBAN_COLS     = ACTIVE_STAGES;

const LEAD_SOURCES = [
  { label: 'Direct',       value: 'direct'       },
  { label: 'Website',      value: 'website'      },
  { label: 'Referral',     value: 'referral'     },
  { label: 'Social Media', value: 'social_media' },
  { label: 'Event',        value: 'event'        },
];

const TASK_CATEGORIES = [
  { value: 'gst',          label: 'GST'          },
  { value: 'income_tax',   label: 'Income Tax'   },
  { value: 'accounts',     label: 'Accounts'     },
  { value: 'tds',          label: 'TDS'          },
  { value: 'roc',          label: 'ROC'          },
  { value: 'trademark',    label: 'Trademark'    },
  { value: 'msme_smadhan', label: 'MSME'         },
  { value: 'fema',         label: 'FEMA'         },
  { value: 'dsc',          label: 'DSC'          },
  { value: 'other',        label: 'Other'        },
];

const stageOf  = (id) => PIPELINE_STAGES.find(s => s.id === id) || PIPELINE_STAGES[0];
const isOverdue = (lead) =>
  lead.next_follow_up &&
  new Date(lead.next_follow_up) < new Date() &&
  !['won','lost'].includes(lead.status);

const DashboardStripCard = ({ stripeColor, isCompleted = false, className = '', children }) => (
  <div className={cn(
    'relative rounded-2xl border transition-all duration-300 ease-in-out overflow-hidden group',
    isCompleted
      ? 'bg-slate-50 border-slate-200 opacity-75 scale-[0.985]'
      : 'bg-white/90 backdrop-blur-sm border-slate-200 hover:shadow-md hover:-translate-y-[1px]',
    className,
  )}>
    <div className={cn('absolute left-0 top-0 h-full w-[6px] rounded-l-2xl', stripeColor)} />
    <div className={cn('pl-6 pr-6 transition-all duration-300', isCompleted ? 'py-2' : 'py-5')}>
      {children}
    </div>
  </div>
);

const StatCard = ({ label, value, color, onClick, active }) => (
  <Card
    onClick={onClick}
    className={cn(
      'border border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer rounded-2xl',
      active && 'ring-2 ring-blue-300 border-blue-300',
    )}
  >
    <CardContent className="p-4 text-center">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={cn('text-3xl font-bold mt-1', color)}>{value}</p>
    </CardContent>
  </Card>
);

function ConvertToTaskDialog({ lead, open, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title:       '',
    description: '',
    priority:    'high',
    category:    'other',
    due_date:    '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lead) {
      setForm(f => ({
        ...f,
        title:       `Client Onboarding: ${lead.company_name}`,
        description: [
          `Lead converted to client from pipeline.`,
          `Contact:  ${lead.contact_name  || '—'}`,
          `Phone:    ${lead.phone         || '—'}`,
          `Email:    ${lead.email         || '—'}`,
          `Services: ${(lead.services||[]).join(', ') || '—'}`,
          `Value:    ₹${(Number(lead.quotation_amount)||0).toLocaleString()}`,
          `Referred By: ${lead.referred_by || '—'}`,
          `Notes:    ${lead.notes         || '—'}`,
        ].join('\n'),
      }));
    }
  }, [lead]);

  const handleConvert = async () => {
    setLoading(true);
    try {
      await api.post(`/leads/${lead.id}/convert`);
      await api.post('/tasks', {
        title:        form.title,
        description:  form.description,
        priority:     form.priority,
        category:     form.category,
        status:       'pending',
        due_date:     form.due_date ? new Date(form.due_date).toISOString() : null,
        is_recurring: false,
        sub_assignees: [],
      });
      toast.success(`"${lead.company_name}" converted to client & task created!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Conversion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
            <Zap className="h-5 w-5 text-emerald-500" />
            Convert Lead → Client + Task
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Marks <strong>{lead?.company_name}</strong> as <strong>Won</strong> and creates a follow-up task automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{lead?.company_name}</p>
              <p className="text-xs text-slate-500">
                ₹{(Number(lead?.quotation_amount)||0).toLocaleString()} · {lead?.contact_name || 'No contact'}
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white flex-shrink-0">
              → WON
            </span>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-0.5">Follow-up Task Details</p>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Task Title</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="h-9 rounded-2xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-9 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Due Date</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="h-9 rounded-2xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Task Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={5}
              className="resize-none text-sm rounded-2xl"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-2xl h-9">Cancel</Button>
          <Button
            onClick={handleConvert}
            disabled={loading || !form.title.trim()}
            className="rounded-2xl h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 min-w-[180px]"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Converting…</>
              : <><CheckCircle2 className="h-4 w-4" /> Convert & Create Task</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadsPage() {
  const { user } = useAuth();

  const isAdmin       = user?.role === 'admin';
  const perms         = user?.permissions || {};
  const canDeleteLead = isAdmin || !!perms.can_manage_users;
  const canViewAll    = isAdmin || !!perms.can_view_all_leads;
  const canEditLead   = (lead) =>
    isAdmin ||
    (lead?.assigned_to && lead.assigned_to === user?.id) ||
    (lead?.created_by  && lead.created_by  === user?.id);

  const [leads,             setLeads]             = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [submitting,        setSubmitting]        = useState(false);
  const [searchQuery,       setSearchQuery]       = useState('');
  const [statusFilter,      setStatusFilter]      = useState('all');
  const [viewMode,          setViewMode]          = useState('list');
  const [dialogOpen,        setDialogOpen]        = useState(false);
  const [editingLead,       setEditingLead]       = useState(null);
  const [convertingLead,    setConvertingLead]    = useState(null);
  const [errors,            setErrors]            = useState({});
  const [activeFilters,     setActiveFilters]     = useState([]);

  const emptyForm = {
    company_name:    '',
    contact_name:    null,
    email:           null,
    phone:           null,
    quotation_amount:null,
    services:        [],
    source:          'direct',
    referred_by:     null,
    notes:           null,
    assigned_to:     null,
    status:          'new',
    next_follow_up:  null,
    date_of_meeting: null,
  };
  const [formData, setFormData] = useState(emptyForm);

  const fetchLeads = async () => {
    try {
      const res = await api.get('/leads/');
      setLeads(res.data);
    } catch { toast.error('Failed to fetch leads'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLeads();
    api.get('/leads/meta/services').then(r => setAvailableServices(r.data)).catch(() => {});
  }, []);

  const stats = useMemo(() => ({
    total:     leads.length,
    active:    leads.filter(l => ACTIVE_STAGES.includes(l.status)).length,
    won:       leads.filter(l => l.status === 'won').length,
    lost:      leads.filter(l => l.status === 'lost').length,
    overdue:   leads.filter(isOverdue).length,
    wonValue:  leads.filter(l => l.status === 'won').reduce((s,l) => s + (Number(l.quotation_amount)||0), 0),
    pipeValue: leads.filter(l => ACTIVE_STAGES.includes(l.status)).reduce((s,l) => s + (Number(l.quotation_amount)||0), 0),
  }), [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return leads
      .filter(l =>
        !q ||
        l.company_name?.toLowerCase().includes(q) ||
        l.contact_name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q)
      )
      .filter(l => statusFilter === 'all' || l.status === statusFilter);
  }, [leads, searchQuery, statusFilter]);

  const resetForm = () => { setFormData(emptyForm); setErrors({}); };

  const handleChange = (field, value) =>
    setFormData(prev => ({ ...prev, [field]: value === '' ? null : value }));

  const handleEdit = (lead) => {
    setEditingLead(lead);
    setFormData({
      company_name:    lead.company_name    || '',
      contact_name:    lead.contact_name    || null,
      email:           lead.email           || null,
      phone:           lead.phone           || null,
      quotation_amount:lead.quotation_amount|| null,
      services:        Array.isArray(lead.services) ? lead.services : [],
      source:          lead.source          || 'direct',
      referred_by:     lead.referred_by     || null,
      notes:           lead.notes           || null,
      assigned_to:     lead.assigned_to     || null,
      status:          lead.status          || 'new',
      next_follow_up:  lead.next_follow_up  || null,
      date_of_meeting: lead.date_of_meeting || null,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingLead(null); resetForm(); };

  const handleSubmit = async () => {
    if (!formData.company_name?.trim()) {
      setErrors({ company_name: 'Company name is required' });
      return;
    }
    setSubmitting(true);
    const payload = {
      company_name:     formData.company_name?.trim() || '',
      contact_name:     formData.contact_name     || null,
      email:            formData.email            || null,
      phone:            formData.phone            || null,
      quotation_amount: formData.quotation_amount ? Number(formData.quotation_amount) : null,
      services:         Array.isArray(formData.services) ? formData.services : [],
      source:           formData.source           || 'direct',
      referred_by:      formData.referred_by      || null,
      notes:            formData.notes            || null,
      assigned_to:      formData.assigned_to      || null,
      status:           formData.status           || 'new',
      next_follow_up:   formData.next_follow_up   || null,
      date_of_meeting:  formData.date_of_meeting  || null,
    };
    try {
      if (editingLead) {
        await api.patch(`/leads/${editingLead.id}`, payload);
        toast.success('Lead updated!');
      } else {
        await api.post('/leads/', payload);
        toast.success('Lead created!');
      }
      closeDialog();
      fetchLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (lead) => {
    if (!window.confirm(`Delete "${lead.company_name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/leads/${lead.id}`);
      toast.success('Lead deleted');
      fetchLeads();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleQuickStage = async (lead, newStatus) => {
    if (newStatus === 'won') { setConvertingLead(lead); return; }
    if (newStatus === 'lost' && !window.confirm(`Mark "${lead.company_name}" as Lost?`)) return;
    try {
      await api.patch(`/leads/${lead.id}`, { status: newStatus });
      fetchLeads();
    } catch (err) { toast.error('Failed to update stage'); }
  };

  useEffect(() => {
    const pills = [];
    if (searchQuery)       pills.push({ key: 'search', label: `Search: ${searchQuery}` });
    if (statusFilter !== 'all') pills.push({ key: 'status', label: `Stage: ${stageOf(statusFilter).label}` });
    setActiveFilters(pills);
  }, [searchQuery, statusFilter]);

  const removeFilter = (key) => {
    if (key === 'search') setSearchQuery('');
    if (key === 'status') setStatusFilter('all');
  };

  if (loading) return (
    <div className="space-y-4 p-6">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
    </div>
  );

  return (
    <motion.div
      className="space-y-4 bg-slate-50 p-6 rounded-3xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >

      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-700 via-indigo-600 to-emerald-600" />
          <CardContent className="p-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: COLORS.deepBlue }}>
                Lead Pipeline
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {stats.active} active ·&nbsp;
                <span className="text-emerald-600 font-medium">{stats.won} won</span>
                {stats.overdue > 0 && (
                  <span className="text-red-500 font-medium"> · {stats.overdue} overdue</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-slate-100 p-1 rounded-2xl shadow-sm">
                <Button
                  variant="ghost" size="sm"
                  className={cn('rounded-xl font-medium', viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-500')}
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4 mr-1" /> List
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className={cn('rounded-xl font-medium', viewMode === 'kanban' ? 'bg-white shadow text-slate-800' : 'text-slate-500')}
                  onClick={() => setViewMode('kanban')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" /> Board
                </Button>
              </div>

              <Button
                size="sm"
                className="h-9 px-4 text-sm font-medium rounded-2xl shadow-sm hover:shadow-md bg-blue-700 hover:bg-blue-800 text-white"
                onClick={() => { resetForm(); setEditingLead(null); setDialogOpen(true); }}
              >
                <Plus className="mr-2 h-5 w-5" /> New Lead
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total"   value={stats.total}   color="text-slate-800"   onClick={() => setStatusFilter('all')} active={statusFilter === 'all'} />
        <StatCard label="Active"  value={stats.active}  color="text-blue-600"    onClick={() => setStatusFilter('all')} active={false} />
        <StatCard label="Won"     value={stats.won}     color="text-emerald-600" onClick={() => setStatusFilter('won')} active={statusFilter === 'won'} />
        <StatCard label="Lost"    value={stats.lost}    color="text-red-600"     onClick={() => setStatusFilter('lost')} active={statusFilter === 'lost'} />
        <StatCard label="Overdue" value={stats.overdue} color="text-orange-600"  onClick={() => setStatusFilter('all')} active={false} />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl border border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Won Revenue</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">₹{stats.wonValue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-indigo-200 bg-indigo-50">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Pipeline Value</p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">₹{stats.pipeValue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between gap-3 flex-wrap w-full"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search leads…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 bg-white rounded-2xl"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-white rounded-2xl text-sm">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {PIPELINE_STAGES.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-slate-400 ml-auto">
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
        </p>
      </motion.div>

      {activeFilters.length > 0 && (
        <motion.div variants={itemVariants} className="flex flex-wrap gap-2">
          {activeFilters.map(pill => (
            <Badge
              key={pill.key}
              variant="secondary"
              className="pl-3 pr-2 py-1 text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 cursor-pointer rounded-full"
              onClick={() => removeFilter(pill.key)}
            >
              {pill.label}
              <X className="h-3 w-3 ml-1 text-slate-400 hover:text-slate-600" />
            </Badge>
          ))}
        </motion.div>
      )}

      {viewMode === 'list' && (
        <motion.div className="space-y-3" variants={containerVariants}>
          {filteredLeads.length === 0 && (
            <div className="text-center py-20 text-slate-400">
              <Circle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No leads found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          )}

          {filteredLeads.filter(l => !['won','lost'].includes(l.status)).map((lead) => {
            const stage   = stageOf(lead.status);
            const overdue = isOverdue(lead);
            const prob    = lead.closure_probability;

            return (
              <motion.div key={lead.id} variants={itemVariants}>
                <DashboardStripCard stripeColor={stage.stripe}>
                  <div className="flex flex-col gap-3">

                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <span className="text-base font-semibold text-slate-900 leading-tight">
                          {lead.company_name}
                        </span>

                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold border',
                          stage.badge,
                        )}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', stage.stripe)} />
                          {stage.label}
                        </span>

                        {prob != null && (
                          <span className={cn(
                            'hidden sm:inline-flex px-2.5 py-0.5 rounded-xl text-[11px] font-bold',
                            prob >= 70 ? 'bg-emerald-50 text-emerald-700'
                            : prob >= 40 ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-600',
                          )}>
                            {prob}% close
                          </span>
                        )}

                        {overdue && (
                          <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-[11px] font-semibold bg-red-50 text-red-600 border border-red-200">
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden md:inline text-sm font-bold text-slate-700">
                          ₹{(Number(lead.quotation_amount)||0).toLocaleString()}
                        </span>

                        {canEditLead(lead) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs font-semibold rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1"
                            onClick={() => setConvertingLead(lead)}
                          >
                            <Zap className="h-3.5 w-3.5" /> Convert
                          </Button>
                        )}

                        {canEditLead(lead) && (
                          <button
                            onClick={() => handleEdit(lead)}
                            className="p-1.5 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDeleteLead && (
                          <button
                            onClick={() => handleDelete(lead)}
                            className="p-1.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      {lead.contact_name && (
                        <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{lead.contact_name}</span>
                      )}
                      {lead.phone && (
                        <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>
                      )}
                      {lead.email && (
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.email}</span>
                      )}
                      {lead.source && (
                        <span className="flex items-center gap-1.5 capitalize">
                          <ArrowRight className="h-3.5 w-3.5" />
                          {lead.source.replace('_',' ')}
                        </span>
                      )}
                      {lead.referred_by && (
                        <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                          <User className="h-3.5 w-3.5" />
                          Ref: {lead.referred_by}
                        </span>
                      )}
                      {lead.next_follow_up && (
                        <span className={cn(
                          'flex items-center gap-1.5 font-medium',
                          overdue ? 'text-red-500' : 'text-slate-500',
                        )}>
                          <Calendar className="h-3.5 w-3.5" />
                          Follow-up: {format(new Date(lead.next_follow_up), 'dd MMM yyyy')}
                          {overdue && (
                            <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">OVERDUE</span>
                          )}
                        </span>
                      )}
                      {lead.date_of_meeting && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Meeting: {format(new Date(lead.date_of_meeting), 'dd MMM yyyy')}
                        </span>
                      )}
                      <span className="md:hidden flex items-center gap-1 font-bold text-slate-700">
                        <IndianRupee className="h-3.5 w-3.5" />
                        {(Number(lead.quotation_amount)||0).toLocaleString()}
                      </span>
                    </div>

                    {(lead.services||[]).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lead.services.map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1">
                        {ACTIVE_STAGES.map((sid, i) => {
                          const currentIdx = ACTIVE_STAGES.indexOf(lead.status);
                          const s = stageOf(sid);
                          return (
                            <React.Fragment key={sid}>
                              <button
                                onClick={() => canEditLead(lead) && handleQuickStage(lead, sid)}
                                title={s.label}
                                className={cn(
                                  'flex-1 h-1.5 rounded-full transition-all duration-200',
                                  i <= currentIdx ? s.stripe : 'bg-slate-200',
                                  canEditLead(lead) ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                                )}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {canEditLead(lead) && (
                        <div className="flex gap-1 flex-wrap">
                          {ACTIVE_STAGES.map(sid => {
                            const s = stageOf(sid);
                            const active = lead.status === sid;
                            return (
                              <button
                                key={sid}
                                disabled={active}
                                onClick={() => !active && handleQuickStage(lead, sid)}
                                className={cn(
                                  'h-6 px-2.5 text-[11px] font-semibold rounded-xl border transition-all',
                                  active
                                    ? cn(s.stripe, 'text-white border-transparent shadow-sm')
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700',
                                )}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => handleQuickStage(lead, 'lost')}
                            className="h-6 px-2.5 text-[11px] font-semibold rounded-xl border bg-white text-red-400 border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all"
                          >
                            Lost
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </DashboardStripCard>
              </motion.div>
            );
          })}

          {filteredLeads.some(l => ['won','lost'].includes(l.status)) && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">Closed</p>
              {filteredLeads.filter(l => ['won','lost'].includes(l.status)).map(lead => {
                const stage = stageOf(lead.status);
                return (
                  <motion.div key={lead.id} variants={itemVariants}>
                    <DashboardStripCard stripeColor={stage.stripe} isCompleted>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-600">{lead.company_name}</span>
                          <span className={cn('px-2.5 py-0.5 rounded-xl text-[11px] font-bold border', stage.badge)}>
                            {stage.label}
                          </span>
                          {(lead.services||[]).slice(0,2).map(s => (
                            <span key={s} className="hidden sm:inline px-2 py-0.5 rounded-lg text-[11px] bg-white text-slate-500 border border-slate-200">
                              {s}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={cn(
                            'text-sm font-bold',
                            lead.status === 'won' ? 'text-emerald-600' : 'text-slate-400',
                          )}>
                            ₹{(Number(lead.quotation_amount)||0).toLocaleString()}
                          </span>
                          {canDeleteLead && (
                            <button
                              onClick={() => handleDelete(lead)}
                              className="p-1.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </DashboardStripCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {viewMode === 'kanban' && (
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
          variants={containerVariants}
        >
          {KANBAN_COLS.map(sid => {
            const stage    = stageOf(sid);
            const colLeads = filteredLeads.filter(l => l.status === sid);
            const colValue = colLeads.reduce((s,l) => s + (Number(l.quotation_amount)||0), 0);

            return (
              <motion.div key={sid} variants={itemVariants} className="flex flex-col gap-2">
                <div className={cn('rounded-2xl border px-3 py-2 flex items-center justify-between', stage.badge)}>
                  <span className="text-xs font-bold">{stage.label}</span>
                  <span className="text-xs font-bold bg-white/80 px-1.5 py-0.5 rounded-full">{colLeads.length}</span>
                </div>
                {colValue > 0 && (
                  <p className="text-[10px] text-slate-400 text-right pr-1">
                    ₹{colValue.toLocaleString()}
                  </p>
                )}

                <div className="space-y-2 min-h-[80px]">
                  <AnimatePresence>
                    {colLeads.map(lead => {
                      const overdue = isOverdue(lead);
                      const prob    = lead.closure_probability;
                      return (
                        <motion.div
                          key={lead.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="relative bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-all hover:-translate-y-[1px]"
                        >
                          <div className={cn('absolute left-0 top-0 h-full w-[5px]', stage.stripe)} />
                          <div className="pl-4 pr-3 py-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2 pr-1">
                              {lead.company_name}
                            </p>
                            {lead.contact_name && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                <User className="h-3 w-3 flex-shrink-0" />{lead.contact_name}
                              </p>
                            )}
                            {lead.referred_by && (
                              <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                                <User className="h-3 w-3 flex-shrink-0" />Ref: {lead.referred_by}
                              </p>
                            )}
                            {lead.quotation_amount && (
                              <p className="text-xs font-bold text-slate-700">
                                ₹{Number(lead.quotation_amount).toLocaleString()}
                              </p>
                            )}
                            {prob != null && (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full transition-all', prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                                    style={{ width: `${prob}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">{prob}%</span>
                              </div>
                            )}
                            {overdue && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold">
                                <AlertTriangle className="h-3 w-3" /> Overdue
                              </span>
                            )}
                            <div className="flex gap-1 pt-1 border-t border-slate-100">
                              {canEditLead(lead) && (
                                <button
                                  onClick={() => handleEdit(lead)}
                                  className="flex-1 h-6 text-[11px] font-medium rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              {canEditLead(lead) && (
                                <button
                                  onClick={() => setConvertingLead(lead)}
                                  className="flex-1 h-6 text-[11px] font-semibold rounded-xl border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1"
                                >
                                  <Zap className="h-3 w-3" /> Win
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {colLeads.length === 0 && (
                    <div className="text-center py-8 text-slate-200">
                      <Circle className="h-7 w-7 mx-auto mb-1 opacity-50" />
                      <p className="text-[11px]">Empty</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold" style={{ color: COLORS.deepBlue }}>
              {editingLead ? 'Edit Lead' : 'Create New Lead'}
            </DialogTitle>
            <DialogDescription>
              {editingLead ? 'Update lead details below.' : 'Fill in the details to add a new lead to your pipeline.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">

            <div className="md:col-span-2 space-y-1.5">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input
                value={formData.company_name || ''}
                onChange={e => handleChange('company_name', e.target.value)}
                placeholder="e.g. Sharma & Associates"
                className={cn('h-10 rounded-2xl', errors.company_name && 'border-red-400')}
              />
              {errors.company_name && (
                <p className="text-xs text-red-500">{errors.company_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input
                value={formData.contact_name || ''}
                onChange={e => handleChange('contact_name', e.target.value)}
                placeholder="Full name"
                className="h-10 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lead Source</Label>
              <Select value={formData.source || 'direct'} onValueChange={v => handleChange('source', v)}>
                <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email || ''}
                onChange={e => handleChange('email', e.target.value)}
                placeholder="contact@company.com"
                className="h-10 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={formData.phone || ''}
                onChange={e => handleChange('phone', e.target.value)}
                placeholder="+91 98765 43210"
                className="h-10 rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Quotation Amount (₹)</Label>
              <Input
                type="number"
                value={formData.quotation_amount ?? ''}
                onChange={e => handleChange('quotation_amount', e.target.value)}
                placeholder="0"
                className="h-10 rounded-2xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Referred By</Label>
              <Input
                value={formData.referred_by || ''}
                onChange={e => handleChange('referred_by', e.target.value)}
                placeholder="Name of CA or person who referred this lead"
                className="h-10 rounded-2xl"
              />
            </div>

            {editingLead && (
              <div className="space-y-1.5">
                <Label>Pipeline Stage</Label>
                <Select value={formData.status} onValueChange={v => handleChange('status', v)}>
                  <SelectTrigger className="h-10 rounded-2xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.filter(s => s.id !== 'won').map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400">To mark as Won, use the Convert button.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Next Follow-up</Label>
              <Input
                type="datetime-local"
                value={formData.next_follow_up ? formData.next_follow_up.slice(0,16) : ''}
                onChange={e => handleChange('next_follow_up', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="h-10 rounded-2xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Meeting</Label>
              <Input
                type="datetime-local"
                value={formData.date_of_meeting ? formData.date_of_meeting.slice(0,16) : ''}
                onChange={e => handleChange('date_of_meeting', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="h-10 rounded-2xl text-sm"
              />
            </div>

            {availableServices.length > 0 && (
              <div className="md:col-span-2 space-y-2">
                <Label>Services</Label>
                <div className="flex flex-wrap gap-2">
                  {availableServices.map(service => {
                    const selected = formData.services.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          services: selected
                            ? prev.services.filter(s => s !== service)
                            : [...prev.services, service],
                        }))}
                        className={cn(
                          'h-8 px-3 rounded-2xl text-xs font-semibold transition-all flex items-center gap-1.5',
                          selected
                            ? 'bg-blue-700 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                        )}
                      >
                        {service}
                        {selected && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="md:col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes || ''}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Notes, requirements, context… affects closure probability score automatically."
                rows={3}
                className="resize-none rounded-2xl text-sm"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-200 gap-2">
            <Button variant="outline" onClick={closeDialog} className="rounded-2xl">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-2xl bg-blue-700 hover:bg-blue-800 text-white min-w-[130px]"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                : editingLead ? 'Update Lead' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {convertingLead && (
        <ConvertToTaskDialog
          lead={convertingLead}
          open={!!convertingLead}
          onClose={() => setConvertingLead(null)}
          onSuccess={() => { setConvertingLead(null); fetchLeads(); }}
        />
      )}

    </motion.div>
  );
}
