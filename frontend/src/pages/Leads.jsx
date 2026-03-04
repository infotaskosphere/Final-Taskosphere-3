import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
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
            <Label className="text-right">Name</Label>
            <Input name="contact_name" value={formData.contact_name || ''} onChange={handleChange} disabled={!editMode} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Number</Label>
            <Input name="phone" value={formData.phone || ''} onChange={handleChange} onBlur={handlePhoneBlur} disabled={!editMode} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Services</Label>
            <div className="col-span-3 grid gap-2" disabled={!editMode}>
              {DEPARTMENTS.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <Checkbox 
                    id={d.value} 
                    checked={selectedServices.includes(d.value)} 
                    onCheckedChange={() => handleServiceToggle(d.value)}
                    disabled={!editMode}
                  />
                  <label htmlFor={d.value} className="text-sm">{d.label}</label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="other" 
                  checked={otherChecked} 
                  onCheckedChange={setOtherChecked}
                  disabled={!editMode}
                />
                <label htmlFor="other" className="text-sm">Other</label>
              </div>
              {otherChecked && (
                <Input 
                  value={otherValue} 
                  onChange={(e) => setOtherValue(e.target.value)} 
                  placeholder="Specify other service" 
                  className="mt-2"
                  disabled={!editMode}
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Approx Quote</Label>
            <Input name="approx_quote" type="number" value={formData.approx_quote || ''} onChange={handleChange} disabled={!editMode} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Date of Meeting</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("col-span-3 justify-start text-left font-normal", !meetingDate && "text-muted-foreground")}
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
            <Label className="text-right">Assigned To</Label>
            <Select
              value={formData.assigned_to?.toString() || 'unassigned'}
              onValueChange={(val) => setFormData(p => ({ ...p, assigned_to: val === 'unassigned' ? null : val }))}
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Next Follow-up</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("col-span-3 justify-start text-left font-normal", !date && "text-muted-foreground")}
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
            <Label className="text-right">AI Probability</Label>
            <div className="col-span-3 flex items-center gap-4">
              <div className="flex-1">
                <Progress value={formData.closure_probability ?? 0} className="w-full h-2" />
                <p className="text-xs text-slate-500 mt-1">{formData.closure_probability ?? 0}% Probability</p>
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
              {formData.status !== 'won' && formData.status !== 'lost' && (
                <>
                  <Button variant="success" className="bg-green-600 hover:bg-green-700" onClick={() => onConvert(formData.id)}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Convert to Won
                  </Button>
                  <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={() => onCloseAsLost(formData.id)}>
                    <XCircle className="mr-2 h-4 w-4" /> Close as Lost
                  </Button>
                </>
              )}
              {formData.status === 'won' && (
                <Button onClick={onOpenClientModal}>
                  <Plus className="mr-2 h-4 w-4" /> Add to Client
                </Button>
              )}
              <Button variant="destructive" onClick={() => onDelete(formData.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
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
  const [formData, setFormData] = useState({ company_name: '', contact_name: '', phone: '', approx_quote: '', status: 'new', source: 'direct', assigned_to: 'unassigned', notes: '' });
  const [meetingDate, setMeetingDate] = useState(undefined);
  const [selectedServices, setSelectedServices] = useState([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherValue, setOtherValue] = useState('');
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
    onCreate({ ...formData, services, date_of_meeting: meetingDate });
    setFormData({ company_name: '', contact_name: '', phone: '', approx_quote: '', status: 'new', source: 'direct', assigned_to: 'unassigned', notes: '' });
    setMeetingDate(undefined);
    setSelectedServices([]);
    setOtherChecked(false);
    setOtherValue('');
    onClose();
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Company*</Label>
            <Input name="company_name" value={formData.company_name} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Name</Label>
            <Input name="contact_name" value={formData.contact_name} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Number*</Label>
            <Input name="phone" value={formData.phone} onChange={handleChange} onBlur={handlePhoneBlur} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Services*</Label>
            <div className="col-span-3 grid gap-2">
              {DEPARTMENTS.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <Checkbox 
                    id={d.value} 
                    checked={selectedServices.includes(d.value)} 
                    onCheckedChange={() => handleServiceToggle(d.value)}
                  />
                  <label htmlFor={d.value} className="text-sm">{d.label}</label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="other" 
                  checked={otherChecked} 
                  onCheckedChange={setOtherChecked}
                />
                <label htmlFor="other" className="text-sm">Other</label>
              </div>
              {otherChecked && (
                <Input 
                  value={otherValue} 
                  onChange={(e) => setOtherValue(e.target.value)} 
                  placeholder="Specify other service" 
                  className="mt-2"
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Approx Quote</Label>
            <Input name="approx_quote" type="number" value={formData.approx_quote} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Date of Meeting</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("col-span-3 justify-start text-left font-normal", !meetingDate && "text-muted-foreground")}
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
            <Label className="text-right">Assigned To</Label>
            <Select value={formData.assigned_to} onValueChange={(val) => setFormData(p => ({ ...p, assigned_to: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Notes</Label>
            <Textarea name="notes" value={formData.notes} onChange={handleChange} className="col-span-3 min-h-[100px]" />
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Company*</Label>
            <Input name="company_name" value={formData.company_name} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Name</Label>
            <Input name="contact_name" value={formData.contact_name} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Number*</Label>
            <Input name="phone" value={formData.phone} onChange={handleChange} onBlur={handlePhoneBlur} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Email</Label>
            <Input name="email" value={formData.email} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Address</Label>
            <Input name="address" value={formData.address} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Services*</Label>
            <div className="col-span-3 grid gap-2">
              {DEPARTMENTS.map(d => (
                <div key={d.value} className="flex items-center gap-2">
                  <Checkbox 
                    id={d.value} 
                    checked={selectedServices.includes(d.value)} 
                    onCheckedChange={() => handleServiceToggle(d.value)}
                  />
                  <label htmlFor={d.value} className="text-sm">{d.label}</label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="other" 
                  checked={otherChecked} 
                  onCheckedChange={setOtherChecked}
                />
                <label htmlFor="other" className="text-sm">Other</label>
              </div>
              {otherChecked && (
                <Input 
                  value={otherValue} 
                  onChange={(e) => setOtherValue(e.target.value)} 
                  placeholder="Specify other service" 
                  className="mt-2"
                />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit}><Plus className="mr-2 h-4 w-4" /> Create Client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// ─────────────────────────────────────────────────────────────
// Task Creation Modal
// ─────────────────────────────────────────────────────────────
function TaskCreationModal({ isOpen, onClose, lead, users, onCreateTask }) {
  const [taskData, setTaskData] = useState({
    title: '', description: '', assigned_to: 'unassigned', priority: 'medium',
    category: 'other', is_recurring: false, recurrence_pattern: 'monthly', recurrence_interval: 1
  });
  useEffect(() => {
    if (lead) {
      const servicesStr = (lead.services || []).join(', ');
      const customDescription = `Please contact ${lead.contact_name || lead.company_name} for ${servicesStr} on this ${formatPhone(lead.phone)} and send document checklist, and get the work done.`;
      setTaskData(prev => ({
        ...prev,
        title: `Follow-up: ${lead.company_name ?? ''}`,
        description: customDescription,
        assigned_to: lead.assigned_to?.toString() ?? 'unassigned',
        category: lead.services?.[0] ?? 'other'
      }));
    }
  }, [lead, isOpen]);
  const handleWorkflowChange = (workflowId) => {
    const workflow = COMPLIANCE_WORKFLOWS.find(w => w.id === parseInt(workflowId));
    if (workflow) {
      setTaskData(prev => ({
        ...prev,
        title: workflow.title ?? prev.title,
        description: workflow.description ?? prev.description,
        category: workflow.category ?? prev.category,
        priority: workflow.priority ?? prev.priority,
        is_recurring: !!workflow.recurrence_pattern,
        recurrence_pattern: workflow.recurrence_pattern ?? prev.recurrence_pattern,
        recurrence_interval: workflow.recurrence_interval ?? prev.recurrence_interval
      }));
    }
  };
  const handleChange = (e) => {
    const { name, value } = e.target;
    setTaskData(prev => ({ ...prev, [name]: value }));
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Create Follow-up Task</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Workflow</Label>
            <Select onValueChange={handleWorkflowChange}>
              <SelectTrigger className="col-span-3"><SelectValue placeholder="Select predefined workflow" /></SelectTrigger>
              <SelectContent>
                {COMPLIANCE_WORKFLOWS.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Title</Label>
            <Input name="title" value={taskData.title} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">Description</Label>
            <Textarea name="description" value={taskData.description} onChange={handleChange} className="col-span-3 min-h-[100px]" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Category</Label>
            <Select value={taskData.category} onValueChange={(val) => setTaskData(p => ({ ...p, category: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                <SelectItem value="other">OTHER</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Priority</Label>
            <Select value={taskData.priority} onValueChange={(val) => setTaskData(p => ({ ...p, priority: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Assigned To</Label>
            <Select value={taskData.assigned_to} onValueChange={(val) => setTaskData(p => ({ ...p, assigned_to: val }))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Recurring</Label>
            <div className="col-span-3 flex items-center gap-4">
              <Checkbox
                checked={taskData.is_recurring}
                onCheckedChange={(checked) => setTaskData(p => ({ ...p, is_recurring: checked }))}
              />
              <span className="text-sm text-slate-600">Enable recurring task</span>
            </div>
          </div>
          {taskData.is_recurring && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Pattern</Label>
                <Select value={taskData.recurrence_pattern} onValueChange={(val) => setTaskData(p => ({ ...p, recurrence_pattern: val }))}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_PATTERNS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Interval</Label>
                <Input
                  type="number"
                  min="1"
                  value={taskData.recurrence_interval}
                  onChange={(e) => setTaskData(p => ({ ...p, recurrence_interval: parseInt(e.target.value) || 1 }))}
                  className="col-span-3"
                />
              </div>
            </>
          )}
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
      if (res.data.status === 'won') {
        setClosedLead(res.data);
        setShowTaskModal(true);
      }
    }
  });
  const convertMutation = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/convert`),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Converted to Won');
      setClosedLead(res.data);
      setShowTaskModal(true);
      setSelectedLead(res.data); // Update selectedLead to reflect won status
    }
  });
  const closeAsLostMutation = useMutation({
    mutationFn: (id) => api.patch(`/leads/${id}`, { status: 'lost' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Closed as Lost');
      setSelectedLead(null);
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead deleted');
      setSelectedLead(null);
    },
    onError: () => toast.error('Failed to delete lead')
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
      {isLoading ? (
        <div className="text-center">Loading...</div>
      ) : (
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
        onDelete={(id) => {
          if (window.confirm('Are you sure you want to delete this lead?')) {
            deleteMutation.mutate(id);
          }
        }}
      />
      <LeadCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        users={users}
        onCreate={(data) => api.post('/leads', data).then(() => queryClient.invalidateQueries(['leads']))}
      />
      <ClientCreateModal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        lead={selectedLead}
        onCreate={(data) => api.post('/clients', data).then(() => { toast.success("Client created"); queryClient.invalidateQueries(['leads']); })}
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
