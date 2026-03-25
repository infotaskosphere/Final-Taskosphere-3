import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  KeyRound, Plus, Search, Eye, EyeOff, Copy, Edit2, Trash2,
  Globe, Shield, Lock, AlertTriangle, X, Check, RefreshCw,
  Clock, User as UserIcon, Tag, Building2, FileText, Activity,
  Filter, ExternalLink, MessageCircle, Phone, Send, Download,
  Upload, FileUp, ChevronDown, Users, LayoutGrid, List, Link2,
  TableProperties, Sheet, RefreshCcw, Info, Loader2, CreditCard,
  Hash, ArrowRight, CheckCircle2, AlertCircle, HelpCircle, Zap,
  SortAsc, SortDesc, ChevronLeft, ChevronRight, ChevronUp,
  ExternalLink as AutoFillIcon, Smartphone, Store, ArrowUpDown,
  Calendar, Star, BadgeCheck, Trash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

// ── Brand palette ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  coral:        '#FF6B6B',
  whatsapp:     '#25D366',
  whatsappDark: '#128C7E',
  amber:        '#F59E0B',
  purple:       '#7C3AED',
};

const springMed  = { type: 'spring', stiffness: 340, damping: 24 };
const springFast = { type: 'spring', stiffness: 500, damping: 30 };

// ── Portal type meta ──────────────────────────────────────────────────────────
const PORTAL_META = {
  MCA:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', icon: '🏛️', fullName: 'Ministry of Corporate Affairs / ROC' },
  ROC:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', icon: '🏛️', fullName: 'Registrar of Companies / MCA' },
  DGFT:       { label: 'DGFT',       color: '#065F46', bg: '#ECFDF5', icon: '🌐', fullName: 'Directorate General of Foreign Trade' },
  TRADEMARK:  { label: 'Trademark',  color: '#0F766E', bg: '#F0FDFA', icon: '™️',  fullName: 'Trademark / IP India' },
  GST:        { label: 'GST',        color: '#7C3AED', bg: '#F5F3FF', icon: '📊', fullName: 'GST Portal' },
  INCOME_TAX: { label: 'Income Tax', color: '#DC2626', bg: '#FEF2F2', icon: '💰', fullName: 'Income Tax India' },
  TDS:        { label: 'TDS',        color: '#B45309', bg: '#FFFBEB', icon: '🧾', fullName: 'TDS / TRACES' },
  TRACES:     { label: 'TRACES',     color: '#B45309', bg: '#FFFBEB', icon: '🔍', fullName: 'TRACES Portal' },
  EPFO:       { label: 'EPFO',       color: '#1D4ED8', bg: '#EFF6FF', icon: '👷', fullName: 'EPFO / PF Portal' },
  ESIC:       { label: 'ESIC',       color: '#0369A1', bg: '#F0F9FF', icon: '🏥', fullName: 'ESIC Portal' },
  MSME:       { label: 'MSME',       color: '#92400E', bg: '#FEF3C7', icon: '🏭', fullName: 'MSME Samadhaan' },
  RERA:       { label: 'RERA',       color: '#4B5563', bg: '#F9FAFB', icon: '🏗️', fullName: 'RERA Portal' },
  OTHER:      { label: 'Other',      color: '#6B7280', bg: '#F9FAFB', icon: '🔗', fullName: 'Custom / Other Portal' },
};

const PORTAL_TYPES = Object.keys(PORTAL_META);
const DEPARTMENTS  = ['GST', 'IT', 'ACC', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'OTHER'];
const HOLDER_TYPES = ['COMPANY', 'DIRECTOR', 'INDIVIDUAL', 'PARTNER', 'TRUSTEE', 'OTHER'];
const SHEET_TYPES  = ['GST', 'ROC', 'MCA', 'OTHER'];

