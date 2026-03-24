import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  Globe, Shield, Lock, Unlock, AlertTriangle, ChevronRight,
  X, Check, RefreshCw, Clock, User as UserIcon, Tag,
  Building2, FileText, Activity, Filter, ExternalLink,
  MessageCircle, Phone, Send, Download, Upload, FileUp,
  ChevronDown, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

// ── Brand palette ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
  coral:       '#FF6B6B',
  amber:       '#F59E0B',
  whatsapp:    '#25D366',
  whatsappDark:'#128C7E',
};

const springMed = { type: 'spring', stiffness: 340, damping: 24 };

// ── Portal type meta ──────────────────────────────────────────────────────────
const PORTAL_META = {
  MCA:        { label: 'MCA',        color: '#1E3A8A', bg: '#EFF6FF', icon: '🏛️', fullName: 'Ministry of Corporate Affairs'      },
  ROC:        { label: 'ROC',        color: '#1E3A8A', bg: '#EFF6FF', icon: '📋', fullName: 'Registrar of Companies'              },
  DGFT:       { label: 'DGFT',       color: '#065F46', bg: '#ECFDF5', icon: '🌐', fullName: 'Directorate General of Foreign Trade'},
  TRADEMARK:  { label: 'Trademark',  color: '#0F766E', bg: '#F0FDFA', icon: '™️',  fullName: 'Trademark / IP India'               },
  GST:        { label: 'GST',        color: '#7C3AED', bg: '#F5F3FF', icon: '📊', fullName: 'GST Portal'                         },
  INCOME_TAX: { label: 'Income Tax', color: '#DC2626', bg: '#FEF2F2', icon: '💰', fullName: 'Income Tax India'                   },
  TDS:        { label: 'TDS',        color: '#B45309', bg: '#FFFBEB', icon: '🧾', fullName: 'TDS / TRACES'                       },
  TRACES:     { label: 'TRACES',     color: '#B45309', bg: '#FFFBEB', icon: '🔍', fullName: 'TRACES Portal'                      },
  EPFO:       { label: 'EPFO',       color: '#1D4ED8', bg: '#EFF6FF', icon: '👷', fullName: 'EPFO / PF Portal'                   },
  ESIC:       { label: 'ESIC',       color: '#0369A1', bg: '#F0F9FF', icon: '🏥', fullName: 'ESIC Portal'                        },
  MSME:       { label: 'MSME',       color: '#92400E', bg: '#FEF3C7', icon: '🏭', fullName: 'MSME Samadhaan'                     },
  RERA:       { label: 'RERA',       color: '#4B5563', bg: '#F9FAFB', icon: '🏗️', fullName: 'RERA Portal'                        },
  OTHER:      { label: 'Other',      color: '#6B7280', bg: '#F9FAFB', icon: '🔗', fullName: 'Custom / Other Portal'              },
};

