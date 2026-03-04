import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  UserPlus,
  Phone,
  User,
  Search,
  Send,
  Edit,
  Save,
  X,
  CheckCircle,
  XCircle,
  Plus,
  CalendarIcon,
  Brain,
  FileText,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { value: 'gst', label: 'GST' },
  { value: 'income_tax', label: 'INCOME TAX' },
  { value: 'accounts', label: 'ACCOUNTS' },
  { value: 'tds', label: 'TDS' },
  { value: 'roc', label: 'ROC' },
  { value: 'trademark', label: 'TRADEMARK' },
  { value: 'msme_smadhan', label: 'MSME SMADHAN' },
  { value: 'fema', label: 'FEMA' },
  { value: 'dsc', label: 'DSC' },
  { value: 'other', label: 'OTHER' },
];

const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const COMPLIANCE_WORKFLOWS = [
  {
    id: 1,
    name: "Monthly GST Compliance",
    category: "gst",
    title: "Monthly GST Filing - GSTR-1 & GSTR-3B",
    description: "- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1\n- File GSTR-3B",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 5,
  },
  // ... (Other workflows omitted for brevity, add back as needed)
];

// ─────────────────────────────────────────────────────────────
// Lead Card Component
// ─────────────────────────────────────────────────────────────
function LeadCard({ lead, users, isAdmin, onAssign, onOpenDetails }) {
  const assignee = users.find(u => u.id === lead.assigned_to);
  const isTelegram = lead.source === 'telegram';

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={() => onOpenDetails(lead)}
      className="relative flex flex-col p-6 rounded-3xl border bg-white shadow-sm hover:shadow-xl transition-all border-slate-100 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="text-[10px] uppercase font-bold bg-slate-100">{lead.source || 'manual'}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-bold">{lead.status || 'new'}</Badge>
          </div>
          <h3 className="text-lg font-bold text-slate-900 truncate">{lead.company_name}</h3>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50">
          {isTelegram ? <Send className="w-5 h-5 text-sky-500" /> : <UserPlus className="w-5 h-5 text-slate-400" />}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4" /><span>{lead.phone || '—'}</span></div>
        <div className="flex items-center gap-2 text-slate-600"><User className="w-4 h-4" /><span>{assignee?.full_name || 'Not Assigned'}</span></div>
        {lead.closure_probability !== null && (
          <div className="flex items-center gap-2 text-slate-600">
            <Brain className="w-4 h-4 text-purple-500" />
            <span>Close Chance: {lead.closure_probability}%</span>
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between pt-4 border-t">
        <p className="text-xs text-slate-400">
          {lead.created_at ? format(new Date(lead.created_at), 'MMM d • h:mm a') : ''}
        </p>
        {isAdmin && (
          <div onClick={(e) => e.stopPropagation()}>
            <Select onValueChange={(val) => onAssign(lead.id, val)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Assign" /></SelectTrigger>
              <SelectContent>
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <SelectItem key={u.id} value={u.id || "unassigned"}>{u.full_name || "Unknown"}</SelectItem>
                  ))
                ) : <SelectItem value="none" disabled>No users</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Lead Details Modal
// ─────────────────────────────────────────────────────────────
function LeadDetailsModal({ lead, users, isOpen, onClose, onUpdate, onConvert, onCloseAsLost, onPredict }) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [date, setDate] = useState(undefined);

  useEffect(() => {
    if (lead) {
      setFormData(lead);
      setDate(lead.next_follow_up ? new Date(lead.next_follow_up) : undefined);
    }
    setEditMode(false);
  }, [lead, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    onUpdate(formData.id, { ...formData, next_follow_up: date });
    setEditMode(false);
  };

  if (!lead) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formData.company_name || 'Lead Details'}</DialogTitle>
          <DialogDescription>View or manage lead information.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Company</Label>
            <Input name="company_name" value={formData.company_name || ''} onChange={handleChange} disabled={!editMode} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Service</Label>
            <Select 
              value={formData.service || 'other'} 
              onValueChange={(val) => setFormData(p => ({ ...p, service: val }))} 
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Assigned To</Label>
            <Select 
              value={formData.assigned_to || 'unassigned'} 
              onValueChange={(val) => setFormData(p => ({ ...p, assigned_to: val }))} 
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id || "unassigned"}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4 pt-2 border-t">
            <Label className="text-right">AI Probability</Label>
            <div className="col-span-3 flex items-center gap-4">
              <div className="flex-1">
                <Progress value={formData.closure_probability || 0} className="w-full h-2" />
                <p className="text-xs text-slate-500 mt-1">{formData.closure_probability || 0}% Probability</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onPredict(formData.id)} disabled={!formData.notes}>
                <Brain className="mr-2 h-4 w-4 text-purple-500" /> Analyze
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Notes</Label>
            <Textarea name="notes" value={formData.notes || ''} onChange={handleChange} disabled={!editMode} className="col-span-3 min-h-[100px]" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {!editMode ? (
            <>
              <Button variant="outline" onClick={() => setEditMode(true)}><Edit className="mr-2 h-4 w-4" /> Edit</Button>
              {formData.status !== 'won' && (
                <Button variant="success" className="bg-green-600 hover:bg-green-700" onClick={() => onConvert(formData.id)}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Convert to Won
                </Button>
              )}
            </>
          ) : (
            <Button onClick={handleSubmit} className="bg-blue-600"><Save className="mr-2 h-4 w-4" /> Save</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Lead Creation Modal
// ─────────────────────────────────────────────────────────────
function LeadCreateModal({ isOpen, onClose, users, onCreate }) {
  const [formData, setFormData] = useState({ company_name: '', status: 'new', source: 'direct', assigned_to: 'unassigned' });
  const [date, setDate] = useState(undefined);

  const handleSubmit = () => {
    if (!formData.company_name) return toast.error('Company name required');
    onCreate({ ...formData, next_follow_up: date });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Company*</Label>
            <Input value={formData.company_name} onChange={(e) => setFormData(p => ({ ...p, company_name: e.target.value }))} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Assigned To</Label>
            <Select value={formData.assigned_to} onValueChange={(val) => setFormData(p => ({ ...p, assigned_to: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id || "unassigned"}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit}><Plus className="mr-2 h-4 w-4" /> Create Lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Task Creation Modal (REPLACED SWITCH WITH CHECKBOX)
// ─────────────────────────────────────────────────────────────
function TaskCreationModal({ isOpen, onClose, lead, users, onCreateTask }) {
  const [taskData, setTaskData] = useState({
    title: '', description: '', assigned_to: 'unassigned', priority: 'medium', 
    category: 'other', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1
  });

  useEffect(() => {
    if (lead) {
      setTaskData(prev => ({
        ...prev,
        title: `Follow-up: ${lead.company_name}`,
        description: lead.notes || '',
        assigned_to: lead.assigned_to || 'unassigned',
        category: lead.service || 'other'
      }));
    }
  }, [lead, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Create Follow-up Task</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Title</Label>
            <Input value={taskData.title} onChange={(e) => setTaskData(p => ({ ...p, title: e.target.value }))} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Recurring</Label>
            <div className="col-span-3 flex items-center gap-4">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-blue-600 cursor-pointer"
                checked={taskData.is_recurring}
                onChange={(e) => setTaskData(p => ({ ...p, is_recurring: e.target.checked }))}
              />
              <span className="text-sm text-slate-600">Enable recurring task</span>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Assigned To</Label>
            <Select value={taskData.assigned_to} onValueChange={(val) => setTaskData(p => ({ ...p, assigned_to: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id || "unassigned"}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onCreateTask(taskData); onClose(); }}>Create Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Leads Page
// ─────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [closedLead, setClosedLead] = useState(null);

  const isAdmin = user?.role === 'admin';
  const hasLeadPermission = user?.permissions?.can_view_all_leads;

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', statusFilter],
    queryFn: () => {
      const param = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      return api.get(`/leads${param}`).then(res => res.data);
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/leads/${id}`, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Updated');
      if (res.data.status === 'won' || res.data.status === 'lost') {
        setClosedLead(res.data);
        setShowTaskModal(true);
      }
    }
  });

  const convertMutation = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/convert`),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Converted');
      setClosedLead(res.data);
      setShowTaskModal(true);
      setSelectedLead(null);
    }
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(l => l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [leads, searchTerm]);

  if (!isAdmin && !hasLeadPermission) {
    return <div className="p-20 text-center font-bold">Access Denied</div>;
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Leads Pipeline</h1>
        <div className="flex gap-4">
          <Input placeholder="Search..." className="w-64" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateModal(true)}><Plus className="mr-2 h-4 w-4" /> Add Lead</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredLeads.map(lead => (
            <LeadCard 
              key={lead.id} 
              lead={lead} 
              users={users} 
              isAdmin={isAdmin} 
              onAssign={(id, staffId) => updateMutation.mutate({ id, data: { assigned_to: staffId } })} 
              onOpenDetails={setSelectedLead} 
            />
          ))}
        </AnimatePresence>
      </div>

      <LeadDetailsModal 
        lead={selectedLead} 
        users={users} 
        isOpen={!!selectedLead} 
        onClose={() => setSelectedLead(null)} 
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        onConvert={(id) => convertMutation.mutate(id)}
        onPredict={(id) => api.post(`/leads/${id}/predict_closure`).then(() => queryClient.invalidateQueries(['leads']))}
      />

      <LeadCreateModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
        users={users} 
        onCreate={(data) => api.post('/leads', data).then(() => queryClient.invalidateQueries(['leads']))} 
      />

      <TaskCreationModal 
        isOpen={showTaskModal} 
        onClose={() => setShowTaskModal(false)} 
        lead={closedLead} 
        users={users} 
        onCreateTask={(task) => api.post('/tasks', task).then(() => toast.success("Task created"))} 
      />
    </div>
  );
}