const HOLDER_META = {
  COMPANY:    { label: 'Company',    icon: '🏢', color: '#1E3A8A' },
  DIRECTOR:   { label: 'Director',   icon: '👔', color: '#7C3AED' },
  INDIVIDUAL: { label: 'Individual', icon: '👤', color: '#065F46' },
  PARTNER:    { label: 'Partner',    icon: '🤝', color: '#B45309' },
  TRUSTEE:    { label: 'Trustee',    icon: '⚖️', color: '#0369A1' },
  OTHER:      { label: 'Other',      icon: '👥', color: '#6B7280' },
};

const DEPARTMENT_MAP = {
  MCA: 'ROC', ROC: 'ROC', DGFT: 'OTHER', TRADEMARK: 'TM',
  GST: 'GST', INCOME_TAX: 'IT', TDS: 'TDS', EPFO: 'ACC',
  ESIC: 'ACC', TRACES: 'TDS', MSME: 'MSME', RERA: 'OTHER', OTHER: 'OTHER',
};

const FIELD_META = {
  portal_name:    { label: 'Portal Name',       required: true,  icon: '🔑', description: 'Name of the portal/website' },
  portal_type:    { label: 'Portal Type',       required: false, icon: '📂', description: 'e.g. MCA, GST, INCOME_TAX' },
  url:            { label: 'Portal URL',        required: false, icon: '🌐', description: 'Website link' },
  username:       { label: 'Username / Email',  required: true,  icon: '👤', description: 'Login ID or email' },
  password_plain: { label: 'Password',          required: true,  icon: '🔐', description: 'Login password' },
  department:     { label: 'Department',        required: false, icon: '🏢', description: 'Auto-derived from portal type if empty' },
  holder_type:    { label: 'Holder Type',       required: false, icon: '👥', description: 'COMPANY / DIRECTOR / INDIVIDUAL etc.' },
  holder_name:    { label: 'Holder Name',       required: false, icon: '🧑', description: 'Director or individual name' },
  holder_pan:     { label: 'Holder PAN',        required: false, icon: '💳', description: 'PAN number' },
  holder_din:     { label: 'Holder DIN',        required: false, icon: '#️⃣', description: 'DIN number (for directors)' },
  mobile:         { label: 'Mobile / Phone',    required: false, icon: '📱', description: 'Registered mobile number' },
  trade_name:     { label: 'Trade Name',        required: false, icon: '🏪', description: 'Business/trade/brand name' },
  client_name:    { label: 'Client Name',       required: false, icon: '🏭', description: 'Associated client company' },
  client_id:      { label: 'Client ID',         required: false, icon: '🔢', description: 'Client code in the system' },
  notes:          { label: 'Notes',             required: false, icon: '📝', description: 'Additional remarks' },
  tags:           { label: 'Tags',              required: false, icon: '🏷️', description: 'Comma-separated tags' },
};

const SORT_OPTIONS = [
  { value: 'lifo', label: 'Newest First',  icon: '🕐', sortBy: 'created_at',  order: 'desc' },
  { value: 'fifo', label: 'Oldest First',  icon: '📅', sortBy: 'created_at',  order: 'asc'  },
  { value: 'az',   label: 'A → Z',         icon: '🔤', sortBy: 'portal_name', order: 'asc'  },
  { value: 'za',   label: 'Z → A',         icon: '🔡', sortBy: 'portal_name', order: 'desc' },
];

const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

// ── WhatsApp icon ─────────────────────────────────────────────────────────────
function WAIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function PortalBadge({ type, size = 'sm' }) {
  const meta = PORTAL_META[type] || PORTAL_META.OTHER;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full ${size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}
    >
      <span>{meta.icon}</span>{meta.label}
    </span>
  );
}

function DeptBadge({ dept }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
      {dept}
    </span>
  );
}

function HolderBadge({ holderType }) {
  const meta = HOLDER_META[holderType] || HOLDER_META.OTHER;
  if (holderType === 'COMPANY') return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}
    >
      <span>{meta.icon}</span>{meta.label}
    </span>
  );
}

function MaskedPassword() {
  return <span className="font-mono tracking-widest text-slate-400 text-sm select-none">••••••••••</span>;
}

