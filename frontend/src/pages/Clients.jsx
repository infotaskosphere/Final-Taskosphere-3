import Papa from 'papaparse/papaparse.js';
import { motion } from 'framer-motion';
import { useDark } from '@/hooks/useDark';
import GifLoader, { MiniLoader } from '@/components/ui/GifLoader.jsx';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useLocation, useNavigate } from "react-router-dom";
import {
  Plus, Edit, Trash2, Mail, Cake, X,
  FileText, Calendar, Search, Users,
  Briefcase, BarChart3, Archive, MessageCircle, Trash,
  CheckCircle2, Building2, ChevronDown, ChevronUp,
  LayoutGrid, List, Phone, MapPin, User, FileCheck, Share2,
  Copy, ExternalLink, CheckSquare, Square, MinusSquare,
  Shield, Download,
} from 'lucide-react';
import { format, startOfDay, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';

const FixedSizeList = ({ children, height, itemCount, itemSize, width, itemData }) =>
  React.createElement(
    "div",
    { style: { height, width, overflow: "auto" } },
    Array.from({ length: itemCount || 0 }, (_, i) => {
      if (!children) return null;

      const result = children({ index: i, style: { height: itemSize }, data: itemData });

      if (result === undefined || result === null) return null;

      return result;
    })
  );


// ─── Constants ────────────────────────────────────────────────────────────────
const CLIENT_TYPES = [
  { value: 'proprietor', label: 'Proprietor' },
  { value: 'pvt_ltd', label: 'Private Limited' },
  { value: 'llp', label: 'LLP' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'huf', label: 'HUF' },
  { value: 'trust', label: 'Trust' },
  { value: 'other', label: 'Other' },
];

const SERVICES = [
  'GST', 'Trademark', 'Income Tax', 'ROC', 'Audit', 'Compliance',
  'Company Registration', 'Tax Planning', 'Accounting', 'Payroll', 'Other'
];

const TYPE_CONFIG = {
  pvt_ltd:     { label: 'Pvt Ltd',     bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#2563EB', strip: '#2563EB' },
  llp:         { label: 'LLP',         bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED', strip: '#7C3AED' },
  partnership: { label: 'Partnership', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: '#D97706', strip: '#D97706' },
  huf:         { label: 'HUF',         bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4', dot: '#0D9488', strip: '#0D9488' },
  trust:       { label: 'Trust',       bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', dot: '#E11D48', strip: '#E11D48' },
  proprietor:  { label: 'Proprietor',  bg: '#F8FAFC', text: '#475569', border: '#CBD5E1', dot: '#64748B', strip: '#64748B' },
  other:       { label: 'Other',       bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD', dot: '#0284C7', strip: '#0284C7' },
};

const AVATAR_GRADIENTS = [
  ['#0D3B66', '#1F6FB2'], ['#065f46', '#059669'], ['#7c2d12', '#ea580c'],
  ['#4c1d95', '#7c3aed'], ['#1e3a5f', '#2563eb'], ['#831843', '#db2777'],
  ['#134e4a', '#0d9488'], ['#1e1b4b', '#4f46e5'],
];
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
};
 
const cardVariants = {
  hidden:  { opacity: 0, y: 18, scale: 0.98 },
  visible: { opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 380, damping: 28 } },
};
const SORT_OPTIONS = [
  { value: 'fifo', label: 'Oldest First', icon: '↑', hint: 'FIFO' },
  { value: 'lifo', label: 'Newest First', icon: '↓', hint: 'LIFO' },
  { value: 'az',   label: 'A → Z',        icon: 'A', hint: 'A–Z'  },
  { value: 'za',   label: 'Z → A',        icon: 'Z', hint: 'Z–A'  },
];

const EMPTY_ASSIGNMENT = { user_id: '', services: [] };
const BOARD_PAGE_SIZE = 24;
const LIST_PAGE_SIZE  = 50;
const LIST_ROW_HEIGHT = 56;
const MAX_VISIBLE_ROWS = 15;
const SEARCH_DEBOUNCE_MS = 250;
const UNDO_DELAY_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getAvatarGradient = (name = '') => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADIENTS[idx][0]}, ${AVATAR_GRADIENTS[idx][1]})`;
};

const safeDate = (dateStr) => {
  if (!dateStr) return null;
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || ['None','null','undefined'].includes(trimmed)) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const trimmedEmail = (v) => { const t = v?.trim(); return t && t.length > 0 ? t : null; };



// ─── copyToClipboard helper ───────────────────────────────────────────────────
const copyToClipboard = async (text, label = 'Copied') => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error('Could not copy — please copy manually');
  }
};

// ─── DSC days-remaining helper ────────────────────────────────────────────────
const getDscDaysLeft = (expiryDate) => {
  if (!expiryDate) return null;
  try {
    return differenceInDays(new Date(expiryDate), new Date());
  } catch { return null; }
};

const DscBadge = ({ daysLeft }) => {
  if (daysLeft === null) return null;
  const color = daysLeft < 0 ? { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', label: 'Expired' }
    : daysLeft <= 30  ? { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA', label: `${daysLeft}d left` }
    : daysLeft <= 90  ? { bg: '#FEFCE8', text: '#CA8A04', border: '#FDE68A', label: `${daysLeft}d left` }
    : null;
  if (!color) return null;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 20, background: color.bg, color: color.text, border: `1px solid ${color.border}`, whiteSpace: 'nowrap' }}>
      DSC {color.label}
    </span>
  );
};

// ─── Skeleton card ────────────────────────────────────────────────────────────
const SkeletonCard = ({ isDark }) => (
  <div style={{ borderRadius: 16, background: isDark ? '#1e293b' : '#ffffff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`, padding: '14px 14px 12px 18px', overflow: 'hidden', position: 'relative' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '16px 0 0 16px', background: isDark ? '#334155' : '#e2e8f0' }} />
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: isDark ? '#334155' : '#e2e8f0' }} className="animate-pulse" />
      <div style={{ flex: 1 }}>
        <div style={{ height: 10, borderRadius: 6, background: isDark ? '#334155' : '#e2e8f0', width: '60%', marginBottom: 6 }} className="animate-pulse" />
        <div style={{ height: 12, borderRadius: 6, background: isDark ? '#334155' : '#e2e8f0', width: '80%' }} className="animate-pulse" />
      </div>
    </div>
    {[70, 90, 60, 75].map((w, i) => (
      <div key={i} style={{ height: 10, borderRadius: 6, background: isDark ? '#334155' : '#e2e8f0', width: `${w}%`, marginBottom: 8 }} className="animate-pulse" />
    ))}
  </div>
);

