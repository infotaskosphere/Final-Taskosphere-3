import React, { useState, useMemo } from 'react';
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";  // ✅ NEW: For displaying probability as progress bar
import { cn } from "@/lib/utils";
import {
  UserPlus,
  Phone,
  User,
  Search,
  Filter,
  Send,
  Target,
  Zap,
  Edit,
  Save,
  X,
  CheckCircle,
  XCircle,
  Plus,
  CalendarIcon,
  Brain,  // ✅ NEW: Icon for AI feature
  FileText,
  Repeat,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Task Constants from Tasks Page
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

// Predefined task categories
const TASK_CATEGORIES = DEPARTMENTS;

// Recurrence pattern options
const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// ==================== ENHANCED: CA/CS COMPLIANCE WORKFLOW TEMPLATES (14 Rich Templates) ====================
const COMPLIANCE_WORKFLOWS = [
  {
    id: 1,
    name: "Monthly GST Compliance",
    category: "gst",
    title: "Monthly GST Filing - GSTR-1 & GSTR-3B",
    description: "- Reconcile GSTR-2B with purchase register\n- Prepare GSTR-1 (B2B/B2C/CDNR)\n- File GSTR-3B\n- Pay tax & generate challan\n- Reconcile ITC\n- Review for notices\n- Update books of accounts\n- Check HSN/SAC codes",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 5,
    estimatedHours: 18,
    frequency: "Monthly"
  },
  {
    id: 2,
    name: "Quarterly TDS Compliance",
    category: "tds",
    title: "Quarterly TDS Return - 24Q/26Q/27Q",
    description: "- Download Form 16A/27D from TRACES\n- Reconcile TDS with books\n- Prepare & file quarterly return\n- Generate TDS certificates\n- Pay TDS before due date\n- Update challan status\n- Check late fee/interest",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "high",
    estimatedDays: 7,
    estimatedHours: 22,
    frequency: "Quarterly"
  },
  {
    id: 3,
    name: "ROC Annual Filing (Private Ltd)",
    category: "roc",
    title: "Annual ROC Filing - AOC-4 & MGT-7",
    description: "- Prepare financial statements\n- File AOC-4 XBRL\n- File MGT-7\n- File MGT-8 (if applicable)\n- Board & AGM minutes\n- DIR-12 for director changes\n- Check DIN status\n- Update registers",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 15,
    estimatedHours: 45,
    frequency: "Annual"
  },
  {
    id: 4,
    name: "Income Tax Return (Company)",
    category: "income_tax",
    title: "ITR-6 Filing + Tax Audit (if applicable)",
    description: "- Reconcile 26AS & AIS\n- Prepare ITR-6\n- File Tax Audit Report (3CD)\n- Pay advance tax / self assessment tax\n- Check Form 3CA/3CB\n- Upload balance sheet\n- Claim deductions u/s 10AA/80\n- MAT calculation",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 20,
    estimatedHours: 55,
    frequency: "Annual"
  },
  {
    id: 5,
    name: "DSC Renewal & PAN TAN",
    category: "dsc",
    title: "DSC Renewal + PAN/TAN Compliance",
    description: "- Check DSC expiry (30 days prior)\n- Renew Class 3 DSC\n- Update PAN/TAN details\n- Link Aadhaar with PAN\n- Update DSC in MCA & GST portal\n- Verify e-filing credentials",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "medium",
    estimatedDays: 3,
    estimatedHours: 8,
    frequency: "Annual"
  },
  {
    id: 6,
    name: "MSME Samadhan Filing",
    category: "msme_smadhan",
    title: "MSME Delayed Payment Complaint",
    description: "- Identify delayed payments >45 days\n- File Udyam Samadhan application\n- Follow up with buyer\n- Generate reference number\n- Monitor status on portal\n- Prepare supporting documents",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "medium",
    estimatedDays: 4,
    estimatedHours: 12,
    frequency: "Monthly"
  },
  {
    id: 7,
    name: "FEMA Annual Return",
    category: "fema",
    title: "FC-GPR / FLA / Annual FEMA Return",
    description: "- Collect foreign investment details\n- File FLA return on RBI portal\n- File FC-GPR for fresh allotment\n- File FC-TRS for transfer\n- Maintain LOU/LOC records\n- Check ECB compliance",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 10,
    estimatedHours: 30,
    frequency: "Annual"
  },
  {
    id: 8,
    name: "Trademark Renewal",
    category: "trademark",
    title: "Trademark Renewal & Monitoring",
    description: "- Check renewal due date (6 months prior)\n- File TM-R application\n- Pay renewal fee\n- Monitor opposition period\n- File TM-M for modification\n- Update trademark register",
    recurrence_pattern: "yearly",
    recurrence_interval: 10,
    priority: "medium",
    estimatedDays: 5,
    estimatedHours: 15,
    frequency: "Every 10 Years"
  },
  {
    id: 9,
    name: "GSTR-9 Annual Reconciliation",
    category: "gst",
    title: "Annual GST Return - GSTR-9 & GSTR-9C",
    description: "- Reconcile GSTR-1, 3B & 2B\n- Prepare GSTR-9\n- Audit GSTR-9C (if turnover >5Cr)\n- Reconcile ITC & output tax\n- File before 31st Dec",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 12,
    estimatedHours: 35,
    frequency: "Annual"
  },
  {
    id: 10,
    name: "PF & ESIC Monthly",
    category: "accounts",
    title: "Monthly PF & ESIC Contribution & Return",
    description: "- Calculate PF & ESIC on salary\n- Deposit contribution by 15th\n- File ECR return\n- Reconcile challan\n- Generate Form 3A/6A",
    recurrence_pattern: "monthly",
    recurrence_interval: 1,
    priority: "high",
    estimatedDays: 3,
    estimatedHours: 10,
    frequency: "Monthly"
  },
  {
    id: 11,
    name: "Board Meeting Compliance",
    category: "roc",
    title: "Quarterly Board Meeting & Minutes",
    description: "- Schedule board meeting\n- Prepare agenda & notes\n- Record minutes in MBP-1\n- File MGT-14 for resolutions\n- Update registers",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "medium",
    estimatedDays: 4,
    estimatedHours: 14,
    frequency: "Quarterly"
  },
  {
    id: 12,
    name: "Income Tax TDS/TCS Quarterly",
    category: "tds",
    title: "TDS/TCS Quarterly Return & Certificates",
    description: "- File 26Q/27Q/27EQ\n- Issue Form 16/16A\n- Reconcile with 26AS\n- Pay late fee if any",
    recurrence_pattern: "monthly",
    recurrence_interval: 3,
    priority: "high",
    estimatedDays: 6,
    estimatedHours: 20,
    frequency: "Quarterly"
  },
  {
    id: 13,
    name: "Company Secretarial Annual",
    category: "roc",
    title: "Annual Secretarial Compliance Package",
    description: "- AGM Notice & Minutes\n- File AOC-4, MGT-7\n- DIR-3 KYC\n- DPT-3 if applicable\n- MBP-1, MBP-2 update",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 18,
    estimatedHours: 50,
    frequency: "Annual"
  },
  {
    id: 14,
    name: "GST Annual Audit (if applicable)",
    category: "gst",
    title: "GST Audit u/s 35(5) + GSTR-9C",
    description: "- Reconcile books with GST returns\n- Prepare reconciliation statement\n- File GSTR-9C\n- Issue audit report",
    recurrence_pattern: "yearly",
    recurrence_interval: 1,
    priority: "critical",
    estimatedDays: 25,
    estimatedHours: 60,
    frequency: "Annual"
  },
];

// ─────────────────────────────────────────────────────────────
// Lead Card
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
            <Badge className="text-[10px] uppercase font-bold bg-slate-100">
              {lead.source || 'manual'}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-bold">
              {lead.status || 'new'}
            </Badge>
          </div>
          <h3 className="text-lg font-bold text-slate-900 truncate">
            {lead.company_name}
          </h3>
        </div>
        <div className="p-3 rounded-2xl bg-slate-50">
          {isTelegram ? (
            <Send className="w-5 h-5 text-sky-500" />
          ) : (
            <UserPlus className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <Phone className="w-4 h-4" />
          <span>{lead.phone || '—'}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <User className="w-4 h-4" />
          <span>{assignee?.full_name || 'Not Assigned'}</span>
        </div>
        {/* ✅ NEW: Display closure probability in card */}
        {lead.closure_probability !== null && (
          <div className="flex items-center gap-2 text-slate-600">
            <Brain className="w-4 h-4 text-purple-500" />
            <span>Close Chance: {lead.closure_probability}%</span>
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between pt-4 border-t">
        <p className="text-xs text-slate-400">
          {lead.created_at
            ? format(new Date(lead.created_at), 'MMM d • h:mm a')
            : ''}
        </p>
        {isAdmin && (
          <Select onValueChange={(val) => onAssign(lead.id, val)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Assign" />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

  // Sync state when lead changes or modal opens
  React.useEffect(() => {
    if (lead) {
      setFormData(lead);
      setDate(lead.next_follow_up ? new Date(lead.next_follow_up) : undefined);
    } else {
      setFormData({});
      setDate(undefined);
    }
    setEditMode(false); // Reset edit mode on lead change
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{formData.company_name || 'Lead Details'}</DialogTitle>
          <DialogDescription>View or manage lead information and conversion.</DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="company_name" className="text-right font-semibold">Company</Label>
            <Input
              id="company_name"
              name="company_name"
              value={formData.company_name || ''}
              onChange={handleChange}
              disabled={!editMode}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contact_person" className="text-right font-semibold">Contact</Label>
            <Input
              id="contact_person"
              name="contact_person"
              value={formData.contact_person || ''}
              onChange={handleChange}
              disabled={!editMode}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right font-semibold">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email || ''}
              onChange={handleChange}
              disabled={!editMode}
              className="col-span-3"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right font-semibold">Phone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone || ''}
              onChange={handleChange}
              disabled={!editMode}
              className="col-span-3"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="service" className="text-right font-semibold">Service</Label>
            <Select
              value={formData.service || ''}
              onValueChange={(val) => setFormData(prev => ({ ...prev, service: val }))}
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gst">GST</SelectItem>
                <SelectItem value="income_tax">INCOME TAX</SelectItem>
                <SelectItem value="accounts">ACCOUNTS</SelectItem>
                <SelectItem value="tds">TDS</SelectItem>
                <SelectItem value="roc">ROC</SelectItem>
                <SelectItem value="trademark">TRADEMARK</SelectItem>
                <SelectItem value="msme_smadhan">MSME SMADHAN</SelectItem>
                <SelectItem value="fema">FEMA</SelectItem>
                <SelectItem value="dsc">DSC</SelectItem>
                <SelectItem value="other">OTHER</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right font-semibold">Status</Label>
            <Select
              value={formData.status || ''}
              onValueChange={(val) => setFormData(prev => ({ ...prev, status: val }))}
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="assigned_to" className="text-right font-semibold">Assigned To</Label>
            <Select
              value={formData.assigned_to || ''}
              onValueChange={(val) => setFormData(prev => ({ ...prev, assigned_to: val }))}
              disabled={!editMode}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Next Follow Up</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
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

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="notes" className="text-right pt-2 font-semibold">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              disabled={!editMode}
              className="col-span-3 min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4 pt-2 border-t">
            <Label className="text-right font-semibold">Close Chance</Label>
            <div className="col-span-3 flex items-center gap-4">
              {formData.closure_probability !== undefined && formData.closure_probability !== null ? (
                <div className="flex-1">
                  <Progress value={formData.closure_probability} className="w-full h-2" />
                  <p className="text-xs text-slate-500 mt-1">{formData.closure_probability}% Probability</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Not analyzed</p>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onPredict(formData.id)} 
                disabled={editMode || !formData.notes}
              >
                <Brain className="mr-2 h-4 w-4 text-purple-500" /> Analyze
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {!editMode ? (
            <>
              <Button variant="outline" onClick={() => setEditMode(true)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
              </Button>
              {formData.status !== 'won' && formData.status !== 'lost' && (
                <>
                  <Button variant="success" className="bg-green-600 hover:bg-green-700" onClick={() => onConvert(formData.id)}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Convert to Won
                  </Button>
                  <Button variant="destructive" onClick={() => onCloseAsLost(formData.id)}>
                    <XCircle className="mr-2 h-4 w-4" /> Lost
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditMode(false)}>
                <X className="mr-2 h-4 w-4" /> Cancel
              </Button>
              <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">
                <Save className="mr-2 h-4 w-4" /> Save Changes
              </Button>
            </>
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
  const [formData, setFormData] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    service: '',
    status: 'new',
    source: 'direct',
    assigned_to: '',
    notes: '',
  });
  const [date, setDate] = useState(undefined);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!formData.company_name) {
      toast.error('Company name is required');
      return;
    }
    onCreate({ ...formData, next_follow_up: date });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
          <DialogDescription>Enter lead details below.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="company_name" className="text-right">Company*</Label>
            <Input
              id="company_name"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contact_person" className="text-right">Contact</Label>
            <Input
              id="contact_person"
              name="contact_person"
              value={formData.contact_person}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">Email</Label>
            <Input
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">Phone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="service" className="text-right">Service</Label>
            <Select
              value={formData.service}
              onValueChange={(val) => setFormData(prev => ({ ...prev, service: val }))}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gst">GST</SelectItem>
                <SelectItem value="income_tax">INCOME TAX</SelectItem>
                <SelectItem value="accounts">ACCOUNTS</SelectItem>
                <SelectItem value="tds">TDS</SelectItem>
                <SelectItem value="roc">ROC</SelectItem>
                <SelectItem value="trademark">TRADEMARK</SelectItem>
                <SelectItem value="msme_smadhan">MSME SMADHAN</SelectItem>
                <SelectItem value="fema">FEMA</SelectItem>
                <SelectItem value="dsc">DSC</SelectItem>
                <SelectItem value="other">OTHER</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(val) => setFormData(prev => ({ ...prev, status: val }))}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="source" className="text-right">Source</Label>
            <Select
              value={formData.source}
              onValueChange={(val) => setFormData(prev => ({ ...prev, source: val }))}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="assigned_to" className="text-right">Assigned To</Label>
            <Select
              value={formData.assigned_to}
              onValueChange={(val) => setFormData(prev => ({ ...prev, assigned_to: val }))}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="next_follow_up" className="text-right">Next Follow Up</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="notes" className="text-right pt-2">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit}>
            <Plus className="mr-2 h-4 w-4" /> Create Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Task Creation Modal (Triggered on Close)
// ─────────────────────────────────────────────────────────────
function TaskCreationModal({ isOpen, onClose, lead, users, onCreateTask }) {
  const [taskData, setTaskData] = useState({
    title: `Follow-up on ${lead?.company_name} Lead`,
    description: lead?.notes || '',
    assigned_to: lead?.assigned_to || '',
    due_date: null,
    priority: 'medium',
    status: 'pending',
    category: lead?.service || 'other',
    is_recurring: false,
    recurrence_pattern: 'monthly',
    recurrence_interval: 1,
  });
  const [date, setDate] = useState(undefined);

  // ... (keep your existing useMemo and applyWorkflow logic)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px]">
        {/* ... Header and other fields ... */}

        {/* REPLACED SWITCH WITH NATIVE CHECKBOX HERE */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label className="text-right font-semibold">Recurring</Label>
          <div className="col-span-3 flex items-center gap-4">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              checked={taskData.is_recurring}
              onChange={(e) => setTaskData(prev => ({ ...prev, is_recurring: e.target.checked }))}
            />
            <span className="text-sm text-slate-600">Enable recurring task</span>
            
            {taskData.is_recurring && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                <Select
                  value={taskData.recurrence_pattern}
                  onValueChange={(val) => setTaskData(prev => ({ ...prev, recurrence_pattern: val }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_PATTERNS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={taskData.recurrence_interval}
                  onChange={(e) => setTaskData(prev => ({ ...prev, recurrence_interval: parseInt(e.target.value) || 1 }))}
                  className="w-20"
                />
              </div>
            )}
          </div>
        </div>

        {/* ... Footer ... */}
      </DialogContent>
    </Dialog>
  );
}
// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [closedLead, setClosedLead] = useState(null);
  const isAdmin = user?.role === 'admin';
  const hasLeadPermission = user?.permissions?.can_view_all_leads;

  // ── Fetch Leads ──
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', statusFilter],
    queryFn: () => api.get(`/leads${statusFilter ? `?status=${statusFilter}` : ''}`).then(res => res.data),
  });

  // ── Fetch Users ──
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data),
  });

  // ── Mutations ──
  const assignMutation = useMutation({
    mutationFn: ({ id, staffId }) =>
      api.patch(`/leads/${id}`, { assigned_to: staffId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead assigned successfully');
    },
    onError: () => {
      toast.error('Failed to assign lead');
    }
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/leads', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead created successfully');
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error('Failed to create lead');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/leads/${id}`, data),
    onSuccess: (updatedLead) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead updated successfully');
      setSelectedLead(updatedLead);  // Update modal data
      if (updatedLead.status === 'won' || updatedLead.status === 'lost') {
        setClosedLead(updatedLead);
        setShowTaskModal(true);
      }
    },
    onError: () => {
      toast.error('Failed to update lead');
    }
  });

  const convertMutation = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/convert`),
    onSuccess: () => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Lead converted to client successfully');
      setClosedLead({ ...selectedLead, status: 'won' });
      setShowTaskModal(true);
      setSelectedLead(null);
    },
    onError: () => {
      toast.error('Failed to convert lead');
    }
  });

  const predictMutation = useMutation({
    mutationFn: (id) => api.post(`/leads/${id}/predict_closure`),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['leads']);
      toast.success('Closure probability calculated');
      setSelectedLead(prev => ({ ...prev, closure_probability: data.closure_probability }));
    },
    onError: () => {
      toast.error('Failed to calculate probability');
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: (task) => api.post('/tasks', task),  // Assuming /tasks endpoint exists
    onSuccess: () => {
      toast.success('Task created successfully');
      setShowTaskModal(false);
    },
    onError: () => {
      toast.error('Failed to create task');
    }
  });

  // ── Filtering ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l =>
      (l.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone?.includes(searchTerm)) 
    );
  }, [leads, searchTerm]);

  // Permission guard
  if (!isAdmin && !hasLeadPermission) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Card className="p-10 text-center">
          <h2 className="text-2xl font-bold">Restricted Area</h2>
          <p className="text-slate-500 mt-2">
            You don’t have permission to view leads.
          </p>
          <Button onClick={() => navigate('/')} className="mt-6">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Leads Pipeline</h1>
        <div className="flex gap-4">
          <div className="relative w-72">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search leads..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total</p>
            <h3 className="text-2xl font-bold">{leads.length}</h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Telegram</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => l.source === 'telegram').length}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Unassigned</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => !l.assigned_to).length}
            </h3>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Won</p>
            <h3 className="text-2xl font-bold">
              {leads.filter(l => l.status === 'won').length}
            </h3>
          </CardContent>
        </Card>
      </div>
      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredLeads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              users={users}
              isAdmin={isAdmin}
              onAssign={(id, staffId) =>
                assignMutation.mutate({ id, staffId })
              }
              onOpenDetails={setSelectedLead}
            />
          ))}
        </AnimatePresence>
        {filteredLeads.length === 0 && !isLoading && (
          <div className="col-span-full text-center py-20 text-slate-400">
            No leads found.
          </div>
        )}
      </div>

      {/* Modals */}
      <LeadDetailsModal
        lead={selectedLead}
        users={users}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        onConvert={(id) => convertMutation.mutate(id)}
        onCloseAsLost={(id) => updateMutation.mutate({ id, data: { status: 'lost' } })}
        onPredict={(id) => predictMutation.mutate(id)}
      />
      <LeadCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        users={users}
        onCreate={(data) => createMutation.mutate(data)}
      />
      <TaskCreationModal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        lead={closedLead}
        users={users}
        onCreateTask={(task) => createTaskMutation.mutate(task)}
      />
    </div>
  );
}