function ModalHeader({ icon, title, subtitle, gradient, onClose }) {
  return (
    <div className="px-5 py-4 flex-shrink-0" style={{ background: gradient }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
          <div className="min-w-0">
            <DialogTitle className="text-white font-bold text-sm leading-tight">{title}</DialogTitle>
            {subtitle && <p className="text-white/60 text-[11px] mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ml-2">
          <X className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Reveal Password Component ─────────────────────────────────────────────────
function RevealPassword({ entryId, isDark }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      setPassword('');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/passwords/${entryId}/reveal`);
      setPassword(res.data.password || '');
      setRevealed(true);
      toast.success('Password revealed');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reveal password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {revealed ? (
        <span className={`font-mono text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{password}</span>
      ) : (
        <MaskedPassword />
      )}
      <button
        type="button"
        onClick={handleReveal}
        disabled={loading}
        className={`flex-shrink-0 p-0.5 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 text-slate-400 animate-spin" />
        ) : revealed ? (
          <EyeOff className="h-3 w-3 text-slate-400" />
        ) : (
          <Eye className="h-3 w-3 text-slate-400" />
        )}
      </button>
    </div>
  );
}

// ── Auto-fill and open portal ─────────────────────────────────────────────────
function handleAutoFillAndOpen(entry) {
  if (!entry.url) {
    toast.error('No URL configured for this entry');
    return;
  }
  window.open(entry.url, '_blank');
}

// ── WhatsApp Share Modal ──────────────────────────────────────────────────────
function WhatsAppShareModal({ open, onClose, entry, isDark }) {
  const [recipientType, setRecipientType] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);
  const [includePass, setIncludePass] = useState(false);
  const [customMsg, setCustomMsg] = useState('');

  const recipients = useMemo(() => {
    const r = [];
    if (entry?.mobile) r.push({ type: 'entry', label: 'Entry Mobile', name: entry.portal_name, phone: entry.mobile });
    if (entry?.client_name) r.push({ type: 'client', label: 'Client', name: entry.client_name, phone: '' });
    return r;
  }, [entry]);

  const selectedRecipient = useMemo(() => recipients.find(r => r.type === recipientType), [recipients, recipientType]);

  const handleIncludeToggle = async (checked) => {
    setIncludePass(checked);
    if (checked && entry?.id) {
      setLoadingPw(true);
      try {
        const res = await api.get(`/passwords/${entry.id}/reveal`);
        setPassword(res.data.password || '');
      } catch (err) {
        toast.error('Failed to fetch password');
        setIncludePass(false);
      } finally {
        setLoadingPw(false);
      }
    }
  };

  const buildMessage = useCallback(() => {
    const lines = [];
    if (entry?.portal_name) lines.push(`Portal: ${entry.portal_name}`);
    if (entry?.url) lines.push(`URL: ${entry.url}`);
    if (entry?.username) lines.push(`Username: ${entry.username}`);
    if (includePass && password) lines.push(`Password: ${password}`);
    if (customMsg.trim()) { lines.push('', customMsg.trim()); }
    lines.push('', '– Sent via Taskosphere');
    return lines.join('\n');
  }, [entry, includePass, password, customMsg]);

  const handleSend = () => {
    const phone = selectedRecipient?.phone || customPhone;
    if (!phone) { toast.error('Please select a recipient or enter a phone number'); return; }
    const digits = phone.replace(/\D/g, '');
    const e164 = digits.startsWith('91') ? digits : `91${digits}`;
    window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(buildMessage())}`, '_blank');
    toast.success('Opening WhatsApp Web…');
    handleClose();
  };

  const handleClose = () => {
    setRecipientType(''); setCustomPhone(''); setPassword('');
    setLoadingPw(false); setIncludePass(false); setCustomMsg(''); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-md rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader icon={<WAIcon className="h-4 w-4 text-white" />} title="Share via WhatsApp" subtitle="Send credentials securely to a contact" gradient="linear-gradient(135deg, #075E54 0%, #25D366 100%)" onClose={handleClose} />
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-500">Recipient</Label>
            {recipients.length > 0 ? (
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger className={`rounded-xl h-9 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><SelectValue placeholder="Select recipient" /></SelectTrigger>
                <SelectContent>{recipients.map(r => <SelectItem key={r.type} value={r.type}>{r.label} — {r.name} ({r.phone})</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input className={`rounded-xl h-9 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} placeholder="Enter phone number (with country code)" value={customPhone} onChange={e => setCustomPhone(e.target.value)} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase text-slate-500">Include Password?</Label>
            <input type="checkbox" checked={includePass} onChange={e => handleIncludeToggle(e.target.checked)} className="w-4 h-4 rounded cursor-pointer" />
          </div>
          {includePass && loadingPw && <p className="text-xs text-slate-400">Fetching password…</p>}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-500">Additional Message (optional)</Label>
            <Textarea className={`rounded-xl resize-none text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} rows={3} placeholder="Add any additional notes…" value={customMsg} onChange={e => setCustomMsg(e.target.value)} />
          </div>
        </div>
        <DialogFooter className={`px-5 py-3 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
          <Button disabled={!(selectedRecipient?.phone || customPhone)} onClick={handleSend} className="rounded-xl font-bold text-white gap-2" style={{ background: COLORS.whatsapp }}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Import Modal ─────────────────────────────────────────────────────────
function BulkImportModal({ open, onClose, isDark, onSuccess }) {
  const [step, setStep]                     = useState(1);
  const [file, setFile]                     = useState(null);
  const [parsing, setParsing]               = useState(false);
  const [importing, setImporting]           = useState(false);
  const [preview, setPreview]               = useState(null);
  const [unmappedAssignments, setUnmapped]  = useState({});
  const [result, setResult]                 = useState(null);
  const qc = useQueryClient();

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { toast.error('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file'); return; }
    setFile(f); setPreview(null); setResult(null); setStep(1);
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post('/passwords/parse-preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data); setUnmapped({}); setStep(2);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to parse file'); }
    finally { setParsing(false); }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post('/passwords/bulk-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data); setStep(3);
      qc.invalidateQueries({ queryKey: ['passwords'] });
      qc.invalidateQueries({ queryKey: ['passwords-stats'] });
      onSuccess?.();
    } catch (err) { toast.error(err.response?.data?.detail || 'Import failed'); }
    finally { setImporting(false); }
  };

  const handleClose = () => {
    setStep(1); setFile(null); setPreview(null); setResult(null); setUnmapped({}); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader icon={<Upload className="h-4 w-4 text-white" />} title="Bulk Import" subtitle="Upload Excel or CSV file" gradient={`linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`} onClose={handleClose} />
        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDark ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}>
                <input type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" className="hidden" id="file-input" />
                <label htmlFor="file-input" className="cursor-pointer">
                  <FileUp className="h-10 w-10 mx-auto mb-2 text-slate-400" />
                  <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Click to upload or drag and drop</p>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Excel (.xlsx, .xls) or CSV (.csv)</p>
                </label>
              </div>
              {file && <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Selected: {file.name}</p>}
            </>
          )}
          {step === 2 && preview && (
            <div className="space-y-3">
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Preview: {preview.rows_count} rows, {preview.columns_count} columns</p>
              <div className={`rounded-lg p-3 max-h-48 overflow-auto ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <pre className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{JSON.stringify(preview.sample_rows?.slice(0, 3), null, 2)}</pre>
              </div>
            </div>
          )}
          {step === 3 && result && (
            <div className="space-y-3">
              <div className={`rounded-lg p-4 ${isDark ? 'bg-green-900/20 border border-green-800/40' : 'bg-green-50 border border-green-200'}`}>
                <p className={`font-semibold ${isDark ? 'text-green-300' : 'text-green-700'}`}>✓ Import successful!</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>{result.imported} entries imported, {result.skipped} skipped, {result.errors} errors</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Close</Button>
          {step === 1 && <Button onClick={handleParse} disabled={!file || parsing} className="rounded-xl font-bold text-white" style={{ background: COLORS.deepBlue }}>{parsing ? 'Parsing...' : 'Preview'}</Button>}
          {step === 2 && <Button onClick={handleImport} disabled={importing} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>{importing ? 'Importing...' : 'Import'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ total, page, pageSize, onPage, onPageSize, isDark }) {
  const totalPages = Math.ceil(total / pageSize);
  if (total === 0) return null;
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end   = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);
  const btnBase = `h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center`;

  return (
    <div className={`flex items-center justify-between gap-3 py-2 px-1 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs">Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPage(1); }}>
          <SelectTrigger className={`h-7 w-20 rounded-lg text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white'}`}><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs">{Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page === 1} onClick={() => onPage(1)} className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}>«</button>
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}><ChevronLeft className="h-3.5 w-3.5" /></button>
        {pages.map(p => (
          <button key={p} type="button" onClick={() => onPage(p)} className={`${btnBase} ${p === page ? 'text-white shadow-sm' : isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} style={p === page ? { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` } : {}}>{p}</button>
        ))}
        <button type="button" disabled={page === totalPages} onClick={() => onPage(page + 1)} className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}><ChevronRight className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={page === totalPages} onClick={() => onPage(totalPages)} className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}>»</button>
      </div>
    </div>
  );
}