// ─── SectionHeading ───────────────────────────────────────────────────────────
const SectionHeading = ({ icon, title, subtitle, isDark }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
      {icon}
    </div>
    <div>
      <h3 className={`text-base font-semibold leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

// ─── TypePill ─────────────────────────────────────────────────────────────────
const TypePill = ({ type, customLabel }) => {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.proprietor;
  const label = type === 'other' && customLabel ? customLabel : cfg.label;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide whitespace-nowrap flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {label}
    </span>
  );
};

// ─── ActiveFilterChips ────────────────────────────────────────────────────────
const ActiveFilterChips = ({ statusFilter, clientTypeFilter, serviceFilter, assignedToFilter, users, onClear, onClearAll }) => {
  const chips = [];
  if (statusFilter !== 'all') chips.push({ key: 'status', label: statusFilter === 'active' ? 'Active' : 'Archived', onRemove: () => onClear('status') });
  if (clientTypeFilter !== 'all') { const t = CLIENT_TYPES.find(x => x.value === clientTypeFilter); chips.push({ key: 'type', label: t?.label || clientTypeFilter, onRemove: () => onClear('clientType') }); }
  if (serviceFilter !== 'all') chips.push({ key: 'service', label: serviceFilter, onRemove: () => onClear('service') });
  if (assignedToFilter !== 'all') { const u = users.find(x => x.id === assignedToFilter); chips.push({ key: 'assigned', label: u?.full_name || u?.name || 'User', onRemove: () => onClear('assigned') }); }
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Filters:</span>
      {chips.map(chip => (
        <span key={chip.key} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border"
          style={{ background: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }}>
          {chip.label}
          <button onClick={chip.onRemove} className="ml-0.5 hover:opacity-70 transition-opacity">
            <X style={{ width: 10, height: 10 }} />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button onClick={onClearAll} className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors px-1">
          Clear all
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// BULK MESSAGE MODAL
// ═══════════════════════════════════════════════════════════
const BulkMessageModal = React.memo(({ open, onClose, mode, filteredClients, isDark }) => {
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [clientScope, setClientScope] = useState('active'); // 'active' | 'all'

  const activeClients = useMemo(() => filteredClients.filter(c => (c?.status || 'active') !== 'inactive'), [filteredClients]);
  const archivedCount = filteredClients.length - activeClients.length;

  useEffect(() => {
    if (open) {
      setClientScope('active');
      setSelectedIds(new Set(activeClients.map(c => c.id)));
      setMessage(''); setClientSearch(''); setCopied(false); setExportDone(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always show ALL clients — archived ones appear dimmed/unchecked in Active mode
  const displayedClients = useMemo(() => {
    if (!clientSearch.trim()) return filteredClients;
    const q = clientSearch.toLowerCase();
    return filteredClients.filter(c =>
      (c?.company_name || '').toLowerCase().includes(q) ||
      (c?.phone || '').includes(q) ||
      (c?.email || '').toLowerCase().includes(q)
    );
  }, [filteredClients, clientSearch]);

  const selectedClients = useMemo(() => filteredClients.filter(c => selectedIds.has(c.id)), [filteredClients, selectedIds]);

  const toggleClient = useCallback((id, isArchived) => {
    // In Active Clients mode, archived clients cannot be selected
    if (clientScope === 'active' && isArchived) return;
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, [clientScope]);

  const handleScopeChange = useCallback((scope) => {
    setClientScope(scope);
    const base = scope === 'active' ? activeClients : filteredClients;
    setSelectedIds(new Set(base.map(c => c.id)));
  }, [activeClients, filteredClients]);

  const someSelected = selectedIds.size > 0;
  const phoneCount = selectedClients.filter(c => c.phone).length;
  const emailCount = selectedClients.filter(c => c.email).length;
  const isWhatsApp = mode === 'whatsapp';
  const accentColor = isWhatsApp ? '#25D366' : '#1F6FB2';
  const accentGrad  = isWhatsApp ? 'linear-gradient(135deg, #128C7E, #25D366)' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)';
  const relevantCount = isWhatsApp ? phoneCount : emailCount;

  const handleExportBroadcast = useCallback(() => {
    if (selectedClients.length === 0) { toast.error('Select at least one client first'); return; }
    const withPhone = selectedClients.filter(c => c.phone);
    if (withPhone.length === 0) { toast.error('No selected clients have a phone number'); return; }
    const rows = [
      ['Name', 'Phone', 'WhatsApp Number (91XXXXXXXXXX)', 'Message'],
      ...withPhone.map(c => {
        const phone = c.phone.replace(/\D/g, '');
        const wa = phone.length === 10 ? `91${phone}` : phone;
        const msg = message.trim() ? message.trim().replace(/\{name\}/gi, c.company_name) : '';
        return [c.company_name, c.phone, wa, msg];
      }),
    ];
    const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `whatsapp_broadcast_${format(new Date(), 'dd-MMM-yyyy')}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    const phoneList = withPhone.map(c => { const p = c.phone.replace(/\D/g, ''); return p.length === 10 ? `91${p}` : p; }).join('\n');
    navigator.clipboard.writeText(phoneList).catch(() => {});
    setExportDone(true);
    toast.success(`CSV downloaded + ${withPhone.length} numbers copied!`, { description: 'Open WhatsApp Business → New Broadcast → paste numbers' });
    setTimeout(() => setExportDone(false), 3000);
  }, [selectedClients, message]);

  const handleWhatsApp = useCallback(async () => {
    if (!message.trim()) { toast.error('Please write a message first'); return; }
    if (selectedClients.length === 0) { toast.error('Please select at least one client'); return; }
    try {
      await navigator.clipboard.writeText(message.trim());
      setCopied(true);
      toast.success('Message copied! Opening WhatsApp Web…');
      setTimeout(() => { window.open('https://web.whatsapp.com', '_blank'); setCopied(false); }, 800);
    } catch { toast.error('Could not copy to clipboard.'); }
  }, [message, selectedClients]);

  const handleEmail = useCallback(() => {
    if (!message.trim()) { toast.error('Please write a message first'); return; }
    if (selectedClients.length === 0) { toast.error('Please select at least one client'); return; }
    const bcc = selectedClients.map(c => c.email).filter(Boolean).join(',');
    if (!bcc) { toast.error('No email addresses found for selected clients'); return; }
    const lines = message.trim().split('\n');
    window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(lines[0].substring(0, 80))}&body=${encodeURIComponent(message.trim())}`;
    toast.success(`Opening mail client with ${emailCount} recipients in BCC`);
  }, [message, selectedClients, emailCount]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
        <DialogTitle className="sr-only">{isWhatsApp ? 'Bulk WhatsApp' : 'Bulk Email'}</DialogTitle>
        <div className="flex-shrink-0 px-7 py-5 border-b border-slate-100"
          style={{ background: isWhatsApp ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0" style={{ background: accentGrad }}>
              {isWhatsApp ? <MessageCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{isWhatsApp ? 'Bulk WhatsApp Message' : 'Bulk Email'}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{isWhatsApp ? 'Draft → Export for Broadcast or Copy & send via WhatsApp Web' : 'Draft → opens in your mail client with all recipients in BCC'}</p>
            </div>
            <div className="ml-auto flex-shrink-0">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={isWhatsApp ? { background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' } : { background: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }}>
                {relevantCount} {isWhatsApp ? 'with phone' : 'with email'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className={`w-72 flex-shrink-0 border-r flex flex-col ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50/40'}`}>
            <div className={`flex items-center gap-1.5 px-3 py-2.5 border-b flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
              <button onClick={() => handleScopeChange('active')}
                className={`flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition-all ${clientScope === 'active' ? 'text-white border-transparent' : (isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}`}
                style={clientScope === 'active' ? { background: accentColor } : {}}>
                Active <span className={`${clientScope === 'active' ? 'opacity-80' : 'opacity-60'}`}>({activeClients.length})</span>
              </button>
              <button onClick={() => handleScopeChange('all')}
                className={`flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition-all ${clientScope === 'all' ? 'text-white border-transparent' : (isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}`}
                style={clientScope === 'all' ? { background: accentColor } : {}}>
                All <span className={`${clientScope === 'all' ? 'opacity-80' : 'opacity-60'}`}>({filteredClients.length})</span>
              </button>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">{selectedIds.size} ✓</span>
            </div>
            <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input className="w-full pl-8 pr-3 h-8 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 bg-white"
                  placeholder="Filter clients…" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {displayedClients.map(client => {
                const isSelected = selectedIds.has(client.id);
                const hasContact = isWhatsApp ? !!client.phone : !!client.email;
                const isArchived = client.status === 'inactive';
                const isLocked = clientScope === 'active' && isArchived;
                return (
                  <div key={client.id} onClick={() => toggleClient(client.id, isArchived)}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b transition-all ${isDark ? 'border-slate-700' : 'border-slate-50'} ${isLocked ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer'} ${isSelected && !isLocked ? (isDark ? 'bg-slate-700' : 'bg-white') : (isDark ? 'hover:bg-slate-700/60' : 'hover:bg-white/60')} ${!hasContact && !isLocked ? 'opacity-40' : ''}`}>
                    <span className="flex-shrink-0" style={{ color: isSelected && !isLocked ? accentColor : '#cbd5e1' }}>
                      {isSelected && !isLocked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </span>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: getAvatarGradient(client.company_name) }}>
                      {client.company_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{client.company_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{isWhatsApp ? (client.phone || '— no phone') : (client.email || '— no email')}</p>
                    </div>
                    {!hasContact && !isArchived && <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">{isWhatsApp ? 'No phone' : 'No email'}</span>}
                    {isArchived && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${isLocked ? 'text-slate-400 bg-slate-100' : 'text-amber-600 bg-amber-50'}`}>
                        {isLocked ? '🔒 Archived' : 'Archived'}
                      </span>
                    )}
                  </div>
                );
              })}
              {displayedClients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Search className="h-6 w-6 mb-2 opacity-40" /><p className="text-xs">No clients match</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">{isWhatsApp ? 'WhatsApp Message' : 'Email Message'}</label>
                <textarea
                  className={`w-full min-h-[180px] border rounded-xl text-sm p-4 resize-none outline-none transition-all leading-relaxed ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 focus:border-blue-400' : 'bg-slate-50 border-slate-200 focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-100'}`}
                  placeholder={isWhatsApp ? "Dear {name},\n\nGST filing reminder…\n\nRegards,\nManthan Desai & Associates" : "Subject: Important Update\n\nDear Client,\n\nWe wanted to update you regarding…\n\nRegards,\nManthan Desai & Associates"}
                  value={message} onChange={e => setMessage(e.target.value)} />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[10px] text-slate-400">{isWhatsApp ? 'Use {name} → replaced with company name in export' : 'First line becomes the email subject'}</p>
                  <span className="text-[10px] text-slate-400">{message.length} chars</span>
                </div>
              </div>
              {isWhatsApp && (
                <div className="rounded-2xl border-2 border-dashed p-5 space-y-3" style={{ borderColor: '#86efac', background: 'linear-gradient(135deg, #f0fdf4, #f7fffe)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold shadow-sm" style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }}>📤</div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-900">Export for WhatsApp Broadcast</p>
                      <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">Downloads a <strong>CSV</strong> with all phone numbers + your message. Also <strong>copies numbers to clipboard</strong> in WhatsApp format (91XXXXXXXXXX).</p>
                    </div>
                  </div>
                  <button onClick={handleExportBroadcast} disabled={phoneCount === 0}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-white text-sm font-bold shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: exportDone ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #128C7E, #25D366)' }}>
                    {exportDone ? <><CheckCircle2 className="h-4 w-4" /> Exported!</> : <><FileText className="h-4 w-4" /> Export &amp; Copy Numbers ({phoneCount} clients)</>}
                  </button>
                </div>
              )}
              {selectedClients.length > 0 && (
                <div className="rounded-xl border p-4" style={isWhatsApp ? { background: '#f0fdf4', borderColor: '#bbf7d0' } : { background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: isWhatsApp ? '#166534' : '#1e40af' }}>{isWhatsApp ? '📱 Selected clients' : '📧 Ready to email'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClients.slice(0, 8).map(c => (
                      <span key={c.id} className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-white"
                        style={isWhatsApp ? { borderColor: '#86efac', color: '#166534' } : { borderColor: '#93c5fd', color: '#1e40af' }}>{c.company_name}</span>
                    ))}
                    {selectedClients.length > 8 && <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-white border-slate-200 text-slate-500">+{selectedClients.length - 8} more</span>}
                  </div>
                </div>
              )}
            </div>
            <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
              <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
              <div className="flex items-center gap-2">
                {selectedClients.length === 0 && <span className="text-xs text-amber-600 font-medium">← Select at least one client</span>}
                {isWhatsApp ? (
                  <Button type="button" disabled={!message.trim() || selectedClients.length === 0} onClick={handleWhatsApp}
                    className="h-10 px-5 text-sm rounded-xl text-white font-semibold gap-2 shadow-sm disabled:opacity-50"
                    style={{ background: !message.trim() || selectedClients.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #128C7E, #25D366)' }}>
                    {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy &amp; Open WhatsApp Web</>}
                  </Button>
                ) : (
                  <Button type="button" disabled={!message.trim() || selectedClients.length === 0} onClick={handleEmail}
                    className="h-10 px-6 text-sm rounded-xl text-white font-semibold gap-2 shadow-sm disabled:opacity-50"
                    style={{ background: !message.trim() || selectedClients.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    <ExternalLink className="h-4 w-4" /> Open in Mail Client
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT CARD — lifted outside Clients() so it never re-creates on render
// ═══════════════════════════════════════════════════════════════════════════
const ModernClientCard = React.memo(({
  onSendBirthdayWish, client, index, isDark, users,
  getClientAssignments, openWhatsApp, handleEdit,
  canDeleteData, canEditClients, onDelete, setSelectedClient, setDetailDialogOpen, getClientNumber,
}) => {
  const cfg            = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
  const avatarGrad     = getAvatarGradient(client.company_name);
  const isArchived     = client.status === 'inactive';
  const primaryContact = client.contact_persons?.find(cp => cp.name?.trim());
  const clientAssignments = getClientAssignments(client);
  const serviceCount   = client.services?.length || 0;
  const today          = new Date();
  const stripeColor    = cfg.strip;
 
  const worstDsc = useMemo(() => {
    if (!client.dsc_details?.length) return null;
    return client.dsc_details.reduce((worst, d) => {
      const days = getDscDaysLeft(d.expiry_date);
      if (days === null) return worst;
      return (worst === null || days < worst) ? days : worst;
    }, null);
  }, [client.dsc_details]);
 
  const hasBirthdayToday = useMemo(() =>
    client.contact_persons?.some(cp => {
      if (!cp?.birthday) return false;
      const bday = new Date(cp.birthday);
      return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
    }) ?? false,
  [client.contact_persons]);
 
  const firstAssignee = useMemo(() => {
    const a = clientAssignments[0];
    if (!a) return null;
    return users.find(x => x.id === a.user_id) || null;
  }, [clientAssignments, users]);
 
  const extraAssignees = clientAssignments.length > 1 ? clientAssignments.length - 1 : 0;
  const svcSlots  = [0, 1, 2].map(i => client.services?.[i]?.replace('Other: ', '') || null);
  const extraSvcs = serviceCount > 3 ? serviceCount - 3 : 0;
  const iconBg    = isDark ? 'rgba(255,255,255,0.07)' : cfg.bg;
 
  const actionBtns = [
    {
      onClick: e => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); },
      icon: <MessageCircle style={{ width: 12, height: 12 }} />,
      label: 'Chat',
      color: '#16a34a',
      hoverBg: isDark ? 'rgba(34,197,94,0.1)' : '#f0fdf4',
    },
    // Edit button — only shown when user has can_edit_clients permission
    ...(canEditClients ? [{
      onClick: e => { e.stopPropagation(); handleEdit(client); },
      icon: <Edit style={{ width: 12, height: 12 }} />,
      label: 'Edit',
      color: '#2563eb',
      hoverBg: isDark ? 'rgba(59,130,246,0.1)' : '#eff6ff',
    }] : []),
    {
      onClick: e => { e.stopPropagation(); onSendBirthdayWish(client.id, client.company_name); },
      icon: <span style={{ fontSize: 11 }}>🎂</span>,
      label: 'Wish',
      color: '#d97706',
      hoverBg: isDark ? 'rgba(217,119,6,0.1)' : '#fffbeb',
    },
    ...(canDeleteData ? [{
      onClick: e => { e.stopPropagation(); onDelete(client); },
      icon: <Trash2 style={{ width: 12, height: 12 }} />,
      label: 'Del',
      color: '#ef4444',
      hoverBg: isDark ? 'rgba(239,68,68,0.1)' : '#fef2f2',
    }] : []),
  ];
 
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -3, transition: springPhysics.card }}
      whileTap={{ scale: 0.985 }}
      layout
      className={`relative flex flex-col overflow-hidden cursor-pointer select-none group ${isArchived ? 'opacity-55' : ''}`}
      style={{
        borderRadius: 16,
        background: isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.06)',
      }}
      onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}
    >
      {/* ── VERTICAL LEFT STRIP ── */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderRadius: '16px 0 0 16px', background: stripeColor }} />
 
      {/* ── HEADER ── */}
      <div style={{
        padding: '12px 14px 10px 18px',
        background: isDark
          ? `linear-gradient(135deg, ${stripeColor}18 0%, transparent 60%)`
          : `linear-gradient(135deg, ${stripeColor}0f 0%, transparent 60%)`,
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: avatarGrad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16, fontWeight: 900,
              boxShadow: `0 4px 12px ${stripeColor}55`,
            }}>
              {client.company_name?.charAt(0).toUpperCase() || '?'}
            </div>
            {hasBirthdayToday && (
              <div style={{
                position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                background: '#ec4899', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, border: '2px solid #fff',
              }}>🎂</div>
            )}
            {isArchived && (
              <div style={{
                position: 'absolute', bottom: -4, right: -4, width: 14, height: 14,
                background: '#f59e0b', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Archive style={{ width: 8, height: 8, color: '#fff' }} />
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#475569' : '#cbd5e1', flexShrink: 0 }}>
                #{getClientNumber(index)}
              </span>
              <TypePill type={client.client_type} customLabel={client.client_type_label} />
              <DscBadge daysLeft={worstDsc} />
            </div>
            <h3 style={{
              fontSize: 12, fontWeight: 700, lineHeight: 1.35,
              color: isDark ? '#f1f5f9' : '#0f172a',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word', minHeight: '2.7em', margin: 0,
            }}>
              {client.company_name}
            </h3>
          </div>
        </div>
      </div>
 
      {/* ── BODY ── */}
      <div style={{ padding: '10px 14px 10px 18px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
 
        {/* Contact person */}
        <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User style={{ width: 11, height: 11, color: stripeColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#e2e8f0' : '#1e293b', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
              {primaryContact?.name || <span style={{ color: isDark ? '#475569' : '#cbd5e1', fontStyle: 'italic' }}>No contact</span>}
            </p>
            <p style={{ fontSize: 10, color: isDark ? '#64748b' : '#94a3b8', margin: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              {primaryContact?.designation || '\u00a0'}
            </p>
          </div>
        </div>
 
        {/* Phone + email */}
        <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Phone style={{ width: 10, height: 10, color: stripeColor }} />
            </div>
            <span
              title={client.phone ? 'Click to copy' : ''}
              onClick={client.phone ? e => { e.stopPropagation(); copyToClipboard(client.phone, 'Phone'); } : undefined}
              style={{ fontSize: 10, fontWeight: 500, color: client.phone ? (isDark ? '#cbd5e1' : '#334155') : (isDark ? '#334155' : '#e2e8f0'), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: client.phone ? 'copy' : 'default' }}>
              {client.phone || '—'}
            </span>
          </div>
          <div style={{ width: 1, height: 12, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Mail style={{ width: 10, height: 10, color: stripeColor }} />
            </div>
            <span
              title={client.email ? 'Click to copy' : ''}
              onClick={client.email ? e => { e.stopPropagation(); copyToClipboard(client.email, 'Email'); } : undefined}
              style={{ fontSize: 10, color: client.email ? (isDark ? '#94a3b8' : '#475569') : (isDark ? '#334155' : '#e2e8f0'), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: client.email ? 'copy' : 'default' }}>
              {client.email || '—'}
            </span>
          </div>
        </div>
 
        {/* Services */}
        <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 18, height: 18, borderRadius: 5, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart3 style={{ width: 10, height: 10, color: stripeColor }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {svcSlots.map((svc, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, flexShrink: 0,
                background: svc ? (isDark ? `${stripeColor}28` : cfg.bg) : 'transparent',
                color: svc ? cfg.text : 'transparent',
                border: `1px solid ${svc ? (isDark ? stripeColor + '45' : cfg.border) : 'transparent'}`,
                whiteSpace: 'nowrap', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {svc || '·'}
              </span>
            ))}
            {extraSvcs > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 20, background: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', color: '#64748b', flexShrink: 0 }}>
                +{extraSvcs}
              </span>
            )}
            {serviceCount === 0 && (
              <span style={{ fontSize: 10, color: isDark ? '#334155' : '#e2e8f0', fontStyle: 'italic' }}>No services</span>
            )}
          </div>
        </div>
 
        {/* Assignee + referred by */}
        <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Briefcase style={{ width: 10, height: 10, color: stripeColor }} />
            </div>
            <span style={{ fontSize: 10, color: firstAssignee ? (isDark ? '#94a3b8' : '#475569') : (isDark ? '#334155' : '#e2e8f0'), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {firstAssignee
                ? <>{firstAssignee.full_name || firstAssignee.name}{extraAssignees > 0 && <span style={{ color: isDark ? '#475569' : '#94a3b8' }}> +{extraAssignees}</span>}</>
                : '—'}
            </span>
          </div>
          {client.referred_by && (
            <>
              <div style={{ width: 1, height: 12, background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Share2 style={{ width: 10, height: 10, color: stripeColor }} />
                </div>
                <span style={{ fontSize: 10, color: isDark ? '#64748b' : '#64748b', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {client.referred_by}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
 
      {/* ── ACTION ROW ── */}
      <div style={{
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
        display: 'grid',
        gridTemplateColumns: `repeat(${actionBtns.length}, 1fr)`,
      }}>
        {actionBtns.map((btn, i) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            style={{
              height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: btn.color, fontSize: 10, fontWeight: 700,
              borderRight: i < actionBtns.length - 1
                ? `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`
                : 'none',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = btn.hoverBg; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {btn.icon}
            {btn.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
})

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT DETAIL POPUP — lifted outside so it never re-creates on render
// ═══════════════════════════════════════════════════════════════════════════
const GST_TREATMENT_LABELS = { regular: 'Regular Taxpayer', composition: 'Composition Scheme', unregistered: 'Unregistered', consumer: 'Consumer (B2C)', overseas: 'Overseas / SEZ' };
const INV_STATUS_COLORS = { paid: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' }, sent: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' }, draft: { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' }, overdue: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }, partially_paid: { bg: '#fefce8', text: '#92400e', border: '#fde68a' }, cancelled: { bg: '#fafafa', text: '#9ca3af', border: '#e5e7eb' } };

const ClientDetailPopup = React.memo(({ selectedClient, detailDialogOpen, setDetailDialogOpen, isDark, users, getClientAssignments, openWhatsApp, handleEdit, canEditClients }) => {
  const [activeTab, setActiveTab] = React.useState('details');
  const [clientInvoices, setClientInvoices] = React.useState([]);
  const [invoicesLoading, setInvoicesLoading] = React.useState(false);

  React.useEffect(() => { setActiveTab('details'); setClientInvoices([]); }, [selectedClient?.id]);

  React.useEffect(() => {
    if (activeTab !== 'invoices' || !selectedClient) return;
    setInvoicesLoading(true);
    api.get('/invoices', { params: { search: selectedClient.company_name, page_size: 100 } })
      .then(r => {
        const all = r.data?.invoices || [];
        setClientInvoices(all.filter(inv =>
          inv.client_id === selectedClient.id ||
          inv.client_name?.toLowerCase() === selectedClient.company_name?.toLowerCase()
        ));
      })
      .catch(() => {})
      .finally(() => setInvoicesLoading(false));
  }, [activeTab, selectedClient]);

  if (!selectedClient) return null;
  const cfg = TYPE_CONFIG[selectedClient.client_type] || TYPE_CONFIG.proprietor;
  const avatarGrad = getAvatarGradient(selectedClient.company_name);
  const clientAssignments = getClientAssignments(selectedClient);
  const hasTaxInfo = selectedClient.gstin || selectedClient.pan || selectedClient.gst_treatment || selectedClient.website || selectedClient.msme_number || selectedClient.credit_limit || selectedClient.opening_balance || selectedClient.tally_ledger_name;
  const totalInvValue = clientInvoices.reduce((s, i) => s + (i.grand_total || 0), 0);
  const totalOutstanding = clientInvoices.reduce((s, i) => s + (i.amount_due || 0), 0);

  return (
    <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
      <DialogContent className={`max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">Client Details</DialogTitle>
        <DialogDescription className="sr-only">View complete client information</DialogDescription>

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 pt-6 px-8 pb-6 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${cfg.bg}, white)` }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-md" style={{ background: avatarGrad }}>{selectedClient.company_name?.charAt(0).toUpperCase() || '?'}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.company_name}</h2>
                <TypePill type={selectedClient.client_type} customLabel={selectedClient.client_type_label} />
                {selectedClient.status === 'inactive' && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">Archived</span>}
              </div>
              {selectedClient.birthday && <p className="text-sm text-slate-500"><Calendar className="inline h-3.5 w-3.5 mr-1" />Incorporated: {format(new Date(selectedClient.birthday), 'MMM d, yyyy')}</p>}
              {selectedClient.referred_by && <p className="text-sm text-slate-500 mt-1"><Share2 className="inline h-3.5 w-3.5 mr-1" />Referred by: <span className="font-medium text-slate-700">{selectedClient.referred_by}</span></p>}
              {selectedClient.created_at && <p className="text-xs text-slate-400 mt-1"><Calendar className="inline h-3 w-3 mr-1" />Added: {format(new Date(selectedClient.created_at), 'MMM d, yyyy')}</p>}
            </div>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className={`flex items-center gap-1 px-8 py-2.5 border-b flex-shrink-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          {[
            { key: 'details', label: 'Details', icon: <User className="h-3.5 w-3.5" /> },
            { key: 'invoices', label: 'Invoices', icon: <FileText className="h-3.5 w-3.5" /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 h-8 px-4 rounded-xl text-xs font-semibold transition-all ${
                activeTab === tab.key
                  ? 'text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'
              }`}
              style={activeTab === tab.key ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' } : {}}>
              {tab.icon}
              <span className="ml-1">{tab.label}</span>
              {tab.key === 'invoices' && clientInvoices.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: activeTab === 'invoices' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', color: activeTab === 'invoices' ? '#fff' : '#64748b' }}>
                  {clientInvoices.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ════════════════ INVOICES TAB ════════════════ */}
          {activeTab === 'invoices' && (
            <div className="p-6 space-y-4">
              {invoicesLoading ? (
                <MiniLoader height={120} />
              ) : clientInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <FileText className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium">No invoices found</p>
                  <p className="text-xs mt-1 text-slate-300">Create an invoice for this client to see it here</p>
                </div>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Invoices', value: clientInvoices.length, color: '#1F6FB2' },
                      { label: 'Total Billed', value: `₹${totalInvValue.toLocaleString('en-IN')}`, color: '#059669' },
                      { label: 'Outstanding', value: `₹${totalOutstanding.toLocaleString('en-IN')}`, color: totalOutstanding > 0 ? '#dc2626' : '#059669' },
                    ].map((s, i) => (
                      <div key={i} className={`rounded-xl p-3 border text-center ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
                        <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Invoice rows */}
                  <div className="space-y-2">
                    {clientInvoices.slice(0, 15).map(inv => {
                      const sc = INV_STATUS_COLORS[inv.status] || INV_STATUS_COLORS.draft;
                      return (
                        <div key={inv.id} className={`border rounded-xl p-3.5 transition-colors ${isDark ? 'bg-slate-700 border-slate-600 hover:bg-slate-600/60' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{inv.invoice_no}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                                  {(inv.status || 'draft').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {inv.invoice_date}
                                {inv.invoice_type && <span className="ml-1 opacity-60">· {inv.invoice_type.replace(/_/g, ' ')}</span>}
                                {inv.due_date && <span className="ml-1 opacity-60">· Due {inv.due_date}</span>}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                ₹{(inv.grand_total || 0).toLocaleString('en-IN')}
                              </p>
                              {(inv.amount_due || 0) > 0 && (
                                <p className="text-xs text-red-500 font-semibold">
                                  Due ₹{(inv.amount_due || 0).toLocaleString('en-IN')}
                                </p>
                              )}
                              {inv.status === 'paid' && (
                                <p className="text-xs text-emerald-600 font-semibold">Paid ✓</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {clientInvoices.length > 15 && (
                      <p className="text-xs text-slate-400 text-center py-2">
                        +{clientInvoices.length - 15} more invoices
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════════════════ DETAILS TAB ════════════════ */}
          {activeTab === 'details' && (
            <div className="p-8 space-y-6">

              {/* Contact info */}
              <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-4 flex items-center gap-2`}><Mail className="h-4 w-4" /> Contact Information</h3>
                <div className="space-y-3">
                  {selectedClient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <a href={`mailto:${selectedClient.email}`} className="text-blue-600 hover:underline text-sm flex-1">{selectedClient.email}</a>
                      <button onClick={() => copyToClipboard(selectedClient.email, 'Email')} className="text-slate-300 hover:text-slate-600 transition-colors"><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  {selectedClient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <a href={`tel:${selectedClient.phone}`} className="text-slate-700 font-medium text-sm flex-1">{selectedClient.phone}</a>
                      <button onClick={() => copyToClipboard(selectedClient.phone, 'Phone')} className="text-slate-300 hover:text-slate-600 transition-colors"><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  {selectedClient.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-slate-700 text-sm">
                        <p>{selectedClient.address}</p>
                        {(selectedClient.city || selectedClient.state) && <p className="text-slate-500 text-xs mt-1">{[selectedClient.city, selectedClient.state].filter(Boolean).join(', ')}</p>}
                      </div>
                    </div>
                  )}
                  {selectedClient.website && (
                    <div className="flex items-center gap-3">
                      <ExternalLink className="h-4 w-4 text-purple-500 flex-shrink-0" />
                      <a href={selectedClient.website} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline text-sm flex-1 truncate">
                        {selectedClient.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Tax & Billing */}
              {hasTaxInfo && (
                <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-4 flex items-center gap-2`}>
                    <FileCheck className="h-4 w-4" /> Tax & Billing
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedClient.gstin && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">GSTIN</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.gstin}</p>
                          <button onClick={() => copyToClipboard(selectedClient.gstin, 'GSTIN')} className="text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0"><Copy className="h-3 w-3" /></button>
                        </div>
                      </div>
                    )}
                    {selectedClient.pan && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">PAN</p>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.pan}</p>
                          <button onClick={() => copyToClipboard(selectedClient.pan, 'PAN')} className="text-slate-300 hover:text-slate-600 transition-colors flex-shrink-0"><Copy className="h-3 w-3" /></button>
                        </div>
                      </div>
                    )}
                    {selectedClient.gst_treatment && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">GST Treatment</p>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {GST_TREATMENT_LABELS[selectedClient.gst_treatment] || selectedClient.gst_treatment}
                        </p>
                      </div>
                    )}
                    {selectedClient.default_payment_terms && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Payment Terms</p>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.default_payment_terms}</p>
                      </div>
                    )}
                    {selectedClient.credit_limit && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Credit Limit</p>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          ₹{Number(selectedClient.credit_limit).toLocaleString('en-IN')}
                        </p>
                      </div>
                    )}
                    {selectedClient.opening_balance && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Opening Balance</p>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          ₹{Number(selectedClient.opening_balance).toLocaleString('en-IN')}
                          <span className="ml-1 text-xs text-slate-400">{selectedClient.opening_balance_type || 'Dr'}</span>
                        </p>
                      </div>
                    )}
                    {selectedClient.msme_number && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">MSME / Udyam</p>
                        <p className={`text-xs font-mono font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.msme_number}</p>
                      </div>
                    )}
                    {selectedClient.place_of_supply && (
                      <div className={`rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Place of Supply</p>
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{selectedClient.place_of_supply}</p>
                      </div>
                    )}
                  </div>
                  {/* Tally sub-card */}
                  {(selectedClient.tally_ledger_name || selectedClient.tally_group) && (
                    <div className={`mt-3 rounded-xl p-3 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                        <Building2 className="h-3 w-3" /> Tally Sync
                      </p>
                      <div className="flex flex-wrap gap-5 text-sm">
                        {selectedClient.tally_ledger_name && (
                          <span>
                            <span className="text-xs text-slate-400">Ledger: </span>
                            <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selectedClient.tally_ledger_name}</span>
                          </span>
                        )}
                        {selectedClient.tally_group && (
                          <span>
                            <span className="text-xs text-slate-400">Group: </span>
                            <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{selectedClient.tally_group}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Services */}
              {selectedClient.services?.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-4 flex items-center gap-2`}><BarChart3 className="h-4 w-4" /> Services</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.services.map((svc, i) => (
                      <span key={i} className="text-xs font-semibold px-3 py-2 rounded-xl border" style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                        {svc.replace('Other: ', '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact persons */}
              {selectedClient.contact_persons?.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-4 flex items-center gap-2`}>
                    <Users className="h-4 w-4" /> Contact Persons ({selectedClient.contact_persons.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.contact_persons.map((cp, i) => cp.name && (
                      <div key={i} className={`border rounded-xl p-4 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{cp.name}</p>
                        {cp.designation && <p className="text-xs text-slate-500 mt-1">{cp.designation}</p>}
                        <div className="flex flex-col gap-1.5 mt-2 text-xs">
                          {cp.email && (
                            <div className="flex items-center gap-2">
                              <a href={`mailto:${cp.email}`} className="text-blue-600 hover:underline flex-1">{cp.email}</a>
                              <button onClick={() => copyToClipboard(cp.email, 'Email')} className="text-slate-300 hover:text-slate-500"><Copy className="h-3 w-3" /></button>
                            </div>
                          )}
                          {cp.phone && (
                            <div className="flex items-center gap-2">
                              <a href={`tel:${cp.phone}`} className="text-slate-700 flex-1">{cp.phone}</a>
                              <button onClick={() => copyToClipboard(cp.phone, 'Phone')} className="text-slate-300 hover:text-slate-500"><Copy className="h-3 w-3" /></button>
                            </div>
                          )}
                          {cp.birthday && <p className="text-slate-500">Birthday: {format(new Date(cp.birthday), 'MMM d, yyyy')}</p>}
                          {cp.din && <p className="text-slate-500">DIN: {cp.din}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DSC details */}
              {selectedClient.dsc_details?.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-4 flex items-center gap-2`}>
                    <Shield className="h-4 w-4" /> DSC Details ({selectedClient.dsc_details.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.dsc_details.map((dsc, i) => dsc.certificate_number && (
                      <div key={i} className={`border rounded-xl p-4 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{dsc.certificate_number}</p>
                          <DscBadge daysLeft={getDscDaysLeft(dsc.expiry_date)} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Holder: {dsc.holder_name}</p>
                        <div className="flex gap-4 mt-2 text-xs text-slate-600">
                          {dsc.issue_date && <p>Issued: {format(new Date(dsc.issue_date), 'MMM d, yyyy')}</p>}
                          {dsc.expiry_date && <p>Expires: {format(new Date(dsc.expiry_date), 'MMM d, yyyy')}</p>}
                        </div>
                        {dsc.notes && <p className="text-xs text-slate-500 mt-2 italic">{dsc.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignments & notes */}
              {(clientAssignments.length > 0 || selectedClient.notes) && (
                <div className="grid grid-cols-2 gap-4">
                  {clientAssignments.length > 0 && (
                    <div className={`border rounded-2xl p-5 col-span-2 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-3 flex items-center gap-2`}>
                        <Briefcase className="h-3.5 w-3.5" /> User Assignments
                      </h3>
                      <div className="flex flex-col gap-2">
                        {clientAssignments.map((a, i) => {
                          const u = users.find(x => x.id === a.user_id);
                          if (!u) return null;
                          return (
                            <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-2.5 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-white border-slate-100'}`}>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: getAvatarGradient(u.full_name || u.name || '') }}>
                                {(u.full_name || u.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{u.full_name || u.name}</p>
                                {a.services?.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {a.services.map((svc, si) => (
                                      <span key={si} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>{svc}</span>
                                    ))}
                                  </div>
                                ) : <p className="text-xs text-slate-400 mt-0.5">All services</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedClient.notes && (
                    <div className={`border rounded-2xl p-5 col-span-2 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                      <h3 className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-600'} mb-3`}>Notes</h3>
                      <p className="text-sm text-slate-700 leading-relaxed">{selectedClient.notes}</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
          {/* ════════════════ END DETAILS TAB ════════════════ */}

        </div>

        {/* ── Footer ── */}
        <div className={`sticky bottom-0 flex items-center justify-between gap-2 p-6 border-t flex-shrink-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
          <Button type="button" variant="ghost" onClick={() => setDetailDialogOpen(false)} className="h-10 px-5 text-sm rounded-xl text-slate-500">Close</Button>
          <div className="flex gap-2">
            <Button onClick={() => { setDetailDialogOpen(false); openWhatsApp(selectedClient.phone, selectedClient.company_name); }} className="h-10 px-4 text-sm rounded-xl text-white gap-2" style={{ background: '#25D366' }}>
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            {canEditClients && (
              <Button onClick={() => { setDetailDialogOpen(false); handleEdit(selectedClient); }} className="h-10 px-4 text-sm rounded-xl text-white gap-2" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Edit className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
});
// ═══════════════════════════════════════════════════════════════════════════
// PAGINATION BAR — reusable
// ═══════════════════════════════════════════════════════════════════════════
const PaginationBar = React.memo(({ safePg, totalPgs, pageStart, pageSize, totalCount, onPageChange, isDark }) => {
  if (totalPgs <= 1) return null;
  const pageWindow = (() => {
    if (totalPgs <= 7) return Array.from({ length: totalPgs }, (_, i) => i + 1);
    if (safePg <= 4) return [1, 2, 3, 4, 5, '…', totalPgs];
    if (safePg >= totalPgs - 3) return [1, '…', totalPgs - 4, totalPgs - 3, totalPgs - 2, totalPgs - 1, totalPgs];
    return [1, '…', safePg - 1, safePg, safePg + 1, '…', totalPgs];
  })();
  return (
    <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`, background: isDark ? '#1e293b' : '#F8FAFC' }}>
      <p style={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8', margin: 0 }}>
        <span style={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{pageStart + 1}–{Math.min(pageStart + pageSize, totalCount)}</span> of <span style={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{totalCount}</span> clients
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => onPageChange(p => Math.max(1, p - 1))} disabled={safePg === 1} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: safePg === 1 ? 'not-allowed' : 'pointer', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: safePg === 1 ? (isDark ? '#334155' : '#cbd5e1') : (isDark ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, opacity: safePg === 1 ? 0.4 : 1 }}>‹</button>
        {pageWindow.map((p, i) => p === '…'
          ? <span key={`e-${i}`} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: isDark ? '#475569' : '#94a3b8' }}>…</span>
          : <button key={p} onClick={() => onPageChange(p)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: p === safePg ? 'linear-gradient(135deg, #0D3B66, #1F6FB2)' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'), color: p === safePg ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'), fontSize: 11, fontWeight: p === safePg ? 700 : 500, boxShadow: p === safePg ? '0 2px 8px rgba(13,59,102,0.35)' : 'none' }}>{p}</button>
        )}
        <button onClick={() => onPageChange(p => Math.min(totalPgs, p + 1))} disabled={safePg === totalPgs} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', cursor: safePg === totalPgs ? 'not-allowed' : 'pointer', background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', color: safePg === totalPgs ? (isDark ? '#334155' : '#cbd5e1') : (isDark ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, opacity: safePg === totalPgs ? 0.4 : 1 }}>›</button>
      </div>
      <p style={{ fontSize: 11, color: isDark ? '#475569' : '#cbd5e1', margin: 0 }}>Page {safePg} / {totalPgs}</p>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function Clients() {
  const { user, hasPermission } = useAuth();
  const isDark = useDark();
  const isAdmin           = user?.role === 'admin';
  const canViewAllClients = hasPermission("can_view_all_clients");
  const canDeleteData     = hasPermission("can_delete_data");
  const canAssignClients  = hasPermission("can_assign_clients");
  // can_edit_clients: true by default for Manager & User — gates Create/Edit actions
  // Admin always can edit; others need the flag OR to own the specific client (backend enforces)
  const canEditClients    = isAdmin || hasPermission("can_edit_clients");
  const navigate = useNavigate();
  const location = useLocation();
  const handleSendBirthdayWish = async (clientId, clientName) => {
  try {
    const res = await api.post(`/clients/${clientId}/send-birthday-wish`);
    const { sent_to, failed, no_email } = res.data;

    if (sent_to.length > 0) {
      toast.success(`Birthday wish sent to ${sent_to.join(', ')}`);
    }
    if (failed.length > 0) {
      toast.error(`Failed to send to: ${failed.join(', ')}`);
    }
    if (no_email.length > 0) {
      toast.warning(`No email found for: ${no_email.join(', ')}`);
    }
  } catch (err) {
    toast.error('Failed to send birthday wish');
  }
};

  // ── Data state ──────────────────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [users, setUsers]     = useState([]);
  const [savedReferrers, setSavedReferrers] = useState([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [loading, setLoading]           = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [otherService, setOtherService] = useState('');
  const [selectedClient, setSelectedClient]   = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [bulkMsgOpen, setBulkMsgOpen]   = useState(false);
  const [bulkMsgMode, setBulkMsgMode]   = useState('whatsapp');
  const [referrerInput, setReferrerInput]       = useState('');
  const [referrerSelectValue, setReferrerSelectValue] = useState('');
  const [mdsPreviewOpen, setMdsPreviewOpen]     = useState(false);
  const [mdsPreviewLoading, setMdsPreviewLoading] = useState(false);
  const [mdsData, setMdsData]       = useState(null);
  const [mdsForm, setMdsForm]       = useState(null);
  const [mdsRawInfoOpen, setMdsRawInfoOpen] = useState(false);
  const [previewData, setPreviewData]     = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewOpen, setPreviewOpen]     = useState(false);

  // ── Persisted preferences (inlined localStorage — avoids custom hook bundler issues) ──
  const [viewMode, setViewModeRaw] = useState(() => {
    try { return localStorage.getItem('clients_viewMode') || 'list'; } catch { return 'list'; }
  });
  const setViewMode = useCallback((v) => {
    setViewModeRaw(v);
    try { localStorage.setItem('clients_viewMode', v); } catch {}
  }, []);

  const [sortOrder, setSortOrderRaw] = useState(() => {
    try { return localStorage.getItem('clients_sortOrder') || 'lifo'; } catch { return 'lifo'; }
  });
  const setSortOrder = useCallback((v) => {
    setSortOrderRaw(v);
    try { localStorage.setItem('clients_sortOrder', v); } catch {}
  }, []);

  // ── Filter state ────────────────────────────────────────────────────────
  const [searchInput, setSearchInput]         = useState('');
  const [serviceFilter, setServiceFilter]     = useState('all');
  const [statusFilter, setStatusFilter]       = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [clientTypeFilter, setClientTypeFilter] = useState('all');

  // Debounced search — inlined to avoid custom hook bundler issues
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // ── Pagination ──────────────────────────────────────────────────────────
  const [boardPage, setBoardPage] = useState(1);
  const [listPage, setListPage]   = useState(1);

  // ── Form state ──────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    company_name: '', client_type: 'proprietor', client_type_other: '',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
    email: '', phone: '', birthday: '', address: '', city: '', state: '', services: [],
    dsc_details: [], assignments: [{ ...EMPTY_ASSIGNMENT }], notes: '', status: 'active', referred_by: '',
    // Tax & Billing
    gstin: '', pan: '', gst_treatment: 'regular', place_of_supply: '',
    default_payment_terms: 'Due on receipt', credit_limit: '', opening_balance: '',
    opening_balance_type: 'Dr', tally_ledger_name: '', tally_group: 'Sundry Debtors',
    website: '', msme_number: '',
  });
  const [formErrors, setFormErrors]     = useState({});
  const [contactErrors, setContactErrors] = useState([]);

  // ── Refs ────────────────────────────────────────────────────────────────
  const fileInputRef  = useRef(null);
  const excelInputRef = useRef(null);
  const searchRef     = useRef(null);
  // pending delete undo ref
  const pendingDeleteRef = useRef(null);

  // ── Style helpers ────────────────────────────────────────────────────────
  const fieldCls = (hasError) => `h-11 rounded-xl text-sm transition-colors ${hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'}`;
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const mdsFieldCls = "h-10 rounded-xl text-sm border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors w-full px-3 border";

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Ctrl/Cmd + K → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // N → open new client (only when no dialog/input is focused)
      if (e.key === 'n' && !dialogOpen && !detailDialogOpen && !bulkMsgOpen && document.activeElement.tagName === 'BODY') {
        openAddDialog();
      }
      // Escape → clear search if focused
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearchInput('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialogOpen, detailDialogOpen, bulkMsgOpen]);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try { const r = await api.get('/clients'); setClients(r.data || []); }
    catch { toast.error('Failed to fetch clients'); }
    finally { setClientsLoading(false); }
  }, []);

  const fetchUsers = useCallback(async () => {
    try { const r = await api.get('/users'); setUsers(r.data); }
    catch (e) { console.error('Failed to fetch users:', e); }
  }, []);

  const fetchReferrers = useCallback(async () => {
    try {
      const r = await api.get('/referrers');
      setSavedReferrers((r.data || []).map(x => (typeof x === 'string' ? x : x.name)).filter(Boolean));
    } catch {
      try { setSavedReferrers(JSON.parse(localStorage.getItem('taskosphere_referrers') || '[]').map(x => (typeof x === 'string' ? x : x.name)).filter(Boolean)); }
      catch { setSavedReferrers([]); }
    }
  }, []);

  useEffect(() => {
    fetchClients(); fetchUsers(); fetchReferrers();
    const params = new URLSearchParams(location.search);
    if (params.get("openAddClient") === "true") setDialogOpen(true);
  }, [location]);

  // ── Referrer sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const val = formData.referred_by;
    if (!val) { setReferrerSelectValue(''); setReferrerInput(''); }
    else if (val === 'Our Client') { setReferrerSelectValue('Our Client'); setReferrerInput(''); }
    else if (savedReferrers.includes(val)) { setReferrerSelectValue(val); setReferrerInput(''); }
    else { setReferrerSelectValue('__other__'); setReferrerInput(val); }
  }, [formData.referred_by, savedReferrers]);

  const saveReferrer = useCallback(async (name) => {
    const t = name?.trim();
    if (!t) return t;
    const existing = savedReferrers.find(r => r.toLowerCase() === t.toLowerCase());
    if (existing) return existing;
    const updated = [...savedReferrers, t];
    setSavedReferrers(updated);
    try { await api.post('/referrers', { name: t }); }
    catch { localStorage.setItem('taskosphere_referrers', JSON.stringify(updated)); }
    return t;
  }, [savedReferrers]);

  // ── Filter & sort ────────────────────────────────────────────────────────
  const filteredClients = useMemo(() => clients.filter(c => {
    const q = searchTerm.toLowerCase();
    if (q && !(c?.company_name || '').toLowerCase().includes(q) && !(c?.email || '').toLowerCase().includes(q) && !(c?.phone || '').includes(searchTerm)) return false;
    if (serviceFilter !== 'all' && !(c?.services ?? []).some(s => (s || '').toLowerCase().includes(serviceFilter.toLowerCase()))) return false;
    if (statusFilter !== 'all' && (c?.status || 'active') !== statusFilter) return false;
    if (clientTypeFilter !== 'all' && (c?.client_type || 'proprietor') !== clientTypeFilter) return false;
    if (assignedToFilter !== 'all') {
      const assignments = c?.assignments || [];
      const legacy = c?.assigned_to;
      const matched = assignments.length > 0 ? assignments.some(a => a.user_id === assignedToFilter) : legacy === assignedToFilter;
      if (!matched) return false;
    }
    return true;
  }), [clients, searchTerm, serviceFilter, statusFilter, assignedToFilter, clientTypeFilter]);

  const sortedClients = useMemo(() => {
    const arr = [...filteredClients];
    if (sortOrder === 'az') return arr.sort((a, b) => (a.company_name || '').toLowerCase().localeCompare((b.company_name || '').toLowerCase()));
    if (sortOrder === 'za') return arr.sort((a, b) => (b.company_name || '').toLowerCase().localeCompare((a.company_name || '').toLowerCase()));
    return arr.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === 'fifo' ? ta - tb : tb - ta;
    });
  }, [filteredClients, sortOrder]);

  useEffect(() => { setBoardPage(1); setListPage(1); }, [searchTerm, serviceFilter, statusFilter, assignedToFilter, clientTypeFilter, sortOrder, clients]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalClients  = filteredClients.length;
    const activeClients = filteredClients.filter(c => (c?.status || 'active') === 'active').length;
    const serviceCounts = {};
    filteredClients.forEach(c => { (c?.services || []).forEach(s => { const n = s?.startsWith('Other:') ? 'Other' : s; serviceCounts[n] = (serviceCounts[n] || 0) + 1; }); });
    return { totalClients, activeClients, serviceCounts };
  }, [filteredClients]);

  // ── DSC alert — clients with DSC expiring within 30 days ─────────────────
  const dscAlerts = useMemo(() => {
    const alerts = [];
    clients.forEach(c => {
      (c.dsc_details || []).forEach(d => {
        const days = getDscDaysLeft(d.expiry_date);
        if (days !== null && days >= 0 && days <= 30) {
          alerts.push({ client: c, dsc: d, days });
        }
      });
    });
    return alerts.sort((a, b) => a.days - b.days);
  }, [clients]);

  // ── Birthday reminders ────────────────────────────────────────────────────
  const todayReminders = useMemo(() => {
    const today = startOfDay(new Date());
    return clients.filter(c => c?.contact_persons?.some(cp => {
      if (!cp?.birthday) return false;
      const bday = new Date(cp.birthday);
      return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
    }) ?? false);
  }, [clients]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getClientNumber = useCallback((index) => String(index + 1).padStart(3, '0'), []);

  const getClientAssignments = useCallback((client) => {
    if (client?.assignments?.length > 0) return client.assignments;
    if (client?.assigned_to) return [{ user_id: client.assigned_to, services: [] }];
    return [];
  }, []);

  const openWhatsApp = useCallback((phone, name = "") => {
    const cleanPhone = phone?.replace(/\D/g, '') || '';
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`)}`, '_blank');
  }, []);

  // ── Export filtered list ──────────────────────────────────────────────────
  const handleExportList = useCallback(() => {
    if (sortedClients.length === 0) { toast.error('No clients to export'); return; }
    const rows = [
      ['#', 'Company', 'Type', 'Email', 'Phone', 'City', 'State', 'Services', 'Status', 'Referred By', 'Added'],
      ...sortedClients.map((c, i) => [
        i + 1, c.company_name, c.client_type, c.email || '', c.phone || '',
        c.city || '', c.state || '',
        (c.services || []).join(', '),
        c.status || 'active', c.referred_by || '',
        c.created_at ? format(new Date(c.created_at), 'dd-MMM-yyyy') : '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, `clients_export_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);
    toast.success(`Exported ${sortedClients.length} clients to Excel`);
  }, [sortedClients]);

  // ── Delete with undo ────────────────────────────────────────────────────
  const handleDelete = useCallback((client) => {
    // Optimistic remove
    setClients(prev => prev.filter(c => c.id !== client.id));
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      try { await api.delete(`/clients/${client.id}`); }
      catch { toast.error('Delete failed — restoring client'); setClients(prev => [client, ...prev]); }
    }, UNDO_DELAY_MS);

    pendingDeleteRef.current = { cancel: () => { cancelled = true; clearTimeout(timer); setClients(prev => { if (prev.find(c => c.id === client.id)) return prev; return [client, ...prev]; }); } };

    toast(`"${client.company_name}" deleted`, {
      duration: UNDO_DELAY_MS,
      action: { label: 'Undo', onClick: () => { pendingDeleteRef.current?.cancel(); toast.success('Delete cancelled'); } },
    });
  }, []);

  // ── Validate form ────────────────────────────────────────────────────────
  const validateForm = useCallback(() => {
    const errors = {};
    const cErrors = [];
    if (!formData.company_name?.trim() || formData.company_name.trim().length < 3) errors.company_name = 'Company name must be at least 3 characters';
    const em = formData.email?.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errors.email = 'Please enter a valid email address';
    const cleanPhone = formData.phone ? formData.phone.replace(/\D/g, '') : '';
    if (cleanPhone && cleanPhone.length !== 10) errors.phone = 'Phone number must be exactly 10 digits (or leave blank)';
    formData.contact_persons.forEach((cp, idx) => {
      const contactErr = {};
      const n = cp.name?.trim();
      if (!n && (cp.email?.trim() || cp.phone?.trim() || cp.designation?.trim() || cp.birthday || cp.din?.trim())) contactErr.name = 'Contact name is required';
      if (cp.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cp.email.trim())) contactErr.email = 'Invalid email format';
      const cPhone = cp.phone ? cp.phone.replace(/\D/g, '') : '';
      if (cPhone && cPhone.length !== 10) contactErr.phone = 'Phone must be 10 digits';
      if (Object.keys(contactErr).length > 0) cErrors[idx] = contactErr;
    });
    // Duplicate email check
    const allEmails = new Set();
    if (em) allEmails.add(em.toLowerCase());
    formData.contact_persons.forEach(cp => { if (cp.email?.trim()) allEmails.add(cp.email.trim().toLowerCase()); });
    if (allEmails.size !== (em ? 1 : 0) + formData.contact_persons.filter(cp => cp.email?.trim()).length) errors.email = (errors.email || '') + ' (duplicate email detected)';
    setFormErrors(errors); setContactErrors(cErrors);
    return { valid: Object.keys(errors).length === 0 && cErrors.length === 0, errors, cErrors };
  }, [formData]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const { valid } = validateForm();
    if (!valid) {
      toast.error('Please fix the highlighted errors before saving');
      // Scroll to first error
      setTimeout(() => { document.querySelector('[data-field-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
      return;
    }
    setLoading(true);
    try {
      let finalServices = formData.services.filter(s => !s.startsWith('Other:'));
      if (otherService.trim() && formData.services.includes('Other')) finalServices.push(`Other: ${otherService.trim()}`);
      const cleanPhone = formData.phone ? formData.phone.replace(/\D/g, '') : '';
      const cleanedContacts = formData.contact_persons.filter(cp => cp.name?.trim()).map(cp => ({
        name: cp.name.trim(), designation: cp.designation?.trim() || null,
        email: cp.email?.trim() || null, phone: cp.phone ? (cp.phone.replace(/\D/g, '') || null) : null,
        birthday: safeDate(cp.birthday) || null, din: cp.din?.trim() || null,
      }));
      const cleanedDSC = formData.dsc_details.map(dsc => ({
        certificate_number: dsc.certificate_number?.trim() || '', holder_name: dsc.holder_name?.trim() || '',
        issue_date: safeDate(dsc.issue_date), expiry_date: safeDate(dsc.expiry_date), notes: dsc.notes?.trim() || null,
      }));
      const cleanedAssignments = (formData.assignments || []).filter(a => a.user_id && a.user_id !== 'unassigned').map(a => ({ user_id: a.user_id, services: a.services || [] }));
      const finalReferredBy = formData.referred_by?.trim() || null;
      if (finalReferredBy && finalReferredBy !== 'Our Client' && !savedReferrers.includes(finalReferredBy)) await saveReferrer(finalReferredBy);
      
      const payload = {
        company_name: formData.company_name.trim(), client_type: formData.client_type,
        ...(formData.client_type === 'other' ? { client_type_label: formData.client_type_other?.trim() || 'Other' } : { client_type_label: null }),
        email: trimmedEmail(formData.email), phone: cleanPhone || null,
        birthday: safeDate(formData.birthday) || null, address: formData.address?.trim() || null,
        city: formData.city?.trim() || null, state: formData.state?.trim() || null,
        services: finalServices, notes: formData.notes?.trim() || null,
        assigned_to: cleanedAssignments[0]?.user_id || null, assignments: cleanedAssignments,
        status: formData.status, contact_persons: cleanedContacts, dsc_details: cleanedDSC,
        referred_by: finalReferredBy || null,
        // Tax & Billing
        gstin: formData.gstin?.trim().toUpperCase() || null,
        pan: formData.pan?.trim().toUpperCase() || null,
        gst_treatment: formData.gst_treatment || 'regular',
        place_of_supply: formData.place_of_supply?.trim() || null,
        default_payment_terms: formData.default_payment_terms || 'Due on receipt',
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
        opening_balance: formData.opening_balance ? Number(formData.opening_balance) : null,
        opening_balance_type: formData.opening_balance_type || 'Dr',
        tally_ledger_name: formData.tally_ledger_name?.trim() || null,
        tally_group: formData.tally_group || 'Sundry Debtors',
        website: formData.website?.trim() || null,
        msme_number: formData.msme_number?.trim() || null,
      };
      if (!editingClient) {
        const dup = clients.find(c => c.company_name?.toLowerCase().trim() === payload.company_name?.toLowerCase().trim());
        if (dup) { toast.error(`"${payload.company_name}" already exists`); setLoading(false); return; }
      }
      if (editingClient) await api.put(`/clients/${editingClient.id}`, payload);
      else await api.post('/clients', payload);
      if (!editingClient) { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
      setDialogOpen(false); resetForm(); fetchClients();
      toast.success(editingClient ? 'Client updated!' : 'Client created!');
      // Sync updated client details to all linked invoices (non-fatal)
      if (editingClient) {
        try {
          await api.patch(`/invoices/sync-client/${editingClient.id}`, {
            client_name:    payload.company_name,
            client_gstin:   payload.gstin   || '',
            client_phone:   cleanPhone      || '',
            client_email:   payload.email   || '',
            client_address: payload.address || '',
            client_state:   payload.state   || '',
          });
        } catch { /* non-fatal */ }
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) toast.error(detail.map(e => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(' | '));
      else toast.error(detail || 'Error saving client');
    }
    finally { setLoading(false); }
  }, [formData, otherService, editingClient, clients, savedReferrers, validateForm, saveReferrer, fetchClients]);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleEdit = useCallback((client) => {
    setEditingClient(client);
    let assignments = client?.assignments || [];
    if (assignments.length === 0 && client?.assigned_to) assignments = [{ user_id: client.assigned_to, services: [] }];
    if (assignments.length === 0) assignments = [{ ...EMPTY_ASSIGNMENT }];
    setFormData({
      ...client,
      client_type_other: client?.client_type === 'other' ? (client?.client_type_label || '') : '',
      contact_persons: client?.contact_persons?.length > 0
        ? client.contact_persons.map(cp => ({ ...cp, birthday: cp?.birthday ? format(new Date(cp.birthday), 'yyyy-MM-dd') : '', din: cp?.din || '' }))
        : [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      birthday: client?.birthday ? format(new Date(client.birthday), 'yyyy-MM-dd') : '',
      dsc_details: (client?.dsc_details || []).map(d => ({ ...d, issue_date: d?.issue_date ? format(new Date(d.issue_date), 'yyyy-MM-dd') : '', expiry_date: d?.expiry_date ? format(new Date(d.expiry_date), 'yyyy-MM-dd') : '' })),
      status: client?.status || 'active', assignments, referred_by: client?.referred_by || '',
    });
    const other = client?.services?.find(s => s.startsWith('Other: '));
    setOtherService(other ? other.replace('Other: ', '') : '');
    setDialogOpen(true); setFormErrors({}); setContactErrors([]);
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ company_name: '', client_type: 'proprietor', client_type_other: '', contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }], email: '', phone: '', birthday: '', address: '', city: '', state: '', services: [], dsc_details: [], assignments: [{ ...EMPTY_ASSIGNMENT }], notes: '', status: 'active', referred_by: '', gstin: '', pan: '', gst_treatment: 'regular', place_of_supply: '', default_payment_terms: 'Due on receipt', credit_limit: '', opening_balance: '', opening_balance_type: 'Dr', tally_ledger_name: '', tally_group: 'Sundry Debtors', website: '', msme_number: '' });
    setOtherService(''); setEditingClient(null); setFormErrors({}); setContactErrors([]); setReferrerInput(''); setReferrerSelectValue('');
  }, []);

  useEffect(() => { if (!dialogOpen) { setFormErrors({}); setContactErrors([]); } }, [dialogOpen]);

  // ── Draft persistence: save add-form to localStorage whenever it changes ──
  const DRAFT_KEY = 'taskosphere_clients_add_draft';
  useEffect(() => {
    if (dialogOpen && !editingClient) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, otherService })); } catch {}
    }
  }, [formData, otherService, dialogOpen, editingClient]);

  // Restore draft when opening add dialog
  const openAddDialog = useCallback(() => {
    resetForm(); // ← ADD THIS FIRST
    try {
      const saved = localStorage.getItem(DRAFT_KEY);;
      if (saved) {
        const { formData: savedForm, otherService: savedOther } = JSON.parse(saved);
        if (savedForm?.company_name?.trim()) {
          setFormData(prev => ({ ...prev, ...savedForm }));
          setOtherService(savedOther || '');
        }
      }
    } catch {}
    setEditingClient(null);
    setDialogOpen(true);
    setFormErrors({});
    setContactErrors([]);
  }, []);

  // ── Contact/DSC/Assignment helpers ────────────────────────────────────────
  const updateContact = useCallback((idx, field, val) => {
    setFormData(p => ({ ...p, contact_persons: p.contact_persons.map((c, i) => i === idx ? { ...c, [field]: val } : c) }));
    setContactErrors(prev => { const n = [...prev]; if (n[idx]) { delete n[idx][field]; if (!Object.keys(n[idx]).length) n[idx] = undefined; } return n; });
  }, []);
  const addContact    = useCallback(() => setFormData(p => ({ ...p, contact_persons: [...p.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }] })), []);
  const removeContact = useCallback((idx) => setFormData(p => ({ ...p, contact_persons: p.contact_persons.filter((_, i) => i !== idx) })), []);
  const updateDSC     = useCallback((idx, field, val) => setFormData(p => ({ ...p, dsc_details: p.dsc_details.map((d, i) => i === idx ? { ...d, [field]: val } : d) })), []);
  const addDSC        = useCallback(() => setFormData(p => ({ ...p, dsc_details: [...p.dsc_details, { certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: '' }] })), []);
  const removeDSC     = useCallback((idx) => setFormData(p => ({ ...p, dsc_details: p.dsc_details.filter((_, i) => i !== idx) })), []);
  const addAssignment    = useCallback(() => setFormData(p => ({ ...p, assignments: [...(p.assignments || []), { ...EMPTY_ASSIGNMENT }] })), []);
  const removeAssignment = useCallback((idx) => setFormData(p => ({ ...p, assignments: (p.assignments || []).filter((_, i) => i !== idx) })), []);
  const updateAssignmentUser = useCallback((idx, userId) => setFormData(p => ({ ...p, assignments: (p.assignments || []).map((a, i) => i === idx ? { ...a, user_id: userId } : a) })), []);
  const toggleAssignmentService = useCallback((idx, svc) => setFormData(p => ({ ...p, assignments: (p.assignments || []).map((a, i) => { if (i !== idx) return a; const services = a.services.includes(svc) ? a.services.filter(s => s !== svc) : [...a.services, svc]; return { ...a, services }; }) })), []);
  const toggleService = useCallback((s) => { setFormData(p => ({ ...p, services: p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s] })); setFormErrors(prev => ({ ...prev, services: undefined })); }, []);
  const addOtherService = useCallback(() => {
    const t = otherService.trim(); if (!t) return;
    const existing = formData.services.filter(s => s.startsWith('Other:')).map(s => s.replace('Other: ', '').toLowerCase());
    const builtin = SERVICES.find(s => s.toLowerCase() === t.toLowerCase() && s !== 'Other');
    if (builtin) { toast.info(`"${builtin}" is already a standard service`); return; }
    if (existing.includes(t.toLowerCase())) { toast.info(`"${t}" already added`); setOtherService(''); return; }
    setFormData(prev => ({ ...prev, services: [...prev.services.filter(s => !s.startsWith('Other:')), `Other: ${t}`] }));
    setOtherService('');
  }, [otherService, formData.services]);

  // ── Referrer handlers ─────────────────────────────────────────────────────
  const handleReferrerSelectChange = useCallback((val) => {
    setReferrerSelectValue(val);
    if (val === '__other__') { setReferrerInput(''); setFormData(prev => ({ ...prev, referred_by: '' })); }
    else { setReferrerInput(''); setFormData(prev => ({ ...prev, referred_by: val === '' ? '' : val })); }
  }, []);
  const handleReferrerInputChange = useCallback((val) => { setReferrerInput(val); setFormData(prev => ({ ...prev, referred_by: val })); }, []);
  const handleSaveReferrer = useCallback(async () => {
    const name = referrerInput.trim();
    if (!name) { toast.error('Please enter a referrer name'); return; }
    const dup = savedReferrers.find(r => r.toLowerCase() === name.toLowerCase());
    if (dup) { toast.info(`"${dup}" already exists — selected!`); setReferrerSelectValue(dup); setReferrerInput(''); setFormData(prev => ({ ...prev, referred_by: dup })); return; }
    const saved = await saveReferrer(name);
    setReferrerSelectValue(saved); setReferrerInput(''); setFormData(prev => ({ ...prev, referred_by: saved }));
    toast.success(`"${saved}" added to referrer list`);
  }, [referrerInput, savedReferrers, saveReferrer]);

  // ── CSV / Excel imports ───────────────────────────────────────────────────
  const downloadTemplate = useCallback(() => {
    const headers = ['company_name','client_type','client_type_label','email','phone','birthday','address','city','state','referred_by','services','notes','status','contact_name_1','contact_designation_1','contact_email_1','contact_phone_1','contact_birthday_1','contact_din_1'];
    const sample  = ['ABC Pvt Ltd','pvt_ltd','','abc@example.com','9876543210','2015-04-01','123 MG Road','Surat','Gujarat','John Smith','GST,ROC','Sample notes','active','Rahul Mehta','Director','rahul@example.com','9876500001','1985-06-15','DIN00001234'];
    const csv = headers.join(',') + '\n' + sample.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'client_import_template.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  }, []);

  const handleImportCSV = useCallback(async (event) => {
    const file = event.target.files[0]; if (!file) return;
    setImportLoading(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await api.post('/clients/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(r.data.message || `${r.data.clients_created || 0} clients imported!`);
      fetchClients();
    } catch (e) { toast.error(e.response?.data?.detail || 'Import failed'); }
    finally { setImportLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [fetchClients]);

  const handleImportExcel = useCallback(async (event) => {
    const file = event.target.files[0]; if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = '';
    setMdsPreviewLoading(true); setMdsPreviewOpen(true); setMdsData(null); setMdsForm(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await api.post('/clients/parse-mds-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = r.data;
      let address = (data.address || data.registered_address || '').trim();
      let city = (data.city || '').trim(), state = (data.state || '').trim();
      if (address && (!city || !state)) {
        const parts = address.split(',').map(p => p.trim()).filter(p => p);
        if (!state && parts.length >= 2) state = parts[parts.length - 2] || '';
        if (!city  && parts.length >= 3) city  = parts[parts.length - 3] || '';
      }
      setMdsData(data);
      const contacts = (data.contact_persons || []).map(cp => ({ name: cp.name || '', designation: cp.designation || '', email: cp.email || '', phone: cp.phone || '', birthday: cp.birthday || '', din: cp.din || '' }));
      if (contacts.length === 0) contacts.push({ name: '', designation: '', email: '', phone: '', birthday: '', din: '' });
      setMdsForm({ company_name: (data.company_name || '').trim(), client_type: data.client_type || 'proprietor', email: (data.email || '').trim(), phone: (data.phone || '').trim(), birthday: data.birthday || '', address, city, state, services: data.services || [], notes: '', status: data.status_value || 'active', contact_persons: contacts, referred_by: (data.referred_by || '').trim() });
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to parse Excel file'); setMdsPreviewOpen(false); }
    finally { setMdsPreviewLoading(false); }
  }, []);

  const handleMdsConfirm = useCallback(async (saveDirectly = false) => {
    if (!mdsForm) return;
    if (saveDirectly) {
      setImportLoading(true);
      try {
        const contacts = mdsForm.contact_persons.filter(cp => cp.name?.trim()).map(cp => ({ name: cp.name.trim(), designation: cp.designation?.trim() || null, email: cp.email?.trim() || null, phone: cp.phone?.replace(/\D/g, '') || null, birthday: safeDate(cp.birthday), din: cp.din?.trim() || null }));
        await api.post('/clients', { company_name: mdsForm.company_name?.trim() || '', client_type: mdsForm.client_type || 'proprietor', email: mdsForm.email?.trim() || null, phone: mdsForm.phone?.replace(/\D/g, '') || null, birthday: safeDate(mdsForm.birthday) || null, address: mdsForm.address?.trim() || null, city: mdsForm.city?.trim() || null, state: mdsForm.state?.trim() || null, services: mdsForm.services || [], notes: mdsForm.notes?.trim() || null, status: mdsForm.status || 'active', contact_persons: contacts, dsc_details: [], assignments: [], assigned_to: null, referred_by: mdsForm.referred_by?.trim() || null });
        toast.success(`Client "${mdsForm.company_name}" saved!`);
        fetchClients(); setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null);
      } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save client'); }
      finally { setImportLoading(false); }
    } else {
      setFormData({ company_name: mdsForm.company_name || '', client_type: mdsForm.client_type || 'proprietor', email: mdsForm.email || '', phone: mdsForm.phone || '', birthday: mdsForm.birthday || '', address: mdsForm.address || '', city: mdsForm.city || '', state: mdsForm.state || '', services: mdsForm.services || [], notes: mdsForm.notes || '', status: mdsForm.status || 'active', contact_persons: mdsForm.contact_persons.length > 0 ? mdsForm.contact_persons : [{ name: '', designation: '', email: '', phone: '', birthday: '', din: '' }], dsc_details: [], assignments: [{ ...EMPTY_ASSIGNMENT }], referred_by: mdsForm.referred_by || '' });
      setEditingClient(null); setFormErrors({}); setContactErrors([]);
      setMdsPreviewOpen(false); setDialogOpen(true);
      toast.info('Form pre-filled from Excel — review and save when ready.');
    }
  }, [mdsForm, fetchClients]);

  // ── Filter clear helpers ────────────────────────────────────────────────
  const clearFilter = useCallback((which) => {
    if (which === 'status')     setStatusFilter('all');
    if (which === 'clientType') setClientTypeFilter('all');
    if (which === 'service')    setServiceFilter('all');
    if (which === 'assigned')   setAssignedToFilter('all');
  }, []);
  const clearAllFilters = useCallback(() => { setStatusFilter('all'); setClientTypeFilter('all'); setServiceFilter('all'); setAssignedToFilter('all'); setSearchInput(''); }, []);

  // ── List row — using itemData pattern so it doesn't recreate per-render ──
  const ListRow = useCallback(({ index, style, data }) => {
    const { pageClients: pc, pageStart: ps } = data;
    const client = pc[index];
    if (!client) return null;
    const globalIndex = ps + index;
    const cfg = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
    const isArchived = client.status === 'inactive';
    const serviceCount = client.services?.length || 0;
    const clientAssignments = getClientAssignments(client);
    return (
      <div style={{ ...style, paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4 }}>
        <div
          className={`relative rounded-xl border transition-all duration-200 overflow-hidden group cursor-pointer flex items-center gap-4 pl-5 pr-3 h-full
            ${isArchived ? 'opacity-60' : ''}
            ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
          onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}>
          <div className="absolute left-0 top-0 h-full w-1" style={{ background: cfg.strip }} />
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: getAvatarGradient(client.company_name) }}>
            {client.company_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="w-56 flex-shrink-0 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-300">#{getClientNumber(globalIndex)}</span>
              {isArchived && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Archived</span>}
            </div>
            <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{client.company_name}</p>
          </div>
          <div className="w-28 flex-shrink-0"><TypePill type={client.client_type} customLabel={client.client_type_label} /></div>
          <div className="w-36 flex-shrink-0">
            <p
              className={`text-xs font-medium cursor-copy ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
              onClick={client.phone ? e => { e.stopPropagation(); copyToClipboard(client.phone, 'Phone'); } : undefined}
              title={client.phone ? 'Click to copy' : ''}>
              {client.phone || '—'}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-xs truncate cursor-copy ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
              onClick={client.email ? e => { e.stopPropagation(); copyToClipboard(client.email, 'Email'); } : undefined}
              title={client.email ? 'Click to copy' : ''}>
              {client.email || '—'}
            </p>
          </div>
          <div className="flex items-center gap-1 w-44 flex-shrink-0">
            {client.services?.slice(0, 2).map((svc, i) => <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>{svc.replace('Other: ', '').substring(0, 10)}</span>)}
            {serviceCount > 2 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">+{serviceCount - 2}</span>}
          </div>
          <div className="w-32 flex-shrink-0 flex flex-col gap-0.5">
            {clientAssignments.slice(0, 2).map((a, i) => { const u = users.find(x => x.id === a.user_id); return u ? <span key={i} className="text-[10px] text-slate-500 truncate">{u.full_name || u.name}{a.services?.length > 0 && <span className="text-slate-400"> · {a.services[0]}{a.services.length > 1 ? `+${a.services.length - 1}` : ''}</span>}</span> : null; })}
            {clientAssignments.length > 2 && <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>+{clientAssignments.length - 2} more</span>}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"><MessageCircle className="h-3.5 w-3.5" /></button>
            {canEditClients && <button onClick={e => { e.stopPropagation(); handleEdit(client); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"><Edit className="h-3.5 w-3.5" /></button>}
            {canDeleteData && <button onClick={e => { e.stopPropagation(); handleDelete(client); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      </div>
    );
  }, [isDark, users, getClientAssignments, getClientNumber, openWhatsApp, handleEdit, canEditClients, canDeleteData, handleDelete]);

  // ── Pagination derived values ──────────────────────────────────────────────
  const boardTotalPages = Math.ceil(sortedClients.length / BOARD_PAGE_SIZE);
  const boardSafePage   = Math.min(boardPage, Math.max(1, boardTotalPages));
  const boardPageStart  = (boardSafePage - 1) * BOARD_PAGE_SIZE;
  const boardPageClients = sortedClients.slice(boardPageStart, boardPageStart + BOARD_PAGE_SIZE);

  const listTotalPages  = Math.ceil(sortedClients.length / LIST_PAGE_SIZE);
  const listSafePage    = Math.min(listPage, Math.max(1, listTotalPages));
  const listPageStart   = (listSafePage - 1) * LIST_PAGE_SIZE;
  const listPageClients = sortedClients.slice(listPageStart, listPageStart + LIST_PAGE_SIZE);
  const listHeight      = Math.min(listPageClients.length, MAX_VISIBLE_ROWS) * LIST_ROW_HEIGHT;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-5 md:p-7 space-y-5" style={{ background: isDark ? '#0f172a' : '#F4F6FA' }}>

      {/* PAGE HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 60%, #2a85cc 100%)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 px-7 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0"><Users className="h-6 w-6 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Clients</h1>
              <p className="text-sm text-blue-200 mt-0.5">Central hub for all client relationships · <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">Ctrl+K</kbd> search · <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">N</kbd> new</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm"><FileText className="h-4 w-4" /> CSV Template</Button>
            {canEditClients && <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl backdrop-blur-sm">{importLoading ? 'Importing…' : 'Import CSV'}</Button>}
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              {canEditClients && (
              <DialogTrigger asChild>
                <Button onClick={openAddDialog} className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0"><Plus className="h-4 w-4" /> New Client</Button>
              </DialogTrigger>
              )}
              <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-0">
                <div className={`sticky top-0 z-10 border-b px-8 py-5 flex items-center justify-between ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
                  <div>
                    <DialogTitle className={`text-xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{editingClient ? 'Edit Client Profile' : 'New Client Profile'}</DialogTitle>
                    <DialogDescription className="text-sm text-slate-400 mt-0.5">Complete client information and preferences</DialogDescription>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                    <Switch checked={formData.status === 'active'} onCheckedChange={c => setFormData(p => ({ ...p, status: c ? 'active' : 'inactive' }))} />
                    <span className={`text-xs font-semibold ${formData.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>{formData.status === 'active' ? 'Active' : 'Archived'}</span>
                  </div>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-7">
                  {/* Basic Details */}
                  <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                    <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="Basic Details" subtitle="Company identity and primary contact" isDark={isDark} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
                        <Input data-field-error={formErrors.company_name ? true : undefined} className={fieldCls(formErrors.company_name)} value={formData.company_name} onChange={e => { setFormData(p => ({ ...p, company_name: e.target.value })); if (formErrors.company_name) setFormErrors(prev => ({ ...prev, company_name: undefined })); }} required />
                        {formErrors.company_name && <p className="text-red-500 text-xs mt-1">{formErrors.company_name}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Client Type <span className="text-red-400">*</span></label>
                        <Select value={formData.client_type} onValueChange={v => setFormData(p => ({ ...p, client_type: v, client_type_other: '' }))}>
                          <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {formData.client_type === 'other' && <Input className={`mt-2 h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} placeholder="Specify client type…" value={formData.client_type_other} onChange={e => setFormData(p => ({ ...p, client_type_other: e.target.value }))} autoFocus />}
                      </div>
                      <div>
                        <label className={labelCls}>Email Address</label>
                        <Input data-field-error={formErrors.email ? true : undefined} className={fieldCls(formErrors.email)} type="email" value={formData.email} onChange={e => { setFormData(p => ({ ...p, email: e.target.value })); if (formErrors.email) setFormErrors(prev => ({ ...prev, email: undefined })); }} />
                        {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Phone Number <span className="text-slate-400 font-normal">(optional)</span></label>
                        <Input data-field-error={formErrors.phone ? true : undefined} className={fieldCls(formErrors.phone)} value={formData.phone} onChange={e => { setFormData(p => ({ ...p, phone: e.target.value })); if (formErrors.phone) setFormErrors(prev => ({ ...prev, phone: undefined })); }} />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Date of Incorporation</label>
                        <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} type="date" value={formData.birthday} onChange={e => setFormData(p => ({ ...p, birthday: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Referred By</label>
                        <div className="relative"><Share2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                          <select className="h-11 bg-white border border-slate-200 focus:border-blue-400 rounded-xl text-sm pl-10 pr-4 w-full appearance-none outline-none transition-colors cursor-pointer" value={referrerSelectValue} onChange={e => handleReferrerSelectChange(e.target.value)}>
                            <option value="">— Select referral source —</option>
                            <option value="Our Client">Our Client</option>
                            {savedReferrers.filter(r => r !== 'Our Client').map(r => <option key={r} value={r}>{r}</option>)}
                            <option value="__other__">+ Other</option>
                          </select>
                        </div>
                        {referrerSelectValue === '__other__' && (
                          <div className="flex gap-2 mt-2">
                            <Input className={`flex-1 h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} placeholder="Type referrer's name…" value={referrerInput} onChange={e => handleReferrerInputChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveReferrer(); } }} autoFocus />
                            <Button type="button" onClick={handleSaveReferrer} className="h-11 px-4 rounded-xl text-white text-sm font-semibold gap-1.5" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}><Plus className="h-4 w-4" /> Save</Button>
                          </div>
                        )}
                        {referrerSelectValue === '__other__' && (() => {
                          const isDup = referrerInput.trim() && savedReferrers.some(r => r.toLowerCase() === referrerInput.trim().toLowerCase());
                          return isDup
                            ? <p className="text-[10px] text-amber-600 mt-1.5">⚠ "{referrerInput.trim()}" already exists — click Save to select it</p>
                            : <p className="text-[10px] text-slate-400 mt-1.5">Press Enter or click Save — name will appear in dropdown next time</p>;
                        })()}
                      </div>
                      <div className="md:col-span-2"><label className={labelCls}>Address</label><Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} placeholder="Street address (optional)" value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} /></div>
                      <div><label className={labelCls}>City</label><Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={formData.city} onChange={e => setFormData(p => ({ ...p, city: e.target.value }))} /></div>
                      <div><label className={labelCls}>State</label><Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={formData.state} onChange={e => setFormData(p => ({ ...p, state: e.target.value }))} /></div>
                    </div>
                  </div>
                  {/* Contact Persons */}
                  <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeading icon={<Users className="h-4 w-4" />} title="Contact Persons" subtitle="Key people you work with (birthdays tracked here)" isDark={isDark} />
                      <Button type="button" size="sm" onClick={addContact} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2"><Plus className="h-3 w-3 mr-1" /> Add Person</Button>
                    </div>
                    {formErrors.contacts && <p className="text-red-500 text-xs mb-4 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.contacts}</p>}
                    <div className="space-y-4">{formData.contact_persons.map((cp, idx) => (
                      <div key={idx} className={`border rounded-xl p-5 relative ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div><span className="text-sm font-semibold text-slate-700">Contact Person</span></div>
                          {formData.contact_persons.length > 1 && <button type="button" onClick={() => removeContact(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash className="h-3.5 w-3.5" /></button>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div><label className={labelCls}>Full Name</label><Input data-field-error={contactErrors[idx]?.name ? true : undefined} value={cp.name} onChange={e => updateContact(idx, 'name', e.target.value)} className={fieldCls(contactErrors[idx]?.name)} />{contactErrors[idx]?.name && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].name}</p>}</div>
                          <div><label className={labelCls}>Designation</label><Input value={cp.designation} onChange={e => updateContact(idx, 'designation', e.target.value)} className={fieldCls(false)} /></div>
                          <div><label className={labelCls}>Email</label><Input type="email" value={cp.email} onChange={e => updateContact(idx, 'email', e.target.value)} className={fieldCls(contactErrors[idx]?.email)} />{contactErrors[idx]?.email && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].email}</p>}</div>
                          <div><label className={labelCls}>Phone</label><Input value={cp.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className={fieldCls(contactErrors[idx]?.phone)} />{contactErrors[idx]?.phone && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].phone}</p>}</div>
                          <div><label className={labelCls}>Date of Birth</label><Input type="date" value={cp.birthday || ''} onChange={e => updateContact(idx, 'birthday', e.target.value)} className={fieldCls(false)} /></div>
                          <div><label className={labelCls}>DIN (Director ID)</label><Input value={cp.din || ''} onChange={e => updateContact(idx, 'din', e.target.value)} className={fieldCls(false)} /></div>
                        </div>
                      </div>
                    ))}</div>
                  </div>
                  {/* DSC Details */}
                  <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeading icon={<Shield className="h-4 w-4" />} title="DSC Details" subtitle="Digital Signature Certificates" isDark={isDark} />
                      <Button type="button" size="sm" onClick={addDSC} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2"><Plus className="h-3 w-3 mr-1" /> Add DSC</Button>
                    </div>
                    <div className="space-y-4">{formData.dsc_details.map((dsc, idx) => (
                      <div key={idx} className={`border rounded-xl p-5 relative ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div><span className="text-sm font-semibold text-slate-700">DSC Certificate</span></div>
                          <button type="button" onClick={() => removeDSC(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div><label className={labelCls}>Certificate Number</label><Input value={dsc.certificate_number} onChange={e => updateDSC(idx, 'certificate_number', e.target.value)} className={fieldCls(false)} /></div>
                          <div><label className={labelCls}>Holder Name</label><Input value={dsc.holder_name} onChange={e => updateDSC(idx, 'holder_name', e.target.value)} className={fieldCls(false)} /></div>
                          <div><label className={labelCls}>Issue Date</label><Input type="date" value={dsc.issue_date || ''} onChange={e => updateDSC(idx, 'issue_date', e.target.value)} className={fieldCls(false)} /></div>
                          <div><label className={labelCls}>Expiry Date</label><Input type="date" value={dsc.expiry_date || ''} onChange={e => updateDSC(idx, 'expiry_date', e.target.value)} className={fieldCls(false)} /></div>
                          <div className="md:col-span-2"><label className={labelCls}>Notes</label><Textarea value={dsc.notes || ''} onChange={e => updateDSC(idx, 'notes', e.target.value)} className={`min-h-[80px] rounded-xl text-sm resize-y ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} /></div>
                        </div>
                      </div>
                    ))}</div>
                  </div>
                  {/* Services */}
                  <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                    <SectionHeading icon={<BarChart3 className="h-4 w-4" />} title="Services" subtitle="Select all applicable services" isDark={isDark} />
                    <div className="flex flex-wrap gap-2">{SERVICES.map(s => { const isSel = formData.services.includes(s) || (s === 'Other' && formData.services.some(x => x.startsWith('Other:'))); return <button key={s} type="button" onClick={() => toggleService(s)} className={`px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all ${isSel ? 'text-white border-transparent shadow-sm' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`} style={isSel ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)', borderColor: 'transparent' } : {}}>{s}</button>; })}</div>
                    {formData.services.includes('Other') && (
                      <div className="flex gap-3 items-end max-w-sm mt-4">
                        <div className="flex-1"><label className={labelCls}>Specify Other Service</label><Input placeholder="e.g. IEC Registration" value={otherService} onChange={e => setOtherService(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOtherService(); } }} className="h-10 rounded-xl text-sm border-slate-200" /></div>
                        <Button type="button" size="sm" onClick={addOtherService} className="h-10 px-5 rounded-xl text-sm" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>Add</Button>
                      </div>
                    )}
                  </div>
                  {/* Tax & Billing */}
                  <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                    <SectionHeading icon={<FileCheck className="h-4 w-4" />} title="Tax & Billing" subtitle="GST, PAN, payment terms and Tally sync" isDark={isDark} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>GSTIN</label>
                        <Input className={fieldCls(false)} placeholder="15-digit GSTIN" value={formData.gstin || ''} onChange={e => setFormData(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
                      </div>
                      <div>
                        <label className={labelCls}>PAN</label>
                        <Input className={fieldCls(false)} placeholder="10-digit PAN" value={formData.pan || ''} onChange={e => setFormData(p => ({ ...p, pan: e.target.value.toUpperCase() }))} />
                      </div>
                      <div>
                        <label className={labelCls}>GST Treatment</label>
                        <Select value={formData.gst_treatment || 'regular'} onValueChange={v => setFormData(p => ({ ...p, gst_treatment: v }))}>
                          <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">Regular Taxpayer</SelectItem>
                            <SelectItem value="composition">Composition Scheme</SelectItem>
                            <SelectItem value="unregistered">Unregistered</SelectItem>
                            <SelectItem value="consumer">Consumer (B2C)</SelectItem>
                            <SelectItem value="overseas">Overseas / SEZ</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className={labelCls}>Place of Supply</label>
                        <Input className={fieldCls(false)} placeholder="State / UT" value={formData.place_of_supply || ''} onChange={e => setFormData(p => ({ ...p, place_of_supply: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Default Payment Terms</label>
                        <Select value={formData.default_payment_terms || 'Due on receipt'} onValueChange={v => setFormData(p => ({ ...p, default_payment_terms: v }))}>
                          <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Due on receipt','Due in 7 days','Due in 15 days','Due in 30 days','Due in 45 days','Due in 60 days','Due in 90 days','Advance payment'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className={labelCls}>Credit Limit (₹)</label>
                        <Input type="number" className={fieldCls(false)} placeholder="0" value={formData.credit_limit || ''} onChange={e => setFormData(p => ({ ...p, credit_limit: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Opening Balance (₹)</label>
                        <div className="flex gap-2">
                          <Input type="number" className={`${fieldCls(false)} flex-1`} placeholder="0" value={formData.opening_balance || ''} onChange={e => setFormData(p => ({ ...p, opening_balance: e.target.value }))} />
                          <Select value={formData.opening_balance_type || 'Dr'} onValueChange={v => setFormData(p => ({ ...p, opening_balance_type: v }))}>
                            <SelectTrigger className="h-11 w-20 rounded-xl text-sm border-slate-200"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="Dr">Dr</SelectItem><SelectItem value="Cr">Cr</SelectItem></SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Website</label>
                        <Input type="url" className={fieldCls(false)} placeholder="https://..." value={formData.website || ''} onChange={e => setFormData(p => ({ ...p, website: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>MSME / Udyam Number</label>
                        <Input className={fieldCls(false)} value={formData.msme_number || ''} onChange={e => setFormData(p => ({ ...p, msme_number: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Tally Ledger Name</label>
                        <Input className={fieldCls(false)} value={formData.tally_ledger_name || ''} onChange={e => setFormData(p => ({ ...p, tally_ledger_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className={labelCls}>Tally Group</label>
                        <Select value={formData.tally_group || 'Sundry Debtors'} onValueChange={v => setFormData(p => ({ ...p, tally_group: v }))}>
                          <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Sundry Debtors','Sundry Creditors','Current Assets','Current Liabilities','Other'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>



                  
                  {/* Notes */}
                  <div><label className={labelCls}>Internal Notes</label><Textarea className={`min-h-[110px] rounded-xl text-sm resize-y focus:border-blue-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} placeholder="Internal remarks…" value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} /></div>
                  {/* User Assignments */}
                  {canAssignClients && (
                    <div className={`border rounded-2xl p-6 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-5">
                        <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="User Assignments" subtitle="Assign users with specific services" isDark={isDark} />
                        <Button type="button" size="sm" onClick={addAssignment} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2"><Plus className="h-3 w-3 mr-1" /> Add User</Button>
                      </div>
                      <div className="space-y-4">{(formData.assignments || []).map((assignment, idx) => (
                        <div key={idx} className={`border rounded-xl p-5 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div><span className="text-sm font-semibold text-slate-700">Assignment</span></div>
                            {(formData.assignments || []).length > 1 && <button type="button" onClick={() => removeAssignment(idx)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash className="h-3.5 w-3.5" /></button>}
                          </div>
                          <div className="mb-4">
                            <label className={labelCls}>User</label>
                            <Select value={assignment.user_id || 'unassigned'} onValueChange={v => updateAssignmentUser(idx, v === 'unassigned' ? '' : v)}>
                              <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}><SelectValue placeholder="Select team member" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">— Unassigned —</SelectItem>
                                {users.filter(u => {
                                  const otherIds = (formData.assignments || []).filter((_, i) => i !== idx).map(a => a.user_id).filter(Boolean);
                                  if (otherIds.includes(u.id)) return false;
                                  const S2D = { GST: 'GST', 'Income Tax': 'IT', Accounting: 'ACC', TDS: 'TDS', ROC: 'ROC', Trademark: 'TM', Audit: 'ACC', Compliance: 'ROC', 'Company Registration': 'ROC', 'Tax Planning': 'IT', Payroll: 'ACC' };
                                  const depts = [...new Set((formData.services || []).map(s => S2D[s]).filter(Boolean))];
                                  if (depts.length === 0) return true;
                                  return (u.departments || []).some(d => depts.includes(d));
                                }).map(u => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.full_name || u.name || u.email}
                                    {u.departments?.length > 0 && <span className="text-xs text-slate-400 ml-1">· {u.departments.join(', ')}</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={labelCls}>Services for this user <span className="text-slate-300 font-normal">(optional — leave blank for all)</span></label>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {formData.services.map(svc => { const d = svc.startsWith('Other:') ? svc.replace('Other: ', '') : svc; const isSel = assignment.services.includes(svc); return <button key={svc} type="button" onClick={() => toggleAssignmentService(idx, svc)} className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${isSel ? 'text-white border-transparent shadow-sm' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`} style={isSel ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' } : {}}>{d}</button>; })}
                              {formData.services.length === 0 && <p className="text-xs text-slate-400 italic">Select services above first</p>}
                            </div>
                          </div>
                        </div>
                      ))}</div>
                    </div>
                  )}
                  {/* Footer */}
                  <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="h-9 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
                      <Button type="button" variant="outline" onClick={downloadTemplate} className="h-9 px-4 text-sm rounded-xl border-slate-200 text-slate-600">CSV Template</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200" onClick={() => fileInputRef.current?.click()}>Import CSV</Button>
                      <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200" disabled={importLoading} onClick={() => excelInputRef.current?.click()}>Import Master Data</Button>
                      <Button type="submit" disabled={loading} className="h-9 px-6 text-sm rounded-xl text-white font-semibold shadow-sm" style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>{loading ? 'Saving…' : editingClient ? 'Update Client' : 'Create Client'}</Button>
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* DSC EXPIRY ALERT BANNER */}
      {dscAlerts.length > 0 && (
        <div className="flex items-start gap-5 border border-orange-200 rounded-2xl p-5 shadow-sm" style={{ background: 'linear-gradient(135deg, #fff7ed, #fffbeb)' }}>
          <div className="w-11 h-11 rounded-xl shadow-sm text-orange-500 flex items-center justify-center flex-shrink-0 bg-white"><Shield className="h-5 w-5" /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-900 mb-1">⚠ DSC Expiring Soon ({dscAlerts.length} certificate{dscAlerts.length !== 1 ? 's' : ''})</p>
            <div className="flex flex-wrap gap-2">
              {dscAlerts.slice(0, 8).map((alert, i) => (
                <span key={i} className="text-xs font-medium px-3 py-1 border border-orange-200 rounded-full shadow-sm bg-white text-orange-700">
                  {alert.client.company_name} · {alert.dsc.holder_name} · <strong>{alert.days}d</strong>
                </span>
              ))}
              {dscAlerts.length > 8 && <span className="text-xs font-medium px-3 py-1 border border-orange-200 rounded-full bg-white text-orange-500">+{dscAlerts.length - 8} more</span>}
            </div>
          </div>
        </div>
      )}

      {/* BIRTHDAY REMINDERS — shown for all roles; only clients visible to the user appear */}
      {todayReminders.length > 0 && (
        <div className="flex items-center gap-5 border border-pink-200 rounded-2xl p-5 shadow-sm" style={{ background: 'linear-gradient(135deg, #fff0f6, #fff5f0)' }}>
          <div className={`w-11 h-11 rounded-xl shadow-sm text-pink-500 flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-slate-700' : 'bg-white'}`}><Cake className="h-5 w-5" /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-pink-900 mb-1">🎂 Birthday Reminders Today</p>
            <div className="flex flex-wrap gap-2">
              {todayReminders.map(c => {
                const contacts = c.contact_persons?.filter(cp => { if (!cp?.birthday) return false; const b = new Date(cp.birthday); const t = new Date(); return b.getMonth() === t.getMonth() && b.getDate() === t.getDate(); }) || [];
                return contacts.map((cp, i) => (
                  <span key={`${c.id}-${i}`} className={`text-xs font-medium px-3 py-1 border border-pink-200 rounded-full shadow-sm ${isDark ? 'bg-slate-700 text-pink-400' : 'bg-white text-pink-700'}`}>
                    {cp.name} <span className="text-pink-400 font-normal">· {c.company_name}</span>
                  </span>
                ));
              })}
            </div>
          </div>
        </div>
      )}

      {/* STATS — shown for all roles; values reflect only clients visible to this user.
           Admin → all clients. Manager/User → assigned/scoped clients only. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients',  value: stats.totalClients,  icon: <Users className="h-5 w-5" />,    iconBg: 'rgba(13,59,102,0.1)',   iconColor: '#0D3B66', bar: '#1F6FB2' },
            { label: 'Active',         value: stats.activeClients, icon: <Briefcase className="h-5 w-5" />, iconBg: 'rgba(31,175,90,0.1)',   iconColor: '#1FAF5A', bar: '#059669' },
            { label: 'Archived',       value: stats.totalClients - stats.activeClients, icon: <Archive className="h-5 w-5" />, iconBg: 'rgba(245,158,11,0.1)', iconColor: '#D97706', bar: '#D97706' },
            { label: 'Top Service',    value: Object.entries(stats.serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A', icon: <BarChart3 className="h-5 w-5" />, iconBg: 'rgba(124,58,237,0.1)', iconColor: '#7c3aed', bar: '#7c3aed', isText: true },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl border p-5 hover:shadow-md transition-all hover:-translate-y-0.5 relative overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
              <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: s.bar }} />
              <div className="flex items-start justify-between mb-3 pl-2"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div></div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 pl-2">{s.label}</p>
              <p className={`font-bold pl-2 ${s.isText ? 'text-base truncate' : 'text-3xl tracking-tight'} ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>

      {/* FILTERS + SORT + VIEW TOGGLE */}
      <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        {/* Row 1: search */}
        <div className={`flex items-center gap-3 px-3.5 pt-3.5 pb-2.5 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search by company, email or phone… (Ctrl+K)"
              className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100 placeholder:text-slate-400' : 'bg-slate-50'}`}
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {sortedClients.length} <span className="ml-1 font-normal text-slate-400">{sortedClients.length !== 1 ? 'clients' : 'client'}</span>
          </div>
          {/* Export button */}
          <button onClick={handleExportList} title="Export filtered list to Excel"
            className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-colors flex-shrink-0 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:text-white hover:bg-slate-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
            <Download className="h-4 w-4" />
          </button>
          <div className={`flex items-center border rounded-xl p-0.5 gap-0.5 flex-shrink-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <button onClick={() => setViewMode('board')} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'board' ? (isDark ? 'bg-slate-500 shadow-sm text-white' : 'bg-white shadow-sm text-slate-700') : 'text-slate-400 hover:text-slate-600'}`} title="Board view"><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('list')}  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list'  ? (isDark ? 'bg-slate-500 shadow-sm text-white' : 'bg-white shadow-sm text-slate-700') : 'text-slate-400 hover:text-slate-600'}`} title="List view"><List className="h-4 w-4" /></button>
          </div>
        </div>
        {/* Row 2: controls */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto scrollbar-none">
          {/* Bulk message */}
          <div className={`flex items-center gap-0.5 border rounded-xl p-0.5 flex-shrink-0 ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-slate-50'}`}>
            <button onClick={() => { setBulkMsgMode('whatsapp'); setBulkMsgOpen(true); }} className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-emerald-700 transition-all text-xs font-semibold whitespace-nowrap ${isDark ? 'hover:bg-slate-600' : 'hover:bg-emerald-50'}`}>
              <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" /><span>WhatsApp</span>
              <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{filteredClients.length}</span>
            </button>
            <div className={`w-px h-5 flex-shrink-0 ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`} />
            <button onClick={() => { setBulkMsgMode('email'); setBulkMsgOpen(true); }} className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-blue-700 transition-all text-xs font-semibold whitespace-nowrap ${isDark ? 'hover:bg-slate-600' : 'hover:bg-blue-50'}`}>
              <Mail className="h-3.5 w-3.5 flex-shrink-0" /><span>Email</span>
              <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{filteredClients.length}</span>
            </button>
          </div>
          <div className={`w-px h-6 flex-shrink-0 ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`} />
          {/* Sort */}
          <div className={`flex items-center border rounded-xl overflow-hidden flex-shrink-0 ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-slate-50'}`}>
            {SORT_OPTIONS.map((opt, i) => {
              const isActive = sortOrder === opt.value;
              return (
                <button key={opt.value} onClick={() => setSortOrder(opt.value)} title={opt.label}
                  className="h-9 px-2.5 flex items-center gap-1 text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0"
                  style={{ background: isActive ? 'linear-gradient(135deg, #0D3B66, #1F6FB2)' : 'transparent', color: isActive ? '#ffffff' : isDark ? '#94a3b8' : '#64748b', borderRight: i < SORT_OPTIONS.length - 1 ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` : 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 900 }}>{opt.icon}</span>
                  <span style={{ fontSize: 10 }}>{opt.hint}</span>
                </button>
              );
            })}
          </div>
          <div className={`w-px h-6 flex-shrink-0 ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`} />
          {/* Filters */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`h-9 w-[110px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Archived</SelectItem><SelectItem value="all">All Status</SelectItem></SelectContent>
          </Select>
          <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
            <SelectTrigger className={`h-9 w-[110px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem>{CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className={`h-9 w-[120px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Services</SelectItem>{SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          {canAssignClients && users.length > 0 && (
            <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
              <SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue placeholder="All Users" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Users</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.name || u.email}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        {/* Row 3: active filter chips */}
        <ActiveFilterChips
          statusFilter={statusFilter} clientTypeFilter={clientTypeFilter}
          serviceFilter={serviceFilter} assignedToFilter={assignedToFilter}
          users={users} onClear={clearFilter} onClearAll={clearAllFilters}
        />
      </div>

      {/* BOARD / LIST */}
      {clientsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 10 }}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} isDark={isDark} />)}
        </div>
      ) : sortedClients.length === 0 ? (
        <div className="rounded-2xl border flex flex-col items-center justify-center shadow-sm" style={{ minHeight: 320, background: isDark ? '#1e293b' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}><Users className="h-7 w-7 opacity-30" /></div>
          <p className="text-base font-semibold text-slate-500">No clients match your filters</p>
          <p className="mt-1 text-sm text-slate-400">Try changing your search or filters</p>
          {(searchInput || statusFilter !== 'all' || clientTypeFilter !== 'all' || serviceFilter !== 'all' || assignedToFilter !== 'all') && (
            <button onClick={clearAllFilters} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">Clear all filters</button>
          )}
        </div>
      ) : viewMode === 'board' ? (
        <div
          className="rounded-2xl border shadow-sm flex flex-col"
          style={{
            background: isDark ? '#1e293b' : '#F8FAFC',
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}
            variants={{
              hidden:   { opacity: 0 },
              visible:  { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
            }}
            initial="hidden"
            animate="visible"
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: 10,
              padding: '10px 10px 4px 10px',
            }}>
              {boardPageClients.map((client, localIndex) => (
                <ModernClientCard
                  onSendBirthdayWish={handleSendBirthdayWish}
                  key={client.id}
                  client={client}
                  index={boardPageStart + localIndex}
                  isDark={isDark}
                  users={users}
                  getClientAssignments={getClientAssignments}
                  openWhatsApp={openWhatsApp}
                  handleEdit={handleEdit}
                  canDeleteData={canDeleteData}
                  canEditClients={canEditClients}
                  onDelete={handleDelete}
                  setSelectedClient={setSelectedClient}
                  setDetailDialogOpen={setDetailDialogOpen}
                  getClientNumber={getClientNumber}
                />
              ))}
            </div>
          </motion.div>
          <PaginationBar
            safePg={boardSafePage}
            totalPgs={boardTotalPages}
            pageStart={boardPageStart}
            pageSize={BOARD_PAGE_SIZE}
            totalCount={sortedClients.length}
            onPageChange={setBoardPage}
            isDark={isDark}
          />
        </div>
      ) : (
        <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={{ background: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto">
          <div style={{minWidth:780}}>
          <div className={`flex items-center gap-4 px-5 py-3 border-b flex-shrink-0 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
            <div className="w-8 flex-shrink-0" />
            <div className="w-56 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Company</div>
            <div className="w-28 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</div>
            <div className="w-36 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</div>
            <div className="flex-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Email</div>
            <div className="w-44 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Services</div>
            <div className="w-32 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Assigned</div>
            <div className="w-24 flex-shrink-0" />
          </div>
          <div style={{ height: Math.max(listHeight, LIST_ROW_HEIGHT) }}>
            <FixedSizeList height={Math.max(listHeight, LIST_ROW_HEIGHT)} width="100%" itemCount={listPageClients.length} itemSize={LIST_ROW_HEIGHT} itemData={{ pageClients: listPageClients, pageStart: listPageStart }}>
              {ListRow}
            </FixedSizeList>
          </div>
          </div>
          </div>
          <PaginationBar safePg={listSafePage} totalPgs={listTotalPages} pageStart={listPageStart} pageSize={LIST_PAGE_SIZE} totalCount={sortedClients.length} onPageChange={setListPage} isDark={isDark} />
        </div>
      )}

      {/* DETAIL POPUP */}
      <ClientDetailPopup
        selectedClient={selectedClient} detailDialogOpen={detailDialogOpen}
        setDetailDialogOpen={setDetailDialogOpen} isDark={isDark} users={users}
        getClientAssignments={getClientAssignments} openWhatsApp={openWhatsApp}
        handleEdit={handleEdit} canEditClients={canEditClients}
      />

      {/* BULK MSG */}
      <BulkMessageModal open={bulkMsgOpen} onClose={() => setBulkMsgOpen(false)} mode={bulkMsgMode} filteredClients={sortedClients} isDark={isDark} />

      {/* HIDDEN FILE INPUTS */}
      <input type="file" ref={fileInputRef}  accept=".csv"       onChange={handleImportCSV}   className="hidden" />
      <input type="file" ref={excelInputRef} accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />

      {/* CSV PREVIEW DIALOG */}
<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
  <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl">
    <DialogTitle className={`text-lg font-bold px-6 pt-5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      Review Excel Import
    </DialogTitle>
    <DialogDescription className="text-sm text-slate-400 px-6">
      Preview and confirm data before bulk import
    </DialogDescription>

    <div className="flex-1 overflow-auto mx-6 mt-4 rounded-xl border border-slate-100">
      <table className="min-w-full text-xs">
        <thead className={`sticky top-0 border-b ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
          <tr>
            {previewHeaders.map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-50">
          {previewData.map((row, ri) => (
            <tr key={ri} className={isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
              {previewHeaders.map(h => (
                <td key={h} className="p-2">
                  <Input
                    value={row[h] || ''}
                    onChange={e => {
                      const u = [...previewData];
                      u[ri][h] = e.target.value;
                      setPreviewData(u);
                    }}
                    className="h-8 text-xs rounded-lg border-slate-200"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
      <span className="text-xs text-slate-400">
        {previewData.length} rows ready
      </span>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setPreviewOpen(false)}
          className="h-9 px-4 text-sm rounded-xl border-slate-200"
        >
          Cancel
        </Button>

        <Button
          className="h-9 px-5 text-sm rounded-xl text-white font-semibold"
          style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
          onClick={async () => {
            try {
              setImportLoading(true);

              let success = 0;
              let updated = 0;

              for (const row of previewData) {
                const existing = clients.find(
                  c => c.company_name?.toLowerCase().trim() === row.company_name?.toLowerCase().trim()
                );

                if (existing) {
                  const updatePayload = {};

                  if (!existing.email && row.email?.trim()) updatePayload.email = row.email.trim();
                  if (!existing.phone && row.phone?.trim()) updatePayload.phone = row.phone.replace(/\D/g, '');
                  if (!existing.address && row.address?.trim()) updatePayload.address = row.address.trim();
                  if (!existing.city && row.city?.trim()) updatePayload.city = row.city.trim();
                  if (!existing.state && row.state?.trim()) updatePayload.state = row.state.trim();
                  if (!existing.referred_by && row.referred_by?.trim()) updatePayload.referred_by = row.referred_by.trim();
                  if ((!existing.services || existing.services.length === 0) && row.services) {
                    updatePayload.services = row.services.split(',').map(s => s.trim()).filter(Boolean);
                  }
                  if (!existing.notes && row.notes?.trim()) updatePayload.notes = row.notes.trim();

                  if (Object.keys(updatePayload).length > 0) {
                    try {
                      await api.put(`/clients/${existing.id}`, updatePayload);
                      updated++;
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  continue;
                }

                try {
                  await api.post('/clients', {
                    company_name: row.company_name?.trim(),
                    client_type: ['proprietor','pvt_ltd','llp','partnership','huf','trust','other'].includes(row.client_type)
                      ? row.client_type
                      : 'proprietor',
                    email: row.email?.trim() || null,
                    phone: row.phone?.replace(/\D/g, '') || null,
                    birthday: row.birthday || null,
                    address: row.address?.trim() || null,
                    city: row.city?.trim() || null,
                    state: row.state?.trim() || null,
                    services: row.services
                      ? row.services.split(',').map(s => s.trim()).filter(Boolean)
                      : [],
                    notes: row.notes?.trim() || null,
                    status: row.status || 'active',
                    referred_by: row.referred_by?.trim() || null,
                    assigned_to: null,
                    assignments: [],
                    contact_persons: [1,2,3].reduce((acc, n) => {
                      const name = row[`contact_name_${n}`]?.trim();
                      if (name) {
                        acc.push({
                          name,
                          designation: row[`contact_designation_${n}`]?.trim() || null,
                          email: row[`contact_email_${n}`]?.trim() || null,
                          phone: row[`contact_phone_${n}`]?.replace(/\D/g,'') || null,
                          birthday: row[`contact_birthday_${n}`] || null,
                          din: row[`contact_din_${n}`]?.trim() || null
                        });
                      }
                      return acc;
                    }, []),
                    dsc_details: [],
                  });

                  success++;
                } catch (err) {
                  console.error(err);
                }
              }

              toast.success(`${success} clients imported, ${updated} updated`);
              fetchClients();
              setPreviewOpen(false);
              setImportLoading(false);

            } catch (err) {
              console.error(err);
              toast.error("Import failed");
              setImportLoading(false);
            }
          }}
        >
          Confirm &amp; Import All
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>

      {/* MDS PREVIEW DIALOG */}
      <Dialog open={mdsPreviewOpen} onOpenChange={(open) => { if (!open) { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
          <div className={`sticky top-0 z-10 border-b px-7 py-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}><Building2 className="h-5 w-5" /></div>
              <div>
                <DialogTitle className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>MCA / MDS Data Preview</DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">Review and edit the parsed data before saving{mdsData?.sheets_parsed && <span className="ml-2 text-blue-500 font-medium">· {mdsData.sheets_parsed.length} sheet{mdsData.sheets_parsed.length !== 1 ? 's' : ''} parsed</span>}</DialogDescription>
              </div>
            </div>
          </div>
          {mdsPreviewLoading && <MiniLoader height={80} />}
          {!mdsPreviewLoading && mdsForm && (
            <div className="p-7 space-y-6">
              <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                <div className="flex items-center gap-2 mb-5"><div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}><Briefcase className="h-3.5 w-3.5" /></div><h4 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Company Details</h4></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2"><label className={labelCls}>Company Name</label><input className={mdsFieldCls} value={mdsForm.company_name} onChange={e => setMdsForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                  <div><label className={labelCls}>Client Type</label><select className={`${mdsFieldCls} appearance-none`} value={mdsForm.client_type} onChange={e => setMdsForm(f => ({ ...f, client_type: e.target.value }))}>{CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                  <div><label className={labelCls}>Date of Incorporation</label><input type="date" className={mdsFieldCls} value={mdsForm.birthday} onChange={e => setMdsForm(f => ({ ...f, birthday: e.target.value }))} /></div>
                  <div><label className={labelCls}>Email</label><input type="email" className={mdsFieldCls} value={mdsForm.email} onChange={e => setMdsForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className={labelCls}>Phone</label><input className={mdsFieldCls} value={mdsForm.phone} onChange={e => setMdsForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="md:col-span-2"><label className={labelCls}>Address</label><input className={mdsFieldCls} value={mdsForm.address || ''} onChange={e => setMdsForm(f => ({ ...f, address: e.target.value }))} /></div>
                  <div><label className={labelCls}>City</label><input className={mdsFieldCls} value={mdsForm.city || ''} onChange={e => setMdsForm(f => ({ ...f, city: e.target.value }))} /></div>
                  <div><label className={labelCls}>State</label><input className={mdsFieldCls} value={mdsForm.state || ''} onChange={e => setMdsForm(f => ({ ...f, state: e.target.value }))} /></div>
                </div>
                <div className="mt-4"><label className={labelCls}>Services</label><div className="flex flex-wrap gap-2 mt-1">{SERVICES.map(s => { const sel = mdsForm.services?.includes(s); return <button key={s} type="button" onClick={() => setMdsForm(f => ({ ...f, services: sel ? f.services.filter(x => x !== s) : [...(f.services || []), s] }))} className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${sel ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`} style={sel ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' } : {}}>{s}</button>; })}</div></div>
              </div>
              <div className={`border rounded-2xl p-5 ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50/60 border-slate-100'}`}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}><Users className="h-3.5 w-3.5" /></div><h4 className="text-sm font-semibold text-slate-800">Directors / Contact Persons <span className="text-[10px] font-normal text-slate-400">({mdsForm.contact_persons.filter(c => c.name?.trim()).length} parsed)</span></h4></div>
                  <button type="button" onClick={() => setMdsForm(f => ({ ...f, contact_persons: [...f.contact_persons, { name: '', designation: '', email: '', phone: '', birthday: '', din: '' }] }))} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"><Plus className="h-3 w-3" /> Add</button>
                </div>
                <button
                 onClick={() => toast.info('Save the client first to send a birthday wish')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    borderColor: 'rgba(251,191,36,0.5)',
                    color: '#92400e',
                  }}
                >
                  🎂 Send Wish
                </button>
                <div className="space-y-3">{mdsForm.contact_persons.map((cp, idx) => (
                  <div key={idx} className={`border rounded-xl p-4 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div><span className="text-xs font-semibold text-slate-600">{cp.name || `Contact ${idx + 1}`}</span></div>
                      <button type="button" onClick={() => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.filter((_, i) => i !== idx) }))} className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash className="h-3 w-3" /></button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div><label className={labelCls}>Name</label><input className={mdsFieldCls} value={cp.name} onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, name: e.target.value } : c) }))} /></div>
                      <div><label className={labelCls}>Designation</label><input className={mdsFieldCls} value={cp.designation} onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, designation: e.target.value } : c) }))} /></div>
                      <div><label className={labelCls}>DIN / PAN</label><input className={mdsFieldCls} value={cp.din || ''} onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, din: e.target.value } : c) }))} /></div>
                      <div><label className={labelCls}>Email</label><input type="email" className={mdsFieldCls} value={cp.email || ''} placeholder="Optional" onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, email: e.target.value } : c) }))} /></div>
                      <div><label className={labelCls}>Phone</label><input className={mdsFieldCls} value={cp.phone || ''} placeholder="Optional" onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, phone: e.target.value } : c) }))} /></div>
                      <div><label className={labelCls}>Birthday</label><input type="date" className={mdsFieldCls} value={cp.birthday || ''} onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, birthday: e.target.value } : c) }))} /></div>
                    </div>
                  </div>
                ))}</div>
              </div>
              <div><label className={labelCls}>Notes</label><textarea className={`w-full min-h-[90px] border focus:border-blue-400 focus:ring-1 focus:ring-blue-100 rounded-xl text-sm p-3 resize-y outline-none transition-colors ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={mdsForm.notes} onChange={e => setMdsForm(f => ({ ...f, notes: e.target.value }))} /></div>
              {mdsData?.raw_company_info && Object.keys(mdsData.raw_company_info).length > 0 && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button type="button" onClick={() => setMdsRawInfoOpen(o => !o)} className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" /><span className="text-xs font-semibold text-slate-600">Raw Excel Data</span><span className="text-[10px] text-slate-400">({Object.keys(mdsData.raw_company_info).length} fields)</span></div>
                    {mdsRawInfoOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>
                  {mdsRawInfoOpen && (
                    <div className={`p-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                      {Object.entries(mdsData.raw_company_info).map(([key, val]) => (
                        <div key={key} className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`}>
                          <span className="text-slate-400 font-medium min-w-[120px] flex-shrink-0">{key}</span>
                          <span className="text-slate-700 font-medium break-all">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); }} className="h-10 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => handleMdsConfirm(false)} className="h-10 px-5 text-sm rounded-xl border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 gap-2"><Edit className="h-4 w-4" /> Open in Full Form</Button>
                  <Button type="button" disabled={importLoading} onClick={() => handleMdsConfirm(true)} className="h-10 px-6 text-sm rounded-xl text-white font-semibold gap-2" style={{ background: importLoading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}><CheckCircle2 className="h-4 w-4" />{importLoading ? 'Saving…' : 'Save Client'}</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
