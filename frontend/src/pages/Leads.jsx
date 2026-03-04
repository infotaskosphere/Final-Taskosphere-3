import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
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
  Mail,
  MapPin,
  Trash2,
  ChevronRight,
  Briefcase,
  Target,
  Activity,
  BarChart2,
  PieChart as PieChartIcon,
  TrendingUp,
  DollarSign,
  Users as UsersIcon,
} from 'lucide-react';
// ── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
};
// ── Spring Physics (for Framer Motion) ──────────────────────────────────────
const springPhysics = {
  card: { type: "spring", stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: "spring", stiffness: 320, damping: 24, mass: 0.9 },
  button: { type: "spring", stiffness: 400, damping: 28 },
  icon: { type: "spring", stiffness: 450, damping: 25 },
  tap: { type: "spring", stiffness: 500, damping: 30 }
};
// ── Animation Variants ──────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] }
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.3 } }
};
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
// Phone Formatter
// ─────────────────────────────────────────────────────────────
const formatPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
};
// ─────────────────────────────────────────────────────────────
// Lead Card Component
// ─────────────────────────────────────────────────────────────
function LeadCard({ lead, users, isAdmin, onAssign, onOpenDetails }) {
  const assignee = users.find(u => u.id === lead.assigned_to);
  const isTelegram = lead.source === 'telegram';
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4, scale: 1.01, transition: springPhysics.lift }}
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
          <p className="text-sm text-slate-600 truncate">{lead.contact_name || '—'}</p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50">
          {isTelegram ? <Send className="w-5 h-5 text-sky-500" /> : <UserPlus className="w-5 h-5 text-slate-400" />}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4" /><span>{formatPhone(lead.phone) || '—'}</span></div>
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
              <SelectTrigger className="h-8 w-32 text-xs rounded-2xl"><SelectValue placeholder="Assign" /></SelectTrigger>
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
function LeadDetailsModal({ lead, users, isOpen, onClose, onUpdate, onConvert, onCloseAsLost, onPredict, onOpenClientModal, onDelete }) {
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [date, setDate] = useState(undefined);
  const [meetingDate, setMeetingDate] = useState(undefined);
  const [selectedServices, setSelectedServices] = useState([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  useEffect(() => {
    if (lead) {
      setFormData(lead);
      setDate(lead.next_follow_up ? new Date(lead.next_follow_up) : undefined);
      setMeetingDate(lead.date_of_meeting ? new Date(lead.date_of_meeting) : undefined);
      const services = lead.services || [];
      const deptValues = DEPARTMENTS.map(d => d.value);
      setSelectedServices(services.filter(s => deptValues.includes(s)));
      const otherService = services.find(s => !deptValues.includes(s));
      if (otherService) {
        setOtherChecked(true);
        setOtherValue(otherService);
      } else {
        setOtherChecked(false);
        setOtherValue('');
      }
    }
    setEditMode(false);
  }, [lead, isOpen]);
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handlePhoneBlur = () => {
    setFormData(prev => ({ ...prev, phone: formatPhone(prev.phone) }));
  };
  const handleServiceToggle = (value) => {
    setSelectedServices(prev => 
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };
  const handleSubmit = () => {
    const services = [...selectedServices];
    if (otherChecked && otherValue) services.push(otherValue);
    onUpdate(formData.id, { ...formData, services, next_follow_up: date, date_of_meeting: meetingDate });
    setEditMode(false);
  };
  if (!lead) return null;
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>{formData.company_name || 'Lead Details'}</DialogTitle>
          <DialogDescription className="text-slate-600">View or manage lead information.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Company</Label>
            <Input name="company_name" value={formData.company_name || ''} onChange={handleChange} disabled={!editMode} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Name</Label>
            <Input name="contact_name" value={formData.contact_name || ''} onChange={handleChange} disabled={!editMode} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Number</Label>
            <Input name="phone" value={formData.phone || ''} onChange={handleChange} onBlur={handlePhoneBlur} disabled={!editMode} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2 font-medium text-slate-700">Services</Label>
            <div className="col-span-3 grid gap-2" disabled={!editMode}>
              {DEPARTMENTS.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <Checkbox 
                    id={d.value} 
                    checked={selectedServices.includes(d.value)} 
                    onCheckedChange={() => handleServiceToggle(d.value)}
                    disabled={!editMode}
                  />
                  <label htmlFor={d.value} className="text-sm text-slate-700">{d.label}</label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="other" 
                  checked={otherChecked} 
                  onCheckedChange={setOtherChecked}
                  disabled={!editMode}
                />
                <label htmlFor="other" className="text-sm text-slate-700">Other</label>
              </div>
              {otherChecked && (
                <Input 
                  value={otherValue} 
                  onChange={(e) => setOtherValue(e.target.value)} 
                  placeholder="Specify other service" 
                  className="mt-2 rounded-2xl"
                  disabled={!editMode}
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Approx Quote</Label>
            <Input name="approx_quote" type="number" value={formData.approx_quote || ''} onChange={handleChange} disabled={!editMode} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Date of Meeting</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("col-span-3 justify-start text-left font-normal rounded-2xl", !meetingDate && "text-muted-foreground")}
                  disabled={!editMode}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {meetingDate ? format(meetingDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={meetingDate} onSelect={setMeetingDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Assigned To</Label>
            <Select
              value={formData.assigned_to?.toString() || 'unassigned'}
              onValueChange={(val) => setFormData(p => ({ ...p, assigned_to: val === 'unassigned' ? null : val }))}
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Next Follow-up</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("col-span-3 justify-start text-left font-normal rounded-2xl", !date && "text-muted-foreground")}
                  disabled={!editMode}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4 pt-2 border-t">
            <Label className="text-right font-medium text-slate-700">AI Probability</Label>
            <div className="col-span-3 flex items-center gap-4">
              <div className="flex-1">
                <Progress value={formData.closure_probability ?? 0} className="w-full h-2 rounded-full" />
                <p className="text-xs text-slate-500 mt-1">{formData.closure_probability ?? 0}% Probability</p>
              </div>
              <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => onPredict(formData.id)} disabled={!formData.notes}>
                <Brain className="mr-2 h-4 w-4 text-purple-500" /> Analyze
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2 font-medium text-slate-700">Notes</Label>
            <Textarea name="notes" value={formData.notes || ''} onChange={handleChange} disabled={!editMode} className="col-span-3 min-h-[100px] rounded-2xl" />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {!editMode ? (
            <>
              <Button variant="outline" className="rounded-2xl" onClick={() => setEditMode(true)}><Edit className="mr-2 h-4 w-4" /> Edit</Button>
              {formData.status !== 'won' && formData.status !== 'lost' && (
                <>
                  <Button variant="success" className="bg-green-600 hover:bg-green-700 rounded-2xl" onClick={() => onConvert(formData.id)}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Convert to Won
                  </Button>
                  <Button variant="destructive" className="bg-red-600 hover:bg-red-700 rounded-2xl" onClick={() => onCloseAsLost(formData.id)}>
                    <XCircle className="mr-2 h-4 w-4" /> Close as Lost
                  </Button>
                </>
              )}
              {formData.status === 'won' && (
                <Button className="rounded-2xl" onClick={onOpenClientModal}>
                  <Plus className="mr-2 h-4 w-4" /> Add to Client
                </Button>
              )}
              <Button variant="destructive" className="rounded-2xl" onClick={() => onDelete(formData.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </>
          ) : (
            <Button className="bg-blue-600 rounded-2xl" onClick={handleSubmit}><Save className="mr-2 h-4 w-4" /> Save</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// ─────────────────────────────────────────────────────────────
// Client Creation Modal
// ─────────────────────────────────────────────────────────────
function ClientCreateModal({ isOpen, onClose, lead, onCreate }) {
  const [formData, setFormData] = useState({ company_name: '', contact_name: '', phone: '', email: '', address: '', services: [] });
  const [selectedServices, setSelectedServices] = useState([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  useEffect(() => {
    if (lead) {
      setFormData({
        company_name: lead.company_name || '',
        contact_name: lead.contact_name || '',
        phone: lead.phone || '',
        email: '',
        address: '',
        services: lead.services || []
      });
      const deptValues = DEPARTMENTS.map(d => d.value);
      setSelectedServices((lead.services || []).filter(s => deptValues.includes(s)));
      const otherService = (lead.services || []).find(s => !deptValues.includes(s));
      if (otherService) {
        setOtherChecked(true);
        setOtherValue(otherService);
      } else {
        setOtherChecked(false);
        setOtherValue('');
      }
    }
  }, [lead, isOpen]);
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handlePhoneBlur = () => {
    setFormData(prev => ({ ...prev, phone: formatPhone(prev.phone) }));
  };
  const handleServiceToggle = (value) => {
    setSelectedServices(prev => 
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };
  const handleSubmit = () => {
    if (!formData.company_name) return toast.error('Company name required');
    if (!formData.phone) return toast.error('Phone number required');
    if (selectedServices.length === 0 && (!otherChecked || !otherValue)) return toast.error('At least one service required');
    const services = [...selectedServices];
    if (otherChecked && otherValue) services.push(otherValue);
    onCreate({ ...formData, services });
    onClose();
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>Add Client</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Company*</Label>
            <Input name="company_name" value={formData.company_name} onChange={handleChange} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Name</Label>
            <Input name="contact_name" value={formData.contact_name} onChange={handleChange} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Number*</Label>
            <Input name="phone" value={formData.phone} onChange={handleChange} onBlur={handlePhoneBlur} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Email</Label>
            <Input name="email" value={formData.email} onChange={handleChange} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Address</Label>
            <Input name="address" value={formData.address} onChange={handleChange} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2 font-medium text-slate-700">Services*</Label>
            <div className="col-span-3 grid gap-2">
              {DEPARTMENTS.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <Checkbox 
                    id={d.value} 
                    checked={selectedServices.includes(d.value)} 
                    onCheckedChange={() => handleServiceToggle(d.value)}
                  />
                  <label htmlFor={d.value} className="text-sm text-slate-700">{d.label}</label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="other" 
                  checked={otherChecked} 
                  onCheckedChange={setOtherChecked}
                />
                <label htmlFor="other" className="text-sm text-slate-700">Other</label>
              </div>
              {otherChecked && (
                <Input 
                  value={otherValue} 
                  onChange={(e) => setOtherValue(e.target.value)} 
                  placeholder="Specify other service" 
                  className="mt-2 rounded-2xl"
                />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button className="rounded-2xl" onClick={handleSubmit}><Plus className="mr-2 h-4 w-4" /> Create Client</Button>
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
        title: `Follow-up: ${lead.company_name ?? ''}`,
        description: lead.notes ?? '',
        assigned_to: lead.assigned_to || 'unassigned',
        category: lead.service || 'other'
      }));
    }
  }, [lead, isOpen]);
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold" style={{ color: COLORS.deepBlue }}>Create Follow-up Task</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-medium text-slate-700">Title</Label>
            <Input value={taskData.title} onChange={(e) => setTaskData(p => ({ ...p, title: e.target.value }))} className="col-span-3 rounded-2xl" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold text-slate-700">Recurring</Label>
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
            <Label className="text-right font-medium text-slate-700">Assigned To</Label>
            <Select value={taskData.assigned_to} onValueChange={(val) => setTaskData(p => ({ ...p, assigned_to: val })}>
              <SelectTrigger className="col-span-3 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id || "unassigned"}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="rounded-2xl" onClick={() => { onCreateTask(taskData); onClose(); }}>Create Task</Button>
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
  const [showClientModal, setShowClientModal] = useState(false);
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
  const closeAsLostMutation = useMutation({
    mutationFn: (id) => api.patch(`/leads/${id}`, { status: 'lost' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Closed as Lost');
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
    <motion.div
      className="p-6 space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex justify-between items-center">
        <h1 className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>Leads Pipeline</h1>
        <div className="flex gap-4">
          <Input placeholder="Search..." className="w-64 rounded-2xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 rounded-2xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          <Button className="rounded-2xl" onClick={() => setShowCreateModal(true)}><Plus className="mr-2 h-4 w-4" /> Add Lead</Button>
        </div>
      </motion.div>
      {isLoading ? (
        <div className="text-center">Loading...</div>
      ) : (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
        </motion.div>
      )}
      <LeadDetailsModal
        lead={selectedLead}
        users={users}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        onConvert={(id) => convertMutation.mutate(id)}
        onCloseAsLost={(id) => closeAsLostMutation.mutate(id)}
        onPredict={(id) => api.post(`/leads/${id}/predict_closure`).then(() => queryClient.invalidateQueries(['leads']))}
        onOpenClientModal={() => setShowClientModal(true)}
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
    </motion.div>
  );
}
// ── Priority Stripe Helper ──────────────────────────────────────────────────
const getPriorityStripeClass = (priority) => {
  const p = (priority || '').toLowerCase().trim();
  if (p === 'critical') return 'border-l-8 border-l-red-600';
  if (p === 'urgent') return 'border-l-8 border-l-orange-500';
  if (p === 'medium') return 'border-l-8 border-l-emerald-500';
  if (p === 'low') return 'border-l-8 border-l-blue-500';
  return 'border-l-8 border-l-slate-300';
};
// ── Task Strip Component ────────────────────────────────────────────────────
function TaskStrip({ task, isToMe, assignedName, onUpdateStatus, navigate }) {
  const status = task.status || 'pending';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01, transition: springPhysics.lift }}
      whileTap={{ scale: 0.985, transition: springPhysics.tap }}
      className={`relative flex flex-col p-5 rounded-3xl border bg-white transition-all cursor-pointer group
      ${getPriorityStripeClass(task.priority)}
      ${isCompleted ? 'opacity-80 bg-green-50/40 border-green-200' : 'hover:shadow-2xl hover:border-blue-400 hover:ring-1 hover:ring-blue-200/60'}
      `}
      onClick={() => navigate(`/tasks?filter=assigned-to-me&taskId=${task.id}`)}
    >
      {/* Title + Action Buttons */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate leading-tight transition ${
            isCompleted ? 'line-through text-slate-500' : 'text-slate-900'
          }`}>
            {task.title || 'Untitled Task'}
            {task.client_name ? ` – ${task.client_name}` : ''}
          </p>
        </div>

        {isToMe && (
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Start / In Progress */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus?.(task.id, 'in_progress');
              }}
              disabled={isCompleted}
              className={`w-28 text-center py-1 text-xs font-medium rounded-full transition ${
                isInProgress
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white border border-blue-400 text-blue-700 hover:bg-blue-50'
              } disabled:opacity-50`}
            >
              {isInProgress ? '✓ In Progress' : 'Start'}
            </motion.button>

            {/* Done / Completed */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92, transition: springPhysics.button }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus?.(task.id, 'completed');
              }}
              disabled={isCompleted}
              className={`w-28 text-center py-1 text-xs font-medium rounded-full transition ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
              }`}
            >
              {isCompleted ? '✓ Done' : 'Done'}
            </motion.button>
          </div>
        )}
      </div>

      {/* Meta Info */}
      <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          {isToMe ? 'Assigned by: ' : 'Assigned to: '}
          <span className="font-medium text-slate-700">
            {assignedName || 'Unknown'}
          </span>
        </span>
        <span>
          • {format(new Date(task.created_at || Date.now()), 'MMM d, yyyy • hh:mm a')}
        </span>
        {task.due_date && (
          <span>
            • Due: {format(new Date(task.due_date), 'MMM d, yyyy')}
          </span>
        )}
      </div>
    </motion.div>
  );
}
// ── Main Dashboard Component ────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingPeriod, setRankingPeriod] = useState("monthly");

  const [newTodo, setNewTodo] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState(undefined);
  const [mustPunchIn, setMustPunchIn] = useState(false);

  const { data: tasks = [] } = useTasks();
  const { data: stats } = useDashboardStats();
  const { data: upcomingDueDates = [] } = useUpcomingDueDates();
  const { data: todayAttendance } = useTodayAttendance();

  const updateTaskMutation = useUpdateTask();

  // Todos (personal)
  const { data: todosRaw = [] } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get("/todos");
      return res.data;
    },
  });

  const todos = useMemo(() =>
    todosRaw.map(todo => ({
      ...todo,
      completed: todo.status === "completed",
    })),
    [todosRaw]
  );

  const tasksAssignedToMe = useMemo(() =>
    tasks
      .filter(t => t.assigned_to === user?.id && t.status !== "completed")
      .slice(0, 6),
    [tasks, user?.id]
  );

  const tasksAssignedByMe = useMemo(() =>
    tasks
      .filter(t => t.created_by === user?.id && t.assigned_to !== user?.id)
      .slice(0, 6),
    [tasks, user?.id]
  );

  const recentTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  // Rankings (star performers)
  useEffect(() => {
    async function fetchRankings() {
      try {
        const period = rankingPeriod === "all" ? "all_time" : rankingPeriod;
        const res = await api.get("/reports/performance-rankings", {
          params: { period }
        });
        setRankings(res.data || []);
      } catch (err) {
        console.warn("Failed to fetch rankings:", err);
        setRankings([]);
      }
    }
    fetchRankings();
  }, [rankingPeriod]);

  // ── Mutations 
  const createTodo = useMutation({
    mutationFn: data => api.post("/todos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo added");
    },
    onError: () => toast.error("Failed to add todo"),
  });

  const updateTodo = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/todos/${id}`, { is_completed: newStatus === "completed" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteTodo = useMutation({
    mutationFn: id => api.delete(`/todos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      toast.success("Todo deleted");
    },
    onError: () => toast.error("Failed to delete todo"),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const addTodo = () => {
    if (!newTodo.trim()) return;
    createTodo.mutate({
      title: newTodo.trim(),
      status: "pending",
      due_date: selectedDueDate ? selectedDueDate.toISOString() : null,
    });
    setNewTodo("");
    setSelectedDueDate(undefined);
  };

  const handleToggleTodo = (id) => {
    const todo = todosRaw.find(t => t.id === id || t._id === id);
    if (!todo) return;
    const newStatus = todo.status === "completed" ? "pending" : "completed";
    updateTodo.mutate({ id: todo.id || todo._id, status: newStatus });
  };

  const handleDeleteTodo = (id) => {
    deleteTodo.mutate(id);
  };

  const updateAssignedTaskStatus = (taskId, newStatus) => {
    updateTaskMutation.mutate(
      {
        id: taskId,
        data: {
          status: newStatus,
          updated_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast.success(newStatus === 'completed' ? 'Task completed!' : 'Task in progress!');
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        },
        onError: (err) => {
          // This will help you see if it's still a 405 (Method) or 403 (Permission) error
          console.error("Update Error:", err);
          toast.error(err.response?.data?.detail || 'Failed to update task');
        },
      }
    );
  };
  const handlePunchAction = async (action) => {
    setLoading(true);
    try {
      await api.post('/attendance', { action });

      toast.success(
        action === 'punch_in'
          ? 'Punched in successfully!'
          : 'Punched out successfully!'
      );

      queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });

    } catch (err) {
      toast.error(err.response?.data?.detail || 'Attendance action failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Utility Helpers ─────────────────────────────────────────────────────────
  const getTodayDuration = () => {
    if (!todayAttendance?.punch_in) return "0h 0m";
    if (todayAttendance.punch_out) {
      const mins = todayAttendance.duration_minutes || 0;
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    const diffMs = Date.now() - new Date(todayAttendance.punch_in).getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  const completionRate = stats?.total_tasks > 0
    ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
    : 0;

  const nextDeadline = upcomingDueDates.length > 0
    ? upcomingDueDates.reduce((prev, curr) =>
        prev.days_remaining < curr.days_remaining ? prev : curr
      )
    : null;

  const isAdmin = user?.role === 'admin';
  const showTaskSection = isAdmin || tasksAssignedToMe.length > 0 || tasksAssignedByMe.length > 0;

  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();

  const getStatusStyle = (status) => {
    const styles = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
    };
    return styles[status] || styles.pending;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      high: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
      medium: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
      low: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    };
    return styles[priority?.toLowerCase()] || styles.medium;
  };

  const getDeadlineColor = (daysLeft) => {
    if (daysLeft <= 0) return { bg: 'bg-red-50 border-red-200 hover:bg-red-100', badge: 'bg-red-500 text-white', text: 'text-red-600' };
    if (daysLeft <= 7) return { bg: 'bg-orange-50 border-orange-200 hover:bg-orange-100', badge: 'bg-orange-500 text-white', text: 'text-orange-600' };
    if (daysLeft <= 15) return { bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100', badge: 'bg-yellow-500 text-white', text: 'text-yellow-600' };
    return { bg: 'bg-green-50 border-green-200 hover:bg-green-100', badge: 'bg-green-600 text-white', text: 'text-green-700' };
  };

  // ── Ranking Item (Memoized) ─────────────────────────────────────────────────
  const RankingItem = React.memo(({ member, index, period }) => {
    const rank = index + 1;
    const isTop = index === 0;
    const isSecond = index === 1;
    const isThird = index === 2;

    const getMedal = () => {
      if (isTop) return '🥇';
      if (isSecond) return '🥈';
      if (isThird) return '🥉';
      return `#${rank}`;
    };

    const getBgClass = () => {
      if (isTop) return "bg-gradient-to-r from-yellow-100 via-amber-50 to-yellow-50 border-yellow-300 shadow-md";
      if (isSecond) return "bg-gradient-to-r from-slate-200 via-slate-100 to-gray-200 border-slate-300";
      if (isThird) return "bg-gradient-to-r from-amber-200 via-amber-100 to-orange-200 border-amber-300";
      return "bg-slate-50 border-slate-200 hover:bg-slate-100";
    };

    return (
      <motion.div
        whileHover={{ y: -4, scale: 1.01, transition: springPhysics.lift }}
        whileTap={{ scale: 0.985, transition: springPhysics.tap }}
        className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${getBgClass()} hover:shadow-2xl hover:ring-1 hover:ring-yellow-200/50`}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 text-2xl font-bold text-center">{getMedal()}</div>
          <div className={`w-12 h-12 rounded-3xl overflow-hidden ring-2 flex-shrink-0 ${isTop ? 'ring-yellow-400' : 'ring-slate-200'}`}>
            {member.profile_picture ? (
              <img src={member.profile_picture} alt={member.user_name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full flex items-center justify-center text-white font-semibold text-2xl ${isTop ? 'bg-yellow-500' : 'bg-slate-700'}`}>
                {member.user_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className={`font-semibold text-lg ${isTop ? 'text-yellow-800' : 'text-slate-900'}`}>
              {member.user_name || 'Unknown'}
            </p>
            <p className="text-xs text-slate-500">Team Member</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs font-medium">
                {member.badge || 'Good Performer'}
              </Badge>
              <span className="text-emerald-600 font-bold text-sm">{member.overall_score}%</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tracking-tighter ${isTop ? 'text-yellow-700' : 'text-emerald-700'}`}>
            {member.total_hours
              ? `${Math.floor(member.total_hours)}h ${Math.round((member.total_hours % 1) * 60)}m`
              : '0h 00m'}
          </p>
          <p className="text-xs text-slate-500 font-medium">
            this {period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'period'}
          </p>
        </div>
      </motion.div>
    );
  });
  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good Morning ☀️";
    if (hour < 17) return "Good Afternoon 🌤️";
    if (hour < 21) return "Good Evening 🌆";
    return "Working Late? 🌙";
  };

useEffect(() => {
  
  if (!todayAttendance) {
    setMustPunchIn(false);
    document.body.style.overflow = "auto";
    return;
  }

  // 2. If user is on leave → no gate
  if (todayAttendance.status === "leave" || todayAttendance.status === "holiday") {
    setMustPunchIn(false);
    document.body.style.overflow = "auto";
    return;
  }

  // 3. Only show gate if we have a valid response and punch_in is missing
  if (todayAttendance.status === "absent" && !todayAttendance.punch_in) {
    setMustPunchIn(true);
    document.body.style.overflow = "hidden";
  } else {
    setMustPunchIn(false);
    document.body.style.overflow = "auto";
  }

  return () => {
    document.body.style.overflow = "auto";
  };
}, [todayAttendance]);
  // ── JSX Render ──────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Banner */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-xl overflow-hidden relative rounded-3xl"
          style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}
        >
          <div
            className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20 -mr-16 -mt-16"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
          />
          <CardContent className="p-8 relative">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tighter" style={{ color: COLORS.deepBlue }}>
                  Welcome back, {user?.full_name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-base">
                  Here's what's happening today — {format(new Date(), 'MMMM d, yyyy')}
                </p>
              </div>

              {nextDeadline && (
                <motion.div
                  whileHover={{ scale: 1.02, y: -2, transition: springPhysics.card }}
                  className="flex items-center gap-5 px-6 py-4 rounded-3xl border-2 cursor-pointer hover:shadow-2xl transition-all"
                  style={{ borderColor: COLORS.mediumBlue, backgroundColor: 'white' }}
                  onClick={() => navigate('/duedates')}
                >
                  <CalendarIcon className="h-7 w-7" style={{ color: COLORS.mediumBlue }} />
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Next Deadline
                    </p>
                    <p className="font-bold text-lg" style={{ color: COLORS.deepBlue }}>
                      {format(new Date(nextDeadline.due_date), 'MMM d')}: {nextDeadline.title?.slice(0, 15) || 'Deadline'}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Key Metrics */}
      <motion.div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" variants={itemVariants}>
        {/* Total Tasks */}
        <motion.div
          whileHover={{ y: -5, scale: 1.01, transition: springPhysics.card }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Tasks</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {stats?.total_tasks || 0}
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.deepBlue}15` }}>
                <Briefcase className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Overdue Tasks */}
        <motion.div
          whileHover={{ y: -5, scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks?filter=overdue')}
          className={`border shadow-sm hover:shadow-2xl transition-all cursor-pointer group rounded-3xl ${stats?.overdue_tasks > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100'}`}
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Overdue Tasks</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.coral }}>
                  {stats?.overdue_tasks || 0}
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.coral}15` }}>
                <AlertCircle className="h-6 w-6" style={{ color: COLORS.coral }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Completion Rate */}
        <motion.div
          whileHover={{ y: -5, scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/tasks')}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Completion Rate</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {completionRate}%
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.emeraldGreen}15` }}>
                <TrendingUp className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View all</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* DSC Alerts */}
        <motion.div
          whileHover={{ y: -5, scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/dsc?tab=expired')}
          className={`border shadow-sm hover:shadow-2xl transition-all cursor-pointer group rounded-3xl ${stats?.expiring_dsc_count > 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100'}`}
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">DSC Alerts</p>
                <p className="text-3xl font-bold mt-2 text-red-600">
                  {(stats?.expiring_dsc_count || 0) + (stats?.expired_dsc_count || 0)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {stats?.expired_dsc_count || 0} Expired • {stats?.expiring_dsc_count || 0} Expiring
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-red-100 group-hover:scale-125 transition-transform">
                <Key className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View alerts</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </motion.div>

        {/* Today's Attendance */}
        <motion.div
          whileHover={{ y: -5, scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => navigate('/attendance')}
          className="border border-slate-100 shadow-sm hover:shadow-2xl hover:border-slate-200 transition-all cursor-pointer group rounded-3xl"
        >
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between flex-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today's Attendance</p>
                <p className="text-3xl font-bold mt-2" style={{ color: COLORS.deepBlue }}>
                  {getTodayDuration()}
                </p>
              </div>
              <div className="p-3 rounded-2xl group-hover:scale-125 transition-transform" style={{ backgroundColor: `${COLORS.amber}15` }}>
                <Clock className="h-6 w-6" style={{ color: COLORS.amber }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-4 text-xs text-slate-500 group-hover:text-slate-700">
              <span>View details</span>
              <ChevronRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
            </div>
          </CardContent>
        </motion.div>
      </motion.div>

      {/* Recent Tasks + Deadlines + Attendance */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-4" variants={itemVariants}>
        {/* Recent Tasks */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-3">
                <Target className="h-5 w-5 text-blue-500" />
                Recent Tasks
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
                View All
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Latest assignments & progress</p>
          </CardHeader>
          <CardContent className="p-6">
            {recentTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No recent tasks</div>
            ) : (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {recentTasks.map(task => {
                    const statusStyle = getStatusStyle(task.status);
                    const priorityStyle = getPriorityStyle(task.priority);
                    return (
                      <motion.div
                        key={task.id}
                        variants={itemVariants}
                        whileHover={{ y: -2 }}
                        className={`py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-blue-300 transition ${priorityStyle.bg} ${priorityStyle.border}`}
                        onClick={() => navigate('/tasks')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-slate-900 truncate">
                            {task.title || 'Untitled Task'}
                          </p>
                          <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs w-28 justify-center`}>
                            {task.status?.replace('_', ' ')?.toUpperCase() || 'PENDING'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <CalendarIcon className="h-3 w-3" />
                          {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : 'No due date'}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-orange-500" />
                Upcoming Deadlines
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/duedates')}>
                View All
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Compliance calendar – next 30 days</p>
          </CardHeader>
          <CardContent className="p-6">
            {upcomingDueDates.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No upcoming deadlines</div>
            ) : (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {upcomingDueDates.map(due => {
                    const color = getDeadlineColor(due.days_remaining || 0);
                    return (
                      <motion.div
                        key={due.id}
                        variants={itemVariants}
                        whileHover={{ y: -2 }}
                        className={`py-3 px-4 rounded-2xl border cursor-pointer hover:shadow-md hover:border-orange-300 transition ${color.bg}`}
                        onClick={() => navigate('/duedates')}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-slate-900 truncate">
                            {due.title || 'Untitled Deadline'}
                          </p>
                          <Badge className={`${color.badge} text-xs w-24 justify-center`}>
                            {due.days_remaining > 0 ? `${due.days_remaining}d left` : 'Overdue'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(due.due_date), 'MMM d, yyyy')}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-3">
                <Activity className="h-5 w-5 text-purple-500" />
                Attendance
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/attendance')}>
                View Log
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Track daily work hours</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {todayAttendance?.punch_in ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <LogIn className="h-4 w-4 text-green-500" />
                      Punch In
                    </div>
                    <span className="font-medium">{format(new Date(todayAttendance.punch_in), 'hh:mm a')}</span>
                  </div>

                  {todayAttendance.punch_out ? (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <LogOut className="h-4 w-4 text-red-500" />
                        Punch Out
                      </div>
                      <span className="font-medium">{format(new Date(todayAttendance.punch_out), 'hh:mm a')}</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handlePunchAction('punch_out')}
                      className="w-full bg-red-600 hover:bg-red-700 rounded-2xl"
                      disabled={loading}
                    >
                      Punch Out
                    </Button>
                  )}

                  <div className="text-center py-4 bg-slate-50 rounded-2xl">
                    <p className="text-sm text-slate-500">Total Hours Today</p>
                    <p className="text-3xl font-bold" style={{ color: COLORS.deepBlue }}>
                      {getTodayDuration()}
                    </p>
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => handlePunchAction('punch_in')}
                  className="w-full bg-green-600 hover:bg-green-700 rounded-2xl"
                  disabled={loading}
                >
                  Punch In
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Assigned Tasks – Two Columns */}
      {showTaskSection && (
        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Tasks Assigned to Me */}
          <Card
            className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-xl transition group"
            onClick={() => navigate('/tasks?filter=assigned-to-me')}
          >
            <CardHeader className="pb-4 border-b px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-semibold flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-emerald-600" />
                  Tasks Assigned to Me
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-to-me'); }}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  View All →
                </Button>
              </div>
              <p className="text-sm text-slate-500 mt-1">Tasks others gave you</p>
            </CardHeader>
            <CardContent className="p-6 flex-1">
              {tasksAssignedToMe.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-3xl">
                  No tasks assigned to you
                </div>
              ) : (
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                  <AnimatePresence>
                    {tasksAssignedToMe.map(task => (
                      <TaskStrip
                        key={task.id}
                        task={task}
                        isToMe={true}
                        assignedName={task.assigned_by_name || task.created_by_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus}
                        navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tasks Assigned by Me */}
          <Card
            className="flex flex-col border-slate-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-xl transition group"
            onClick={() => navigate('/tasks?filter=assigned-by-me')}
          >
            <CardHeader className="pb-4 border-b px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-semibold flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                  Tasks Assigned by Me
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={e => { e.stopPropagation(); navigate('/tasks?filter=assigned-by-me'); }}
                  className="text-blue-600 hover:text-blue-700"
                >
                  View All →
                </Button>
              </div>
              <p className="text-sm text-slate-500 mt-1">Tasks you delegated</p>
            </CardHeader>
            <CardContent className="p-6 flex-1">
              {tasksAssignedByMe.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-3xl">
                  No tasks assigned yet
                </div>
              ) : (
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                  <AnimatePresence>
                    {tasksAssignedByMe.map(task => (
                      <TaskStrip
                        key={task.id}
                        task={task}
                        isToMe={false}
                        assignedName={task.assigned_to_name || 'Unknown'}
                        onUpdateStatus={updateAssignedTaskStatus}
                        navigate={navigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Star Performers + To-Do List */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Star Performers */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-yellow-500" />
                Star Performers
              </CardTitle>
              {isAdmin && (
                <div className="flex gap-1">
                  {["all", "monthly", "weekly"].map(p => (
                    <Button
                      key={p}
                      variant={rankingPeriod === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRankingPeriod(p)}
                      className="text-xs px-3 py-1 rounded-2xl"
                    >
                      {p.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Top contributors by performance</p>
          </CardHeader>
          <CardContent className="p-6">
            {rankings.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No ranking data</div>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {rankings.slice(0, 5).map((member, i) => (
                    <RankingItem key={member.user_id || i} member={member} index={i} period={rankingPeriod} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {rankings.length > 5 && (
              <div className="text-right mt-4">
                <button onClick={() => navigate('/reports')} className="text-sm text-blue-600 hover:underline">
                  View All Rankings →
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My To-Do List */}
        <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b px-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold flex items-center gap-3">
                <CheckSquare className="h-5 w-5 text-blue-500" />
                My To-Do List
              </CardTitle>
              {isAdmin && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/todo-list')}>
                  View All
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Your personal tasks</p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-3 mb-6">
              <input
                type="text"
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                placeholder="Add new task..."
                className="flex-1 p-4 text-sm border border-slate-300 rounded-3xl focus:outline-none focus:border-blue-500"
              />
              <Popover open={showDueDatePicker} onOpenChange={setShowDueDatePicker}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className={cn("border-slate-300 rounded-2xl", !selectedDueDate && "text-slate-400")}>
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDueDate}
                    onSelect={date => {
                      setSelectedDueDate(date);
                      setShowDueDatePicker(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button onClick={addTodo} disabled={!newTodo.trim()} className="px-8 rounded-3xl">
                Add
              </Button>
              {selectedDueDate && (
                <span className="text-xs text-slate-500 self-center ml-3">
                  Due: {format(selectedDueDate, 'MMM d, yyyy')}
                </span>
              )}
            </div>

            {todos.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No todos yet</div>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2">
                <AnimatePresence>
                  {todos.map(todo => (
                    <motion.div
                      key={todo._id || todo.id}
                      variants={itemVariants}
                      className={`flex items-center justify-between gap-4 p-5 rounded-3xl border ${
                        todo.completed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                      } ${!todo.completed && isOverdue(todo.due_date) ? 'border-red-400 bg-red-50/60' : ''}`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => handleToggleTodo(todo._id || todo.id)}
                          className="h-5 w-5 accent-emerald-600 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`block text-sm ${todo.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                            {todo.title}
                            {!todo.completed && isOverdue(todo.due_date) && (
                              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                                Overdue
                              </span>
                            )}
                          </span>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Added: {todo.created_at ? format(new Date(todo.created_at), 'MMM d, yyyy') : 'Recently'}
                          </p>
                          {todo.due_date && (
                            <p className={`text-xs mt-0.5 ${isOverdue(todo.due_date) ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                              Due: {format(new Date(todo.due_date), 'MMM d, yyyy')}
                              {isOverdue(todo.due_date) && ' (overdue)'}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="rounded-2xl"
                        onClick={() => handleDeleteTodo(todo._id || todo.id)}
                      >
                        Delete
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

<AnimatePresence>
  {mustPunchIn && (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 40 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
        className="bg-white w-full max-w-md mx-4 p-6 md:p-10 rounded-3xl shadow-2xl text-center relative"
      >
        <motion.h2
          className="text-3xl font-bold mb-3"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
        >
          {getGreeting()}
        </motion.h2>

        <p className="text-slate-500 mb-8">
          Please punch in to begin your workday.
        </p>

<motion.div
  initial={{ y: 0 }}
  animate={{ y: [0, -2, 0] }}
  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
  whileHover={{ y: 0 }}
>
  <Button
    onClick={async () => {
      await handlePunchAction('punch_in');
      setMustPunchIn(false);
      document.body.style.overflow = "auto";
    }}
    disabled={loading}
    className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 rounded-2xl shadow-lg hover:shadow-xl transition-all"
  >
    {loading ? "Punching In..." : "Punch In"}
  </Button>
</motion.div>

<div className="mt-4">
  <Button
    variant="secondary"
    className="w-full rounded-2xl"
    onClick={async () => {
      setLoading(true);
      try {
        await api.post("/attendance/mark-leave-today");

        toast.success("Marked on leave today");

        queryClient.invalidateQueries({ queryKey: ['todayAttendance'] });

        setMustPunchIn(false);
        document.body.style.overflow = "auto";
      } catch (err) {
        toast.error("Failed to mark leave");
      } finally {
        setLoading(false);
      }
    }}
  >
    On Leave Today
  </Button>
</div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
    </motion.div>
  );
}