// ── Entry Card (Grid View) ────────────────────────────────────────────────────
function EntryCard({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark, selected, onSelect }) {
  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springMed }}>
      <div
        className={`rounded-2xl border p-3.5 h-full flex flex-col cursor-pointer transition-all ${selected ? (isDark ? 'border-blue-500 bg-blue-900/10' : 'border-blue-400 bg-blue-50') : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}
        onClick={() => onDetail(entry)}
      >
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {isAdmin && (
              <div className="flex-shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onSelect(entry.id); }}>
                <input type="checkbox" checked={selected} onChange={() => {}} className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500" />
              </div>
            )}
            <span className={`text-[10px] font-black mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{serialNo}</span>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</h3>
              <div className="flex items-center gap-1 mt-1 flex-wrap"><PortalBadge type={entry.portal_type} /><DeptBadge dept={entry.department} /><HolderBadge holderType={entry.holder_type} /></div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 ml-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {canEdit && <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Edit2 className="h-3 w-3 text-slate-400" /></button>}
            {isAdmin && <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Trash2 className="h-3 w-3 text-red-400" /></button>}
          </div>
        </div>

        {entry.holder_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
            <UserIcon className="h-3 w-3 flex-shrink-0" /><span className="truncate">{entry.holder_name}</span>
            {entry.holder_din && <span className="text-[10px] opacity-70 flex-shrink-0">DIN: {entry.holder_din}</span>}
          </div>
        )}
        {entry.client_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
            <Building2 className="h-3 w-3 flex-shrink-0" /><span className="truncate">{entry.client_name}</span>
          </div>
        )}
        {entry.trade_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
            <Store className="h-3 w-3 flex-shrink-0" /><span className="truncate">{entry.trade_name}</span>
          </div>
        )}

        {entry.username && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <UserIcon className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className={`font-mono text-xs truncate flex-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{entry.username}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Username copied'))} className={`flex-shrink-0 p-0.5 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Copy className="h-3 w-3 text-slate-400" /></button>
            </div>
          </div>
        )}

        <div className="mb-2.5" onClick={e => e.stopPropagation()}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Password</p>
          {entry.has_password ? <RevealPassword entryId={entry.id} isDark={isDark} /> : <span className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No password stored</span>}
        </div>

        {entry.mobile && (
          <div className={`flex items-center gap-1.5 mb-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Smartphone className="h-3 w-3 flex-shrink-0" /><span className="font-mono">{entry.mobile}</span>
          </div>
        )}
        {entry.url && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => handleAutoFillAndOpen(entry)} className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline truncate w-full text-left">
              <Globe className="h-3 w-3 flex-shrink-0" /><span className="truncate">{entry.url}</span><AutoFillIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
            </button>
          </div>
        )}
        {entry.notes && (
          <div className={`mt-auto pt-2 border-t text-[11px] ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
            {entry.notes.slice(0, 80)}{entry.notes.length > 80 ? '…' : ''}
          </div>
        )}

        <div className={`flex items-center justify-between mt-2.5 pt-2.5 border-t text-[10px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{entry.updated_at ? format(new Date(entry.updated_at), 'MMM d, yyyy') : '—'}</span>
          {entry.last_accessed_at && <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{format(new Date(entry.last_accessed_at), 'MMM d')}</span>}
        </div>

        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={e => { e.stopPropagation(); onShare(entry); }} className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all" style={{ background: isDark ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.07)', color: COLORS.whatsapp, border: `1px solid ${COLORS.whatsapp}28` }}>
          <WAIcon className="h-3 w-3" /> Share via WhatsApp
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Entry Row (List View) ─────────────────────────────────────────────────────
function EntryRow({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark, selected, onSelect }) {
  return (
    <motion.tr variants={itemVariants} className={`border-b transition-colors cursor-pointer ${selected ? (isDark ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-200') : isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'}`} onClick={() => onDetail(entry)}>
      {isAdmin && (
        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onSelect(entry.id)} className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500" />
        </td>
      )}
      <td className="px-3 py-2 text-center"><span className={`text-[10px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{serialNo}</span></td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</span>
          <div className="flex items-center gap-1 flex-wrap"><PortalBadge type={entry.portal_type} /><DeptBadge dept={entry.department} /><HolderBadge holderType={entry.holder_type} /></div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {entry.client_name && <span className={`text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>{entry.client_name}</span>}
          {entry.holder_name && <span className={`text-xs ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{entry.holder_name}</span>}
        </div>
      </td>
      <td className="px-3 py-2"><span className={`font-mono text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{entry.username}</span></td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}><RevealPassword entryId={entry.id} isDark={isDark} /></td>
      <td className="px-3 py-2 text-right flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
        {canEdit && <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Edit2 className="h-3 w-3 text-slate-400" /></button>}
        {isAdmin && <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Trash2 className="h-3 w-3 text-red-400" /></button>}
        <button type="button" onClick={() => onShare(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><WAIcon className="h-3 w-3" style={{ color: COLORS.whatsapp }} /></button>
      </td>
    </motion.tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UpdatePasswordRepository() {
  const isDark = useDark();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sortOption, setSortOption] = useState('lifo');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');
  const [filterHolder, setFilterHolder] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEntry, setShareEntry] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canView = isAdmin || user?.permissions?.includes('view_passwords');
  const canEdit = isAdmin || user?.permissions?.includes('edit_passwords');

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['passwords', search, filterDept, filterType, filterClient, filterHolder, sortOption],
    queryFn: async () => {
      const res = await api.get('/passwords', {
        params: {
          search: search || undefined,
          department: filterDept !== 'ALL' ? filterDept : undefined,
          portal_type: filterType !== 'ALL' ? filterType : undefined,
          client_id: filterClient !== 'ALL' ? filterClient : undefined,
          holder_type: filterHolder !== 'ALL' ? filterHolder : undefined,
          sort_by: SORT_OPTIONS.find(s => s.value === sortOption)?.sortBy,
          sort_order: SORT_OPTIONS.find(s => s.value === sortOption)?.order,
        },
      });
      return res.data || [];
    },
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['passwords-stats'],
    queryFn: async () => {
      const res = await api.get('/passwords/admin/stats');
      return res.data || {};
    },
    enabled: isAdmin,
  });

  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, page, pageSize]);

  const clientsInResults = useMemo(() => {
    const map = {};
    entries.forEach(e => { if (e.client_id && e.client_name) map[e.client_id] = e.client_name; });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const hasActiveFilter = filterDept !== 'ALL' || filterType !== 'ALL' || filterClient !== 'ALL' || filterHolder !== 'ALL' || search;

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/passwords/download-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'password-template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  const handleAddNew = () => {
    setEditEntry(null);
    setEditOpen(true);
  };

  const handleEdit = (entry) => {
    setEditEntry(entry);
    setEditOpen(true);
  };

  const handleDelete = (entry) => {
    setDeleteEntry(entry);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteEntry) return;
    try {
      await api.delete(`/passwords/${deleteEntry.id}`);
      toast.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['passwords'] });
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete entry');
    }
  };

  const handleShare = (entry) => {
    setShareEntry(entry);
    setShareOpen(true);
  };

  const handleDetail = (entry) => {
    setDetailEntry(entry);
    setDetailOpen(true);
  };

  const allPageSelected = paginatedEntries.length > 0 && paginatedEntries.every(e => selectedIds.has(e.id));

  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`text-center p-12 rounded-3xl border max-w-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><Lock className="h-8 w-8 text-red-500" /></div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Access Restricted</h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>You need the <b>View Password Repository</b> permission. Ask your administrator to grant access.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-xl px-4 py-3" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: '0 4px 20px rgba(13,59,102,0.25)' }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0"><KeyRound className="h-5 w-5 text-white" /></div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">Password Vault</h1>
                <p className="text-white/55 text-[11px]">MCA/ROC · GST · IT · TDS · DGFT · TM & more</p>
              </div>
              {isAdmin && stats.total != null && (
                <div className="px-2.5 py-1 bg-white/15 rounded-lg text-white text-xs font-bold hidden sm:block">{stats.total} total</div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button onClick={() => setSheetsOpen(true)} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <Sheet className="h-3.5 w-3.5" /> Sheets
              </Button>
              {canEdit && (
                <>
                  <Button onClick={handleDownloadTemplate} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                    <Download className="h-3.5 w-3.5" /> Template
                  </Button>
                  <Button onClick={() => setImportOpen(true)} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                    <Upload className="h-3.5 w-3.5" /> Import
                  </Button>
                  <Button onClick={handleAddNew} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white shadow-lg hover:scale-105 transition-all" style={{ background: COLORS.emeraldGreen }}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Stats ── */}
      {isAdmin && stats.by_portal_type && Object.keys(stats.by_portal_type).length > 0 && (
        <motion.div variants={itemVariants} className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(stats.by_portal_type).slice(0, 6).map(([type, count]) => {
            const meta = PORTAL_META[type] || PORTAL_META.OTHER;
            const isActive = filterType === type;
            return (
              <motion.div key={type} whileHover={{ y: -2, transition: springMed }} onClick={() => setFilterType(isActive ? 'ALL' : type)} className={`rounded-xl border p-2 cursor-pointer transition-all text-center ${isActive ? 'shadow-md' : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'}`} style={isActive ? { background: meta.bg, border: `1.5px solid ${meta.color}40` } : {}}>
                <div className="text-base mb-0.5">{meta.icon}</div>
                <p className="text-lg font-black leading-none" style={{ color: meta.color }}>{count}</p>
                <p className={`text-[10px] font-semibold mt-0.5 ${isDark && !isActive ? 'text-slate-400' : 'text-slate-500'}`}>{meta.label}</p>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── Bulk Action Bar ── */}
      <AnimatePresence>
        {isAdmin && selectedIds.size > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-800/40' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>{selectedIds.size} selected</span>
              <button type="button" onClick={() => setSelectedIds(new Set())} className={`text-xs underline ${isDark ? 'text-red-400' : 'text-red-500'}`}>Clear</button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => { setSelectedIds(new Set(entries.map(e => e.id))); }} variant="outline" className="rounded-lg h-7 text-xs">Select All ({entries.length})</Button>
              <Button size="sm" className="rounded-lg h-7 text-xs font-bold text-white gap-1.5 bg-red-500 hover:bg-red-600" onClick={() => setBulkDeleteOpen(true)}>
                <Trash className="h-3 w-3" /> Delete {selectedIds.size}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search + Filters ── */}
      <motion.div variants={itemVariants}>
        <div className={`flex flex-col sm:flex-row gap-2 p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input className={`pl-9 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} placeholder="Search portal, username, client, PAN, mobile…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue /></SelectTrigger>
            <SelectContent>{SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.icon} {s.label}</SelectItem>)}</SelectContent>
          </Select>
          {clientsInResults.length > 0 && (
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><Building2 className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="All Clients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Clients</SelectItem>
                {clientsInResults.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterHolder} onValueChange={setFilterHolder}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><Users className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Holder" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Holders</SelectItem>
              {HOLDER_TYPES.map(h => <SelectItem key={h} value={h}>{HOLDER_META[h]?.icon} {HOLDER_META[h]?.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><Filter className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Dept" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Depts</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><Tag className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="MCA">🏛️ MCA/ROC</SelectItem>
              {PORTAL_TYPES.filter(t => !['MCA', 'ROC'].includes(t)).map(t => (
                <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className={`flex items-center rounded-xl p-0.5 gap-0.5 border flex-shrink-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
            <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="List view"><List className="h-4 w-4" /></button>
          </div>
          {hasActiveFilter && (
            <Button variant="ghost" className="rounded-xl h-9 px-2.5 text-xs flex-shrink-0" onClick={() => { setFilterDept('ALL'); setFilterType('ALL'); setFilterClient('ALL'); setFilterHolder('ALL'); setSearch(''); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Results ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.mediumBlue, borderTopColor: 'transparent' }} />
        </div>
      ) : isError ? (
        <div className={`text-center py-12 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Failed to load password vault</p>
          <Button variant="ghost" className="mt-3 rounded-xl" onClick={() => qc.invalidateQueries({ queryKey: ['passwords'] })}>Retry</Button>
        </div>
      ) : entries.length === 0 ? (
        <motion.div variants={itemVariants} className={`text-center py-16 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <KeyRound className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className={`font-semibold text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>No credentials found</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">{hasActiveFilter ? 'Try adjusting your filters.' : 'Start by adding your first portal credential.'}</p>
          {canEdit && (
            <Button onClick={handleAddNew} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add First Entry
            </Button>
          )}
        </motion.div>
      ) : viewMode === 'grid' ? (
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedEntries.map((entry, idx) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              serialNo={(page - 1) * pageSize + idx + 1}
              canEdit={canEdit}
              isAdmin={isAdmin}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onShare={handleShare}
              onDetail={handleDetail}
              isDark={isDark}
              selected={selectedIds.has(entry.id)}
              onSelect={(id) => {
                const newSet = new Set(selectedIds);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                setSelectedIds(newSet);
              }}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <table className="w-full text-sm">
            <thead className={`border-b ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <tr>
                {isAdmin && <th className="px-2 py-2 text-left"><input type="checkbox" checked={allPageSelected} onChange={() => {}} className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500" /></th>}
                <th className="px-3 py-2 text-center text-xs font-semibold">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Portal</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Client / Holder</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Username</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Password</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.map((entry, idx) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  serialNo={(page - 1) * pageSize + idx + 1}
                  canEdit={canEdit}
                  isAdmin={isAdmin}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onShare={handleShare}
                  onDetail={handleDetail}
                  isDark={isDark}
                  selected={selectedIds.has(entry.id)}
                  onSelect={(id) => {
                    const newSet = new Set(selectedIds);
                    if (newSet.has(id)) newSet.delete(id);
                    else newSet.add(id);
                    setSelectedIds(newSet);
                  }}
                />
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* ── Pagination ── */}
      <Pagination total={entries.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} isDark={isDark} />

      {/* ── Modals ── */}
      <WhatsAppShareModal open={shareOpen} onClose={() => setShareOpen(false)} entry={shareEntry} isDark={isDark} />
      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} isDark={isDark} onSuccess={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ['passwords'] }); }} />
    </motion.div>
  );
}