const PORTAL_TYPES  = Object.keys(PORTAL_META);
const DEPARTMENTS   = ['GST', 'IT', 'ACC', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'OTHER'];

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────
function WAIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function PortalBadge({ type, size = 'sm' }) {
  const meta = PORTAL_META[type] || PORTAL_META.OTHER;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full ${
        size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      }`}
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

function MaskedPassword() {
  return <span className="font-mono tracking-widest text-slate-400 text-sm select-none">••••••••••</span>;
}

// ── Client Search Dropdown ────────────────────────────────────────────────────
function ClientSearchDropdown({ value, onChange, isDark, clients = [] }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  const selectedClient = clients.find(c => c.id === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients.slice(0, 50);
    const q = search.toLowerCase();
    return clients.filter(c =>
      (c.company_name || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [clients, search]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (client) => {
    onChange(client ? { id: client.id, name: client.company_name } : { id: '', name: '' });
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={ref}>
      <div
        className={`flex items-center gap-2 h-10 rounded-xl border px-3 cursor-pointer transition-colors ${
          isDark
            ? 'bg-slate-700 border-slate-600 text-slate-100 hover:border-slate-500'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
        onClick={() => setOpen(o => !o)}
      >
        <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${selectedClient ? '' : 'text-slate-400'}`}>
          {selectedClient ? selectedClient.company_name : 'Search client…'}
        </span>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); handleSelect(null); }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border shadow-xl overflow-hidden ${
              isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
            }`}
            style={{ maxHeight: 260 }}
          >
            <div className={`p-2 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  autoFocus
                  className={`w-full pl-8 pr-3 h-8 text-sm rounded-lg border outline-none transition-colors ${
                    isDark
                      ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500'
                      : 'bg-slate-50 border-slate-200 focus:border-blue-300'
                  }`}
                  placeholder="Search clients…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 192 }}>
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-50 text-slate-400'
                } ${!value ? 'font-semibold' : ''}`}
              >
                — No client (internal) —
              </button>
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className={`w-full text-left px-3 py-2 transition-colors flex items-center gap-2 ${
                    isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'
                  } ${value === c.id ? (isDark ? 'bg-slate-700' : 'bg-blue-50') : ''}`}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, #0D3B66, #1F6FB2)` }}
                  >
                    {(c.company_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className={`text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {c.company_name}
                  </span>
                  {value === c.id && <Check className="h-3.5 w-3.5 text-blue-500 ml-auto flex-shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-slate-400">No clients found</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reveal Password Component ─────────────────────────────────────────────────
function RevealPassword({ entryId, isDark }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReveal = useCallback(async () => {
    if (revealed) { setRevealed(false); return; }
    setLoading(true);
    try {
      const res = await api.get(`/passwords/${entryId}/reveal`);
      setPassword(res.data.password || '');
      setRevealed(true);
    } catch {
      toast.error('Could not retrieve password');
    } finally {
      setLoading(false);
    }
  }, [entryId, revealed]);

  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        {revealed ? password : <MaskedPassword />}
      </span>
      <button onClick={handleReveal} disabled={loading}
        className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
        title={revealed ? 'Hide' : 'Reveal'}>
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" /> : revealed ? <EyeOff className="h-3.5 w-3.5 text-slate-400" /> : <Eye className="h-3.5 w-3.5 text-slate-400" />}
      </button>
      {revealed && (
        <button onClick={() => navigator.clipboard.writeText(password).then(() => toast.success('Password copied'))}
          className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Copy password">
          <Copy className="h-3 w-3 text-slate-400" />
        </button>
      )}
    </div>
  );
}

// ── WhatsApp Share Modal ──────────────────────────────────────────────────────
function WhatsAppShareModal({ open, onClose, entry, isDark }) {
  const [recipientType, setRecipientType] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);
  const [includePass, setIncludePass] = useState(false);
  const [customMsg, setCustomMsg] = useState('');

  const { data: clientData } = useQuery({
    queryKey: ['client-contacts', entry?.client_id],
    queryFn: () => api.get(`/clients/${entry.client_id}`).then(r => r.data),
    enabled: open && !!entry?.client_id,
  });

  const recipients = useMemo(() => {
    const list = [];
    if (clientData?.phone) list.push({ type: 'company', label: 'Company', name: clientData.name || entry?.client_name || 'Company', phone: clientData.phone });
    if (clientData?.contact_persons?.length) {
      clientData.contact_persons.forEach((cp, i) => {
        if (cp.phone) list.push({ type: `contact_${i}`, label: cp.designation || 'Contact', name: cp.name, phone: cp.phone });
      });
    }
    return list;
  }, [clientData, entry]);

  const selectedRecipient = recipients.find(r => r.type === recipientType);

  const fetchPassword = useCallback(async () => {
    if (!entry?.id || password) return;
    setLoadingPw(true);
    try {
      const res = await api.get(`/passwords/${entry.id}/reveal`);
      setPassword(res.data.password || '');
    } catch { toast.error('Could not retrieve password for sharing'); }
    finally { setLoadingPw(false); }
  }, [entry?.id, password]);

  const handleIncludeToggle = async (checked) => {
    setIncludePass(checked);
    if (checked) await fetchPassword();
  };

  const buildMessage = useCallback(() => {
    const meta = PORTAL_META[entry?.portal_type] || PORTAL_META.OTHER;
    const toName = selectedRecipient?.name || 'Sir/Madam';
    const lines = [];
    lines.push(`Dear ${toName},`);
    lines.push('');
    lines.push(`Please find the login credentials for *${entry?.portal_name || ''}* (${meta.fullName}):`);
    if (entry?.url) lines.push(`🌐 URL: ${entry.url}`);
    if (entry?.username) lines.push(`👤 Username: ${entry.username}`);
    if (includePass && password) lines.push(`🔑 Password: ${password}`);
    if (entry?.notes) lines.push(`📝 Note: ${entry.notes}`);
    lines.push('');
    lines.push('🔒 _This message contains confidential credentials. Please do not forward._');
    if (customMsg.trim()) { lines.push(''); lines.push(customMsg.trim()); }
    lines.push('');
    lines.push('– Sent via Taskosphere');
    return lines.join('\n');
  }, [entry, selectedRecipient, includePass, password, customMsg]);

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
    setRecipientType('');
    setCustomPhone('');
    setPassword('');
    setLoadingPw(false);
    setIncludePass(false);
    setCustomMsg('');
    onClose();
  };

  const phoneReady = !!(selectedRecipient?.phone || customPhone);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-md rounded-3xl p-0 border-none overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #075E54 0%, #25D366 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <WAIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-bold text-base">Share via WhatsApp</DialogTitle>
                <DialogDescription className="text-white/60 text-xs">Send credentials securely to a contact</DialogDescription>
              </div>
            </div>
            <button onClick={handleClose} className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-xl flex items-center justify-center transition-all">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Recipient</Label>
            {recipients.length > 0 ? (
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger className={`rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map(r => <SelectItem key={r.type} value={r.type}>{r.label} — {r.name} ({r.phone})</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input className={`rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
                placeholder="Enter phone number (with country code)" value={customPhone} onChange={e => setCustomPhone(e.target.value)} />
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase text-slate-500">Include Password?</Label>
              <input type="checkbox" checked={includePass} onChange={e => handleIncludeToggle(e.target.checked)} className="w-4 h-4 rounded cursor-pointer" />
            </div>
            {includePass && loadingPw && <p className="text-xs text-slate-400">Fetching password…</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Additional Message (optional)</Label>
            <Textarea className={`rounded-xl resize-none text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
              rows={3} placeholder="Add any additional notes…" value={customMsg} onChange={e => setCustomMsg(e.target.value)} />
          </div>
        </div>
        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
          <Button disabled={!phoneReady} onClick={handleSend}
            className="rounded-xl font-bold text-white gap-2" style={{ background: COLORS.whatsapp }}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Import Modal ─────────────────────────────────────────────────────────
function BulkImportModal({ open, onClose, isDark, onSuccess }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const qc = useQueryClient();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        toast.error('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) { toast.error('Please select a file'); return; }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/passwords/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['passwords'] });
      qc.invalidateQueries({ queryKey: ['passwords-stats'] });
      toast.success(`✓ Imported ${res.data.successful_imports} credentials`);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => { setFile(null); setResult(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-lg rounded-3xl p-0 border-none overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                <FileUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-bold text-base">Bulk Import Credentials</DialogTitle>
                <DialogDescription className="text-white/60 text-xs">Upload Excel or CSV file with password entries</DialogDescription>
              </div>
            </div>
            <button onClick={handleClose} className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-xl flex items-center justify-center transition-all">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
        {!result ? (
          <div className="p-6 space-y-4">
            <div className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
              style={{ borderColor: isDark ? '#475569' : '#e2e8f0' }}>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" id="bulk-import-file" />
              <label htmlFor="bulk-import-file" className="cursor-pointer block">
                <FileUp className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {file ? file.name : 'Click to upload or drag & drop'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Excel (.xlsx, .xls) or CSV (.csv)</p>
              </label>
            </div>
            <div className={`p-3 rounded-xl text-xs ${isDark ? 'bg-blue-900/20 border border-blue-800/50' : 'bg-blue-50 border border-blue-200'}`}>
              <p className={isDark ? 'text-blue-300' : 'text-blue-700'}>
                <b>Required columns:</b> portal_name, portal_type, url, username, password_plain, department, client_name, client_id, notes, tags
              </p>
            </div>
            <DialogFooter className={`flex items-center gap-3 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
              <Button disabled={!file || importing} onClick={handleImport}
                className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <p className="text-2xl font-bold" style={{ color: COLORS.mediumBlue }}>{result.successful_imports}</p>
                <p className="text-xs text-slate-500 mt-1">Imported</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <p className="text-2xl font-bold text-amber-500">{result.total_processed}</p>
                <p className="text-xs text-slate-500 mt-1">Total</p>
              </div>
              <div className={`p-3 rounded-xl text-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <p className="text-2xl font-bold text-red-500">{result.failed_imports}</p>
                <p className="text-xs text-slate-500 mt-1">Failed</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className={`p-3 rounded-xl text-xs max-h-40 overflow-y-auto ${isDark ? 'bg-red-900/20 border border-red-800/50' : 'bg-red-50 border border-red-200'}`}>
                <p className={`font-bold mb-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>Errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className={isDark ? 'text-red-200' : 'text-red-600'}>Row {err.row}: {typeof err.error === 'string' ? err.error : JSON.stringify(err.error).substring(0, 100)}</p>
                ))}
              </div>
            )}
            <DialogFooter className={`flex items-center gap-3 border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <Button className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }} onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, canEdit, isAdmin, onEdit, onDelete, onShare, isDark }) {
  return (
    <motion.div variants={itemVariants} whileHover={{ y: -4, transition: springMed }}>
      <div className={`rounded-2xl border p-4 h-full flex flex-col ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <PortalBadge type={entry.portal_type} size="sm" />
              <DeptBadge dept={entry.department} />
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              <button onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Edit">
                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {isAdmin && (
                <button onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Client badge */}
        {entry.client_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
            <Building2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{entry.client_name}</span>
          </div>
        )}

        {/* Username */}
        {entry.username && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <UserIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className={`font-mono text-sm truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{entry.username}</span>
              <button onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Username copied'))}
                className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Copy username">
                <Copy className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {/* Password */}
        <div className="mb-3">
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Password</p>
          {entry.has_password
            ? <RevealPassword entryId={entry.id} isDark={isDark} />
            : <span className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No password stored</span>
          }
        </div>

        {/* URL */}
        {entry.url && (
          <div className="mb-3">
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Portal URL</p>
            <a href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:underline truncate">
              <Globe className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{entry.url}</span>
              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
            </a>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div className={`mt-auto pt-3 border-t text-xs ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
            {entry.notes.slice(0, 100)}{entry.notes.length > 100 ? '…' : ''}
          </div>
        )}

        {/* Timestamps */}
        <div className={`flex items-center justify-between mt-3 pt-3 border-t text-[10px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {entry.updated_at ? format(new Date(entry.updated_at), 'MMM d, yyyy') : 'Unknown date'}
          </span>
          {entry.last_accessed_at && (
            <span className="flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />
              Last used {format(new Date(entry.last_accessed_at), 'MMM d')}
            </span>
          )}
        </div>

        {/* WhatsApp share */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onShare(entry)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all"
          style={{
            background: isDark ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.07)',
            color: COLORS.whatsapp,
            border: `1px solid ${COLORS.whatsapp}28`,
          }}
        >
          <WAIcon className="h-3.5 w-3.5" />
          Share via WhatsApp
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  portal_name: '',
  portal_type: 'OTHER',
  url: '',
  username: '',
  password_plain: '',
  department: 'OTHER',
  client_id: '',
  client_name: '',
  notes: '',
  tags: [],
};

function EntryModal({ open, onClose, existing, isDark, onSave, loading, clients }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        portal_name:    existing.portal_name    || '',
        portal_type:    existing.portal_type    || 'OTHER',
        url:            existing.url            || '',
        username:       existing.username       || '',
        password_plain: '',
        department:     existing.department     || 'OTHER',
        client_id:      existing.client_id      || '',
        client_name:    existing.client_name    || '',
        notes:          existing.notes          || '',
        tags:           existing.tags           || [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowPass(false);
  }, [existing, open]);

  const handleChange = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleClientChange = ({ id, name }) => {
    setForm(p => ({ ...p, client_id: id || '', client_name: name || '' }));
    // Auto-set department based on portal type if not yet set
    if (id && form.department === 'OTHER') {
      const suggestedDept = DEPARTMENT_MAP[form.portal_type] || 'OTHER';
      if (suggestedDept !== 'OTHER') {
        setForm(p => ({ ...p, client_id: id || '', client_name: name || '', department: suggestedDept }));
      }
    }
  };

  const inputClass = `rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg rounded-3xl p-0 border-none overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-bold text-base">
                  {existing ? 'Edit Credential' : 'Add New Credential'}
                </DialogTitle>
                <DialogDescription className="text-white/60 text-xs">
                  {existing ? `Editing: ${existing.portal_name}` : 'Store a new portal login securely'}
                </DialogDescription>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-xl flex items-center justify-center transition-all">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Client Selector — prominent at top */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Link to Client
            </Label>
            <ClientSearchDropdown
              value={form.client_id}
              onChange={handleClientChange}
              isDark={isDark}
              clients={clients}
            />
            {form.client_name && (
              <p className="text-[10px] text-blue-500 font-medium flex items-center gap-1">
                <Check className="h-3 w-3" /> Linked to: {form.client_name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Name *</Label>
            <Input className={inputClass} placeholder="e.g. Client XYZ GST Login"
              value={form.portal_name} onChange={e => handleChange('portal_name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Type</Label>
              <Select value={form.portal_type} onValueChange={v => {
                handleChange('portal_type', v);
                const dept = DEPARTMENT_MAP[v];
                if (dept && dept !== 'OTHER') handleChange('department', dept);
              }}>
                <SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PORTAL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department</Label>
              <Select value={form.department} onValueChange={v => handleChange('department', v)}>
                <SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal URL</Label>
            <Input className={inputClass} placeholder="https://www.gst.gov.in"
              value={form.url} onChange={e => handleChange('url', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username / Login ID</Label>
            <Input className={inputClass} placeholder="login@company.com or PAN/GSTIN"
              value={form.username} onChange={e => handleChange('username', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Password {existing ? '(leave blank to keep current)' : ''}
            </Label>
            <div className="relative">
              <Input className={`${inputClass} pr-10`} type={showPass ? 'text' : 'password'}
                placeholder={existing ? '••••••••  (unchanged)' : 'Enter password'}
                value={form.password_plain} onChange={e => handleChange('password_plain', e.target.value)} />
              <button type="button" onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes</Label>
            <Textarea className={`rounded-xl resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : ''}`}
              rows={3} placeholder="Any additional information…"
              value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
          </div>

          <div className={`flex items-start gap-2.5 p-3 rounded-xl text-xs ${isDark ? 'bg-emerald-900/20 border border-emerald-800/50' : 'bg-emerald-50 border border-emerald-200'}`}>
            <Shield className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>
              Passwords are encrypted using AES-128 before being stored. They are never revealed in logs or lists.
            </p>
          </div>
        </div>

        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button disabled={loading || !form.portal_name.trim()} onClick={() => onSave(form)}
            className="rounded-xl font-bold px-8 text-white"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            {loading ? 'Saving…' : existing ? 'Update Credential' : 'Save Credential'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PasswordRepository() {
  const { user } = useAuth();
  const isDark = useDark();
  const qc = useQueryClient();

  const isAdmin = user?.role === 'admin';
  const perms = (typeof user?.permissions === 'object' && user?.permissions) || {};
  const canView = isAdmin || !!perms.can_view_passwords;
  const canEdit = isAdmin || !!perms.can_edit_passwords;

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['passwords', filterDept, filterType, search, filterClient],
    queryFn: async () => {
      const params = {};
      if (filterDept !== 'ALL') params.department = filterDept;
      if (filterType !== 'ALL') params.portal_type = filterType;
      if (filterClient !== 'ALL') params.client_id = filterClient;
      if (search.trim()) params.search = search.trim();
      const res = await api.get('/passwords', { params });
      return res.data || [];
    },
    enabled: canView,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['passwords-stats'],
    queryFn: () => api.get('/passwords/admin/stats').then(r => r.data),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  // ── Clients for selector ────────────────────────────────────────────────────
  const { data: clients = [] } = useQuery({
    queryKey: ['passwords-clients'],
    queryFn: () => api.get('/passwords/clients-list').then(r => r.data),
    enabled: canView,
    staleTime: 60_000,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ form, id }) => {
      if (id) return api.put(`/passwords/${id}`, form);
      return api.post('/passwords', form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passwords'] });
      qc.invalidateQueries({ queryKey: ['passwords-stats'] });
      toast.success(editEntry ? '✓ Credential updated' : '✓ Credential saved');
      setModalOpen(false);
      setEditEntry(null);
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to save credential'),
  });

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/passwords/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passwords'] });
      qc.invalidateQueries({ queryKey: ['passwords-stats'] });
      toast.success('Credential deleted');
      setDeleteTarget(null);
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to delete'),
  });

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (form) => {
    setSaving(true);
    try { await saveMutation.mutateAsync({ form, id: editEntry?.id }); }
    finally { setSaving(false); }
  }, [editEntry, saveMutation]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/passwords/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'password_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('Template downloaded');
    } catch { toast.error('Failed to download template'); }
  };

  const handleEdit = (entry) => { setEditEntry(entry); setModalOpen(true); };
  const handleDelete = (entry) => setDeleteTarget(entry);
  const handleShare = (entry) => setShareTarget(entry);
  const handleAddNew = () => { setEditEntry(null); setModalOpen(true); };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const deptCounts = useMemo(() => {
    const counts = { ALL: entries.length };
    entries.forEach(e => { counts[e.department] = (counts[e.department] || 0) + 1; });
    return counts;
  }, [entries]);

  // Unique clients in current results for filter dropdown
  const clientsInResults = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (e.client_id && e.client_name) map[e.client_id] = e.client_name;
    });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [entries]);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`text-center p-12 rounded-3xl border max-w-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Access Restricted</h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            You need the <b>View Password Repository</b> permission. Ask your administrator to grant access.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: '0 8px 32px rgba(13,59,102,0.28)' }}>
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">
                <KeyRound className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Password Vault</h1>
                <p className="text-white/60 text-sm mt-0.5">Encrypted portal credentials — MCA · GST · IT · TDS · DGFT · TM & more</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {isAdmin && stats.total != null && (
                <div className="px-3 py-1.5 bg-white/15 rounded-xl text-white text-xs font-semibold">{stats.total} credentials</div>
              )}
              {canEdit && (
                <>
                  <Button onClick={handleDownloadTemplate} className="rounded-xl font-bold h-9 text-sm gap-2 text-white" style={{ background: COLORS.amber }}>
                    <Download className="h-4 w-4" /> Template
                  </Button>
                  <Button onClick={() => setImportOpen(true)} className="rounded-xl font-bold h-9 text-sm gap-2 text-white" style={{ background: COLORS.mediumBlue }}>
                    <Upload className="h-4 w-4" /> Import
                  </Button>
                  <Button onClick={handleAddNew} className="rounded-xl font-bold h-9 text-sm gap-2 text-white" style={{ background: COLORS.emeraldGreen }}>
                    <Plus className="h-4 w-4" /> Add Credential
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Admin Stats Row ──────────────────────────────────────────────────── */}
      {isAdmin && stats.by_portal_type && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {Object.entries(stats.by_portal_type).slice(0, 6).map(([type, count]) => {
            const meta = PORTAL_META[type] || PORTAL_META.OTHER;
            return (
              <motion.div key={type} whileHover={{ y: -2, transition: springMed }}
                onClick={() => setFilterType(filterType === type ? 'ALL' : type)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  filterType === type ? 'shadow-md' : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
                style={filterType === type ? { background: meta.bg, border: `1.5px solid ${meta.color}40` } : {}}>
                <div className="text-lg mb-1">{meta.icon}</div>
                <p className="text-lg font-black" style={{ color: meta.color }}>{count}</p>
                <p className={`text-[10px] font-semibold ${isDark && filterType !== type ? 'text-slate-400' : 'text-slate-500'}`}>{meta.label}</p>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── Search + Filters ─────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}
        className={`flex flex-col sm:flex-row gap-3 p-4 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input className={`pl-10 rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
            placeholder="Search portal name, username, client…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Client filter */}
        {clientsInResults.length > 0 && (
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className={`w-full sm:w-44 rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Clients</SelectItem>
              {clientsInResults.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className={`w-full sm:w-40 rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
            <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            {DEPARTMENTS.map(d => (
              <SelectItem key={d} value={d}>{d} {deptCounts[d] ? `(${deptCounts[d]})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className={`w-full sm:w-44 rounded-xl h-10 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
            <Tag className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue placeholder="Portal Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {PORTAL_TYPES.map(t => (
              <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filterDept !== 'ALL' || filterType !== 'ALL' || filterClient !== 'ALL' || search) && (
          <Button variant="ghost" className="rounded-xl h-10 px-3 text-xs"
            onClick={() => { setFilterDept('ALL'); setFilterType('ALL'); setFilterClient('ALL'); setSearch(''); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </motion.div>

      {/* ── Results grid ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: COLORS.mediumBlue, borderTopColor: 'transparent' }} />
        </div>
      ) : isError ? (
        <div className={`text-center py-16 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Failed to load password vault</p>
          <p className="text-sm text-slate-400 mt-1">Check your network or contact the administrator.</p>
        </div>
      ) : entries.length === 0 ? (
        <motion.div variants={itemVariants}
          className={`text-center py-20 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <KeyRound className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className={`font-semibold text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>No credentials found</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">
            {filterDept !== 'ALL' || filterType !== 'ALL' || search ? 'Try adjusting your filters.' : 'Start by adding your first portal credential.'}
          </p>
          {canEdit && (
            <Button onClick={handleAddNew} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add First Credential
            </Button>
          )}
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {entries.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                canEdit={canEdit}
                isAdmin={isAdmin}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShare={handleShare}
                isDark={isDark}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      <EntryModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEntry(null); }}
        existing={editEntry}
        isDark={isDark}
        onSave={handleSave}
        loading={saving}
        clients={clients}
      />

      {/* ── Bulk Import Modal ────────────────────────────────────────────────── */}
      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        isDark={isDark}
        onSuccess={() => setImportOpen(false)}
      />

      {/* ── WhatsApp Share Modal ──────────────────────────────────────────────── */}
      <WhatsAppShareModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        entry={shareTarget}
        isDark={isDark}
      />

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <DialogContent className={`max-w-sm rounded-3xl ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" /> Delete Credential
                </DialogTitle>
                <DialogDescription>
                  Permanently delete <b>{deleteTarget?.portal_name}</b>? This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 pt-4">
                <Button variant="ghost" className="rounded-xl" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button className="rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}>
                  {deleteMutation.isPending ? 'Deleting…' : 'Yes, Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
