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
  Globe, Shield, Lock, AlertTriangle,
  X, Check, RefreshCw, Clock, User as UserIcon, Tag,
  Building2, FileText, Activity, Filter, ExternalLink,
  MessageCircle, Phone, Send, Download, Upload, FileUp,
  ChevronDown, Users, LayoutGrid, List, Link2,
  TableProperties, Sheet, RefreshCcw, Info, Loader2,
  CreditCard, Hash, ArrowRight, CheckCircle2, AlertCircle,
  HelpCircle, Zap, SortAsc, SortDesc, ChevronLeft, ChevronRight,
  ChevronUp, ExternalLink as AutoFillIcon, Smartphone, Store,
  ArrowUpDown, Calendar, Star, BadgeCheck,
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

const springMed = { type: 'spring', stiffness: 340, damping: 24 };
const springFast = { type: 'spring', stiffness: 500, damping: 30 };

// ── Portal type meta — MCA & ROC merged as MCA/ROC ───────────────────────────
const PORTAL_META = {
  MCA:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', icon: '🏛️', fullName: 'Ministry of Corporate Affairs / ROC' },
  ROC:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', icon: '🏛️', fullName: 'Registrar of Companies / MCA'          },
  DGFT:       { label: 'DGFT',       color: '#065F46', bg: '#ECFDF5', icon: '🌐', fullName: 'Directorate General of Foreign Trade'  },
  TRADEMARK:  { label: 'Trademark',  color: '#0F766E', bg: '#F0FDFA', icon: '™️',  fullName: 'Trademark / IP India'                 },
  GST:        { label: 'GST',        color: '#7C3AED', bg: '#F5F3FF', icon: '📊', fullName: 'GST Portal'                           },
  INCOME_TAX: { label: 'Income Tax', color: '#DC2626', bg: '#FEF2F2', icon: '💰', fullName: 'Income Tax India'                     },
  TDS:        { label: 'TDS',        color: '#B45309', bg: '#FFFBEB', icon: '🧾', fullName: 'TDS / TRACES'                         },
  TRACES:     { label: 'TRACES',     color: '#B45309', bg: '#FFFBEB', icon: '🔍', fullName: 'TRACES Portal'                        },
  EPFO:       { label: 'EPFO',       color: '#1D4ED8', bg: '#EFF6FF', icon: '👷', fullName: 'EPFO / PF Portal'                     },
  ESIC:       { label: 'ESIC',       color: '#0369A1', bg: '#F0F9FF', icon: '🏥', fullName: 'ESIC Portal'                          },
  MSME:       { label: 'MSME',       color: '#92400E', bg: '#FEF3C7', icon: '🏭', fullName: 'MSME Samadhaan'                       },
  RERA:       { label: 'RERA',       color: '#4B5563', bg: '#F9FAFB', icon: '🏗️', fullName: 'RERA Portal'                          },
  OTHER:      { label: 'Other',      color: '#6B7280', bg: '#F9FAFB', icon: '🔗', fullName: 'Custom / Other Portal'               },
};

const PORTAL_TYPES  = Object.keys(PORTAL_META);
const DEPARTMENTS   = ['GST', 'IT', 'ACC', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'OTHER'];
const HOLDER_TYPES  = ['COMPANY', 'DIRECTOR', 'INDIVIDUAL', 'PARTNER', 'TRUSTEE', 'OTHER'];

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

// Canonical field display info for the smart import UI
const FIELD_META = {
  portal_name:    { label: 'Portal Name',        required: true,  icon: '🔑', description: 'Name of the portal/website' },
  portal_type:    { label: 'Portal Type',        required: false, icon: '📂', description: 'e.g. MCA, GST, INCOME_TAX' },
  url:            { label: 'Portal URL',         required: false, icon: '🌐', description: 'Website link' },
  username:       { label: 'Username / Email',   required: true,  icon: '👤', description: 'Login ID or email' },
  password_plain: { label: 'Password',           required: true,  icon: '🔐', description: 'Login password' },
  department:     { label: 'Department',         required: false, icon: '🏢', description: 'Auto-derived from portal type if empty' },
  holder_type:    { label: 'Holder Type',        required: false, icon: '👥', description: 'COMPANY / DIRECTOR / INDIVIDUAL etc.' },
  holder_name:    { label: 'Holder Name',        required: false, icon: '🧑', description: 'Director or individual name' },
  holder_pan:     { label: 'Holder PAN',         required: false, icon: '💳', description: 'PAN number' },
  holder_din:     { label: 'Holder DIN',         required: false, icon: '#️⃣', description: 'DIN number (for directors)' },
  mobile:         { label: 'Mobile / Phone',     required: false, icon: '📱', description: 'Registered mobile number' },
  trade_name:     { label: 'Trade Name',         required: false, icon: '🏪', description: 'Business/trade/brand name' },
  client_name:    { label: 'Client Name',        required: false, icon: '🏭', description: 'Associated client company' },
  client_id:      { label: 'Client ID',          required: false, icon: '🔢', description: 'Client code in the system' },
  notes:          { label: 'Notes',              required: false, icon: '📝', description: 'Additional remarks' },
  tags:           { label: 'Tags',               required: false, icon: '🏷️', description: 'Comma-separated tags' },
};

const SHEET_TYPES = ['GST', 'ROC', 'MCA', 'OTHER'];

// Sort options
const SORT_OPTIONS = [
  { value: 'lifo',   label: 'Newest First (LIFO)',  icon: '🕐', sortBy: 'created_at', order: 'desc' },
  { value: 'fifo',   label: 'Oldest First (FIFO)',  icon: '📅', sortBy: 'created_at', order: 'asc'  },
  { value: 'az',     label: 'A → Z',                icon: '🔤', sortBy: 'portal_name', order: 'asc'  },
  { value: 'za',     label: 'Z → A',                icon: '🔡', sortBy: 'portal_name', order: 'desc' },
];

// Page size options
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────
function WAIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
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
          <div className="w-8 h-8 bg-white/15 rounded-xl flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-white font-bold text-sm leading-tight">{title}</DialogTitle>
            {subtitle && (
              <p className="text-white/60 text-[11px] mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ml-2"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Client Search Dropdown ────────────────────────────────────────────────────
function ClientSearchDropdown({ value, onChange, isDark, clients = [] }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
        className={`flex items-center gap-2 h-9 rounded-xl border px-3 cursor-pointer transition-colors ${
          isDark
            ? 'bg-slate-700 border-slate-600 text-slate-100 hover:border-slate-500'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
        onClick={() => setOpen(o => !o)}
      >
        <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <span className={`flex-1 text-sm truncate ${selectedClient ? '' : 'text-slate-400'}`}>
          {selectedClient ? selectedClient.company_name : 'Search client…'}
        </span>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); handleSelect(null); }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown className="h-3 w-3 text-slate-400 flex-shrink-0" />
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
                  className={`w-full pl-8 pr-3 h-7 text-sm rounded-lg border outline-none transition-colors ${
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
                  {value === c.id && <Check className="h-3 w-3 text-blue-500 ml-auto flex-shrink-0" />}
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

// ── Reveal Password ───────────────────────────────────────────────────────────
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
    <div className="flex items-center gap-1.5">
      <span className={`font-mono text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
        {revealed ? password : <MaskedPassword />}
      </span>
      <button
        type="button"
        onClick={handleReveal}
        disabled={loading}
        className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
        title={revealed ? 'Hide' : 'Reveal'}
      >
        {loading
          ? <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
          : revealed
            ? <EyeOff className="h-3 w-3 text-slate-400" />
            : <Eye className="h-3 w-3 text-slate-400" />
        }
      </button>
      {revealed && (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(password).then(() => toast.success('Password copied'))}
          className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
          title="Copy password"
        >
          <Copy className="h-3 w-3 text-slate-400" />
        </button>
      )}
    </div>
  );
}

// ── Auto-Fill & Open Portal ───────────────────────────────────────────────────
// Copies credentials to clipboard then opens portal URL
// Also attempts to open a special bookmarklet-style autofill
async function handleAutoFillAndOpen(entry) {
  if (!entry.url) {
    toast.error('No URL configured for this portal');
    return;
  }

  try {
    // Fetch password first
    const res = await api.get(`/passwords/${entry.id}/reveal`);
    const password = res.data.password || '';
    const username = entry.username || '';

    // Copy credentials to clipboard as formatted text for easy pasting
    const credText = `Username: ${username}\nPassword: ${password}`;
    await navigator.clipboard.writeText(password);

    toast.success(
      `Password copied! Opening ${entry.portal_name}…`,
      { description: `Username: ${username} — paste password when prompted` }
    );

    // Small delay then open URL
    setTimeout(() => {
      const url = entry.url.startsWith('http') ? entry.url : `https://${entry.url}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }, 400);
  } catch (err) {
    toast.error('Could not retrieve credentials for auto-fill');
  }
}

// ── Full Detail Modal ─────────────────────────────────────────────────────────
function DetailModal({ open, onClose, entry, isDark, canEdit, isAdmin, onEdit, onDelete }) {
  const [revealedPw, setRevealedPw] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [pwRevealed, setPwRevealed] = useState(false);

  useEffect(() => {
    if (!open) {
      setRevealedPw('');
      setPwRevealed(false);
    }
  }, [open]);

  if (!entry) return null;

  const meta = PORTAL_META[entry.portal_type] || PORTAL_META.OTHER;

  const handleReveal = async () => {
    if (pwRevealed) { setPwRevealed(false); return; }
    setRevealLoading(true);
    try {
      const res = await api.get(`/passwords/${entry.id}/reveal`);
      setRevealedPw(res.data.password || '');
      setPwRevealed(true);
    } catch {
      toast.error('Could not retrieve password');
    } finally {
      setRevealLoading(false);
    }
  };

  const InfoRow = ({ label, value, mono, copyable, icon }) => {
    if (!value) return null;
    return (
      <div className={`flex items-start gap-3 py-2.5 border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className={`flex-shrink-0 w-28 text-[11px] font-bold uppercase tracking-wider pt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {label}
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {icon && <span className="text-sm flex-shrink-0">{icon}</span>}
          <span className={`${mono ? 'font-mono' : ''} text-sm break-all ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
            {value}
          </span>
          {copyable && (
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied!'))}
              className={`flex-shrink-0 p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
            >
              <Copy className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Colored header based on portal type */}
        <div className="px-5 py-4 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${meta.color}ee, ${meta.color}99)` }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center text-xl flex-shrink-0">
                {meta.icon}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-white font-bold text-base leading-tight truncate">{entry.portal_name}</DialogTitle>
                <p className="text-white/70 text-xs mt-0.5">{meta.fullName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          </div>
          {/* Badges */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/25 text-white">{meta.label}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">{entry.department}</span>
            {entry.holder_type !== 'COMPANY' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">
                {HOLDER_META[entry.holder_type]?.icon} {HOLDER_META[entry.holder_type]?.label || entry.holder_type}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-0">
          {/* Credentials section */}
          <div className={`rounded-2xl border p-4 mb-4 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>🔐 Login Credentials</p>

            {entry.username && (
              <div className={`flex items-center gap-2 mb-2 pb-2 border-b ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                <span className={`text-[11px] w-20 font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Username</span>
                <span className={`font-mono text-sm flex-1 truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{entry.username}</span>
                <button type="button" onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Username copied'))} className={`p-1 rounded transition-colors flex-shrink-0 ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'}`}><Copy className="h-3 w-3 text-slate-400" /></button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className={`text-[11px] w-20 font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Password</span>
              <div className="flex-1 flex items-center gap-2">
                {entry.has_password ? (
                  <>
                    <span className={`font-mono text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {pwRevealed ? revealedPw : '••••••••••'}
                    </span>
                    <button type="button" onClick={handleReveal} disabled={revealLoading} className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'}`}>
                      {revealLoading ? <RefreshCw className="h-3 w-3 animate-spin text-slate-400" /> : pwRevealed ? <EyeOff className="h-3 w-3 text-slate-400" /> : <Eye className="h-3 w-3 text-slate-400" />}
                    </button>
                    {pwRevealed && (
                      <button type="button" onClick={() => navigator.clipboard.writeText(revealedPw).then(() => toast.success('Password copied'))} className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'}`}><Copy className="h-3 w-3 text-slate-400" /></button>
                    )}
                  </>
                ) : (
                  <span className={`text-sm italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No password stored</span>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className={`rounded-2xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="px-4 pt-3 pb-1">
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>📋 Details</p>
            </div>
            <div className="px-4 pb-3">
              <InfoRow label="URL" value={entry.url} icon="🌐" copyable />
              <InfoRow label="Client" value={entry.client_name} icon="🏢" />
              <InfoRow label="Holder" value={entry.holder_name} icon="👤" />
              <InfoRow label="PAN" value={entry.holder_pan} mono copyable />
              <InfoRow label="DIN" value={entry.holder_din} mono copyable />
              <InfoRow label="Mobile" value={entry.mobile} icon="📱" copyable />
              <InfoRow label="Trade Name" value={entry.trade_name} icon="🏪" />
              <InfoRow label="Notes" value={entry.notes} />
              {entry.tags?.length > 0 && (
                <div className={`flex items-start gap-3 py-2.5 border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  <div className={`flex-shrink-0 w-28 text-[11px] font-bold uppercase tracking-wider pt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map(t => (
                      <span key={t} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {entry.created_by_name && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <UserIcon className="h-2.5 w-2.5" /> Added by {entry.created_by_name}
              </span>
            )}
            {entry.created_at && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> {format(new Date(entry.created_at), 'MMM d, yyyy')}
              </span>
            )}
            {entry.last_accessed_at && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Activity className="h-2.5 w-2.5" /> Last used {format(new Date(entry.last_accessed_at), 'MMM d')}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t flex items-center gap-2 flex-wrap ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          {entry.url && (
            <Button
              size="sm"
              onClick={() => handleAutoFillAndOpen(entry)}
              className="rounded-xl font-bold text-xs h-8 gap-1.5 text-white flex-1"
              style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}bb)` }}
            >
              <AutoFillIcon className="h-3 w-3" /> Open & Auto-fill
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs gap-1" onClick={() => { onClose(); onEdit(entry); }}>
              <Edit2 className="h-3 w-3" /> Edit
            </Button>
          )}
          <Button
            size="sm"
            onClick={onClose}
            className="rounded-xl h-8 text-xs"
            style={{ background: isDark ? '#374151' : '#F3F4F6', color: isDark ? '#E2E8F0' : '#4B5563' }}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
    if (entry?.holder_name) lines.push(`👔 Login for: ${entry.holder_name}`);
    if (entry?.mobile) lines.push(`📱 Registered Mobile: ${entry.mobile}`);
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
      <DialogContent className={`max-w-md rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={<WAIcon className="h-4 w-4 text-white" />}
          title="Share via WhatsApp"
          subtitle="Send credentials securely to a contact"
          gradient="linear-gradient(135deg, #075E54 0%, #25D366 100%)"
          onClose={handleClose}
        />
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-500">Recipient</Label>
            {recipients.length > 0 ? (
              <Select value={recipientType} onValueChange={setRecipientType}>
                <SelectTrigger className={`rounded-xl h-9 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map(r => <SelectItem key={r.type} value={r.type}>{r.label} — {r.name} ({r.phone})</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className={`rounded-xl h-9 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
                placeholder="Enter phone number (with country code)"
                value={customPhone}
                onChange={e => setCustomPhone(e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase text-slate-500">Include Password?</Label>
            <input type="checkbox" checked={includePass} onChange={e => handleIncludeToggle(e.target.checked)} className="w-4 h-4 rounded cursor-pointer" />
          </div>
          {includePass && loadingPw && <p className="text-xs text-slate-400">Fetching password…</p>}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-500">Additional Message (optional)</Label>
            <Textarea
              className={`rounded-xl resize-none text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
              rows={3}
              placeholder="Add any additional notes…"
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className={`px-5 py-3 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!phoneReady}
            onClick={handleSend}
            className="rounded-xl font-bold text-white gap-2"
            style={{ background: COLORS.whatsapp }}
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Smart Bulk Import Modal ───────────────────────────────────────────────────
function BulkImportModal({ open, onClose, isDark, onSuccess }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [unmappedAssignments, setUnmappedAssignments] = useState({});
  const [result, setResult] = useState(null);
  const qc = useQueryClient();

  const allCanonicalFields = Object.keys(FIELD_META);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV (.csv) file');
      return;
    }
    setFile(f);
    setPreview(null);
    setResult(null);
    setStep(1);
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/passwords/parse-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);
      setUnmappedAssignments({});
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/passwords/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setStep(3);
      qc.invalidateQueries({ queryKey: ['passwords'] });
      qc.invalidateQueries({ queryKey: ['passwords-stats'] });
      toast.success(`✓ Imported ${res.data.successful_imports} credentials`);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed. Please check the file and try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStep(1);
    setUnmappedAssignments({});
    onClose();
  };

  const alreadyMapped = preview ? new Set(Object.values(preview.mapping)) : new Set();
  const hasMissingRequired = preview?.missing_required?.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={<FileUp className="h-4 w-4 text-white" />}
          title={step === 1 ? 'Bulk Import Credentials' : step === 2 ? 'Review Column Mapping' : 'Import Complete'}
          subtitle={
            step === 1 ? 'Upload Excel or CSV — any column names are auto-detected' :
            step === 2 ? `${preview?.total_rows} rows found · confirm how columns will be imported` :
            'Your credentials have been imported into the vault'
          }
          gradient={`linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`}
          onClose={handleClose}
        />

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="p-5 space-y-4">
            <label
              htmlFor="bulk-import-file"
              className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-colors ${
                isDark
                  ? 'border-slate-600 hover:border-blue-500 hover:bg-blue-900/10'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'
              }`}
            >
              <input id="bulk-import-file" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              {file ? (
                <>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${COLORS.emeraldGreen}20` }}>
                    <CheckCircle2 className="h-6 w-6" style={{ color: COLORS.emeraldGreen }} />
                  </div>
                  <div className="text-center">
                    <p className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                  </div>
                </>
              ) : (
                <>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    <FileUp className="h-6 w-6 text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Click to upload or drag & drop</p>
                    <p className="text-xs text-slate-400 mt-1">Excel (.xlsx, .xls) or CSV (.csv)</p>
                  </div>
                </>
              )}
            </label>

            <div className={`flex items-start gap-3 p-3 rounded-2xl ${isDark ? 'bg-blue-900/20 border border-blue-800/40' : 'bg-blue-50 border border-blue-200'}`}>
              <Zap className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <p className={`text-xs font-bold mb-1 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>Smart Column Detection</p>
                <p className={`text-[11px] ${isDark ? 'text-blue-200' : 'text-blue-600'}`}>
                  Automatically detects: Name, Email, Password, PAN, DIN, Mobile, Trade Name, Portal, Company and 100+ column name variations.
                  Any unrecognised columns get a smart suggestion popup before importing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end pt-2">
              <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
              <Button
                disabled={!file || parsing}
                onClick={handleParse}
                className="rounded-xl font-bold text-white gap-2"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
              >
                {parsing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><ArrowRight className="h-4 w-4" /> Preview Mapping</>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review Mapping */}
        {step === 2 && preview && (
          <div className="flex flex-col max-h-[80vh]">
            <div className="overflow-y-auto p-5 space-y-4">

              {hasMissingRequired && (
                <div className={`flex items-start gap-3 p-3 rounded-2xl ${isDark ? 'bg-red-900/20 border border-red-800/40' : 'bg-red-50 border border-red-200'}`}>
                  <AlertCircle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                  <div>
                    <p className={`text-xs font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>Some required fields were not found</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-red-200' : 'text-red-600'}`}>
                      Could not find: <b>{preview.missing_required.map(f => FIELD_META[f]?.label || f).join(', ')}</b>.
                      Please assign them below or go back and check your file.
                    </p>
                  </div>
                </div>
              )}

              {/* Auto-mapped */}
              {Object.keys(preview.mapping).length > 0 && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Auto-detected ({Object.keys(preview.mapping).length})
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {Object.entries(preview.mapping).map(([origCol, canonical]) => {
                      const meta = FIELD_META[canonical];
                      return (
                        <div key={origCol} className={`flex items-center gap-2 p-2 rounded-xl ${isDark ? 'bg-emerald-900/15 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                          <span className="text-sm">{meta?.icon || '📌'}</span>
                          <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>"{origCol}"</span>
                          <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                          <span className={`text-xs font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{meta?.label || canonical}</span>
                          {meta?.required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Required</span>}
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unmapped — with smart suggestions as pop-up style selects */}
              {preview.unmapped_columns.length > 0 && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <HelpCircle className="h-3 w-3 text-amber-500" />
                    Unrecognised columns — classify or skip ({preview.unmapped_columns.length})
                  </p>
                  <div className="space-y-1.5">
                    {preview.unmapped_columns.map(col => {
                      const suggestions = preview.suggested_mappings?.[col] || [];
                      return (
                        <div key={col} className={`p-2.5 rounded-xl ${isDark ? 'bg-amber-900/15 border border-amber-800/30' : 'bg-amber-50 border border-amber-200'}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <HelpCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>"{col}"</span>
                            <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                            <Select
                              value={unmappedAssignments[col] || '__skip__'}
                              onValueChange={v => setUnmappedAssignments(p => ({ ...p, [col]: v === '__skip__' ? undefined : v }))}
                            >
                              <SelectTrigger className={`h-7 rounded-lg text-[11px] w-44 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white'}`}>
                                <SelectValue placeholder="Skip" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">⛔ Skip this column</SelectItem>
                                {/* Smart suggestions first */}
                                {suggestions.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">Suggested</div>
                                    {suggestions.map(f => (
                                      <SelectItem key={`sug_${f}`} value={f}>
                                        ✨ {FIELD_META[f]?.icon} {FIELD_META[f]?.label || f}
                                      </SelectItem>
                                    ))}
                                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">All Fields</div>
                                  </>
                                )}
                                {allCanonicalFields
                                  .filter(f => !alreadyMapped.has(f) || unmappedAssignments[col] === f)
                                  .map(f => (
                                    <SelectItem key={f} value={f}>
                                      {FIELD_META[f]?.icon} {FIELD_META[f]?.label || f}
                                    </SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Data preview table */}
              {preview.sample_rows?.length > 0 && (
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Data Preview (first {preview.sample_rows.length} rows)
                  </p>
                  <div className={`rounded-xl border overflow-auto ${isDark ? 'border-slate-600 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`} style={{ maxHeight: 180 }}>
                    <table className="w-full text-xs min-w-max">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
                          {Object.keys(preview.sample_rows[0] || {}).slice(0, 7).map(col => (
                            <th key={col} className={`px-3 py-2 text-left font-bold whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {FIELD_META[col]?.label || col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample_rows.map((row, i) => (
                          <tr key={i} className={`border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                            {Object.keys(preview.sample_rows[0] || {}).slice(0, 7).map(col => (
                              <td key={col} className={`px-3 py-1.5 whitespace-nowrap max-w-[140px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {col === 'password_plain' && row[col] ? '••••••' : String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
                <Info className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  Missing <b>Department</b> auto-derived from Portal Type (MCA → ROC, GST → GST, etc.).
                  Missing <b>Holder Type</b> defaults to <b>COMPANY</b>. Blank rows are skipped.
                  <b>Mobile</b> and <b>Trade Name</b> fields are now supported.
                </p>
              </div>
            </div>

            <div className={`px-5 py-3 border-t flex items-center justify-between gap-3 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <Button variant="ghost" className="rounded-xl text-sm" onClick={() => setStep(1)}>← Back</Button>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{preview.total_rows} rows ready</span>
                <Button
                  disabled={importing}
                  onClick={handleImport}
                  className="rounded-xl font-bold text-white gap-2 text-sm"
                  style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #0F7238)` }}
                >
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="h-4 w-4" /> Import {preview.total_rows} Rows</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && result && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className={`p-4 rounded-2xl text-center ${isDark ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                <p className="text-3xl font-black" style={{ color: COLORS.emeraldGreen }}>{result.successful_imports}</p>
                <p className={`text-xs font-semibold mt-1 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Imported ✓</p>
              </div>
              <div className={`p-4 rounded-2xl text-center ${isDark ? 'bg-slate-700 border border-slate-600' : 'bg-slate-100 border border-slate-200'}`}>
                <p className={`text-3xl font-black ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{result.total_processed}</p>
                <p className="text-xs font-semibold mt-1 text-slate-500">Total Rows</p>
              </div>
              <div className={`p-4 rounded-2xl text-center ${result.failed_imports > 0 ? (isDark ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200') : (isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200')}`}>
                <p className={`text-3xl font-black ${result.failed_imports > 0 ? 'text-red-500' : 'text-slate-400'}`}>{result.failed_imports}</p>
                <p className={`text-xs font-semibold mt-1 ${result.failed_imports > 0 ? 'text-red-400' : 'text-slate-400'}`}>Failed</p>
              </div>
            </div>

            {result.skipped_rows > 0 && (
              <p className="text-xs text-slate-400 text-center">{result.skipped_rows} empty rows were skipped automatically.</p>
            )}

            {result.column_mapping && Object.keys(result.column_mapping).length > 0 && (
              <div className={`p-3 rounded-xl text-xs ${isDark ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
                <p className={`font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Columns mapped:</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(result.column_mapping).map(([orig, canon]) => (
                    <span key={orig} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isDark ? 'bg-slate-600 text-slate-200' : 'bg-white border border-slate-200 text-slate-600'}`}>
                      {orig} → {FIELD_META[canon]?.label || canon}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.errors?.length > 0 && (
              <div className={`p-3 rounded-xl text-xs max-h-36 overflow-y-auto ${isDark ? 'bg-red-900/20 border border-red-800/40' : 'bg-red-50 border border-red-200'}`}>
                <p className={`font-bold mb-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>Row errors:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className={`mb-1 ${isDark ? 'text-red-200' : 'text-red-600'}`}>
                    Row {err.row}: {typeof err.error === 'string' ? err.error.substring(0, 120) : JSON.stringify(err.error).substring(0, 120)}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                className="rounded-xl font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Google Sheets Manager Modal ───────────────────────────────────────────────
function SheetLinksModal({ open, onClose, isDark, isAdmin }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ label: '', sheet_url: '', sheet_type: 'OTHER', description: '' });
  const [adding, setAdding] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['sheet-links'],
    queryFn: () => api.get('/passwords/sheet-links').then(r => r.data),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: data => api.post('/passwords/sheet-links', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sheet-links'] });
      toast.success('Sheet link saved');
      setForm({ label: '', sheet_url: '', sheet_type: 'OTHER', description: '' });
      setAdding(false);
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: id => api.delete(`/passwords/sheet-links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sheet-links'] });
      toast.success('Link deleted');
    },
    onError: err => toast.error(err.response?.data?.detail || 'Failed to delete'),
  });

  const handlePreview = async (link) => {
    setPreviewId(link.id);
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const res = await api.post(`/passwords/sheet-links/${link.id}/preview`);
      setPreviewData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not fetch sheet. Ensure it is publicly shared.');
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const sheetTypeColor = { GST: '#7C3AED', ROC: '#1E3A8A', MCA: '#1E3A8A', OTHER: '#6B7280' };
  const handleClose = () => { setAdding(false); setPreviewId(null); setPreviewData(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={<Sheet className="h-4 w-4 text-white" />}
          title="Google Sheet Links"
          subtitle="Manage linked spreadsheets for password data import"
          gradient="linear-gradient(135deg, #0F7238, #1FAF5A)"
          onClose={handleClose}
        />

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${isDark ? 'bg-blue-900/20 border border-blue-800/40' : 'bg-blue-50 border border-blue-200'}`}>
            <Info className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <div className={isDark ? 'text-blue-300' : 'text-blue-700'}>
              <b>How to use:</b> Add your Google Sheet URL. The sheet must be <b>"Anyone with the link can view"</b>.
              For ROC/MCA sheets, all tabs are merged. For GST, only the latest tab is used.
            </div>
          </div>

          {isAdmin && (
            <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{adding ? 'Add New Sheet Link' : 'Add a Sheet Link'}</p>
                {!adding && (
                  <Button size="sm" className="rounded-lg h-7 text-xs" onClick={() => setAdding(true)} style={{ background: COLORS.emeraldGreen, color: 'white' }}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                )}
              </div>
              {adding && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Label *</Label>
                      <Input className={`rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} placeholder="e.g. GST Master Sheet" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Sheet Type</Label>
                      <Select value={form.sheet_type} onValueChange={v => setForm(p => ({ ...p, sheet_type: v }))}>
                        <SelectTrigger className={`rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{SHEET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Google Sheet URL *</Label>
                    <Input className={`rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} placeholder="https://docs.google.com/spreadsheets/d/..." value={form.sheet_url} onChange={e => setForm(p => ({ ...p, sheet_url: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Description (optional)</Label>
                    <Input className={`rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`} placeholder="What data does this sheet contain?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="ghost" size="sm" className="rounded-lg h-8 text-xs" onClick={() => { setAdding(false); setForm({ label: '', sheet_url: '', sheet_type: 'OTHER', description: '' }); }}>Cancel</Button>
                    <Button size="sm" className="rounded-lg h-8 text-xs text-white" disabled={!form.label.trim() || !form.sheet_url.trim() || addMutation.isPending} onClick={() => addMutation.mutate(form)} style={{ background: COLORS.emeraldGreen }}>
                      {addMutation.isPending ? 'Saving…' : 'Save Link'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : links.length === 0 ? (
            <div className={`text-center py-10 rounded-xl border-2 border-dashed ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
              <Sheet className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No sheet links added yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {links.map(link => (
                <div key={link.id} className={`rounded-xl border p-3 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{link.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${sheetTypeColor[link.sheet_type] || '#6B7280'}18`, color: sheetTypeColor[link.sheet_type] || '#6B7280' }}>{link.sheet_type}</span>
                      </div>
                      {link.description && <p className="text-xs text-slate-400 mt-0.5">{link.description}</p>}
                      <a href={link.sheet_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1 truncate">
                        <Link2 className="h-3 w-3 flex-shrink-0" /><span className="truncate">{link.sheet_url}</span><ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs gap-1" onClick={() => handlePreview(link)} disabled={previewLoading && previewId === link.id}>
                        {previewLoading && previewId === link.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />} Preview
                      </Button>
                      {isAdmin && (
                        <button type="button" onClick={() => deleteMutation.mutate(link.id)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30' : 'hover:bg-red-50'}`} title="Delete">
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {previewId === link.id && previewData && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-600' : 'border-slate-100'}`}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-bold text-emerald-600">✓ Connected</span>
                        <span className="text-xs text-slate-400">{previewData.total_rows} rows</span>
                        {previewData.tab_used && <span className="text-xs text-slate-400">Tab: {previewData.tab_used}</span>}
                        {previewData.tabs_found?.length > 0 && <span className="text-xs text-slate-400">Tabs: {previewData.tabs_found.join(', ')}</span>}
                      </div>
                      <div className={`rounded-lg overflow-auto text-xs ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`} style={{ maxHeight: 160 }}>
                        <table className="w-full min-w-max">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                              {previewData.columns?.slice(0, 6).map(col => (
                                <th key={col} className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.preview?.slice(0, 5).map((row, i) => (
                              <tr key={i} className={`border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                                {previewData.columns?.slice(0, 6).map(col => (
                                  <td key={col} className={`px-2 py-1 whitespace-nowrap max-w-[120px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{String(row[col] ?? '')}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`px-5 py-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pagination Component ──────────────────────────────────────────────────────
function Pagination({ total, page, pageSize, onPage, onPageSize, isDark }) {
  const totalPages = Math.ceil(total / pageSize);
  if (total === 0) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  const btnBase = `h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center`;

  return (
    <div className={`flex items-center justify-between gap-3 py-2 px-1 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs">Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPage(1); }}>
          <SelectTrigger className={`h-7 w-20 rounded-lg text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs">
          {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPage(1)}
          className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}
        >
          «
        </button>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            className={`${btnBase} ${p === page
              ? 'text-white shadow-sm'
              : isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
            }`}
            style={p === page ? { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` } : {}}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPage(page + 1)}
          className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPage(totalPages)}
          className={`${btnBase} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}
        >
          »
        </button>
      </div>
    </div>
  );
}

// ── Entry Card (Grid View) ────────────────────────────────────────────────────
function EntryCard({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark }) {
  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springMed }}>
      <div
        className={`rounded-2xl border p-3.5 h-full flex flex-col cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'} transition-all`}
        onClick={() => onDetail(entry)}
      >
        {/* Serial + actions row */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className={`text-[10px] font-black mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
              {serialNo}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</h3>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <PortalBadge type={entry.portal_type} size="sm" />
                <DeptBadge dept={entry.department} />
                <HolderBadge holderType={entry.holder_type} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 ml-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {canEdit && (
              <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Edit">
                <Edit2 className="h-3 w-3 text-slate-400" />
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Delete">
                <Trash2 className="h-3 w-3 text-red-400" />
              </button>
            )}
          </div>
        </div>

        {entry.holder_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
            <UserIcon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{entry.holder_name}</span>
            {entry.holder_din && <span className="text-[10px] opacity-70 flex-shrink-0">DIN: {entry.holder_din}</span>}
          </div>
        )}

        {entry.client_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
            <Building2 className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{entry.client_name}</span>
          </div>
        )}

        {entry.trade_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
            <Store className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{entry.trade_name}</span>
          </div>
        )}

        {entry.username && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <UserIcon className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <span className={`font-mono text-xs truncate flex-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{entry.username}</span>
              <button type="button" onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Username copied'))} className={`flex-shrink-0 p-0.5 rounded transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Copy username">
                <Copy className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-2.5" onClick={e => e.stopPropagation()}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Password</p>
          {entry.has_password
            ? <RevealPassword entryId={entry.id} isDark={isDark} />
            : <span className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No password stored</span>
          }
        </div>

        {entry.mobile && (
          <div className={`flex items-center gap-1.5 mb-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Smartphone className="h-3 w-3 flex-shrink-0" />
            <span className="font-mono">{entry.mobile}</span>
          </div>
        )}

        {entry.url && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => handleAutoFillAndOpen(entry)}
              className={`flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 hover:underline truncate w-full text-left`}
              title="Copy password & open portal"
            >
              <Globe className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{entry.url}</span>
              <AutoFillIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
            </button>
          </div>
        )}

        {entry.notes && (
          <div className={`mt-auto pt-2 border-t text-[11px] ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
            {entry.notes.slice(0, 80)}{entry.notes.length > 80 ? '…' : ''}
          </div>
        )}

        <div className={`flex items-center justify-between mt-2.5 pt-2.5 border-t text-[10px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {entry.updated_at ? format(new Date(entry.updated_at), 'MMM d, yyyy') : '—'}
          </span>
          {entry.last_accessed_at && (
            <span className="flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" />
              {format(new Date(entry.last_accessed_at), 'MMM d')}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={e => { e.stopPropagation(); onShare(entry); }}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: isDark ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.07)', color: COLORS.whatsapp, border: `1px solid ${COLORS.whatsapp}28` }}
        >
          <WAIcon className="h-3 w-3" />
          Share via WhatsApp
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Entry Row (List View) ─────────────────────────────────────────────────────
function EntryRow({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark }) {
  return (
    <motion.tr
      variants={itemVariants}
      className={`border-b transition-colors cursor-pointer ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'}`}
      onClick={() => onDetail(entry)}
    >
      <td className="px-3 py-2 text-center">
        <span className={`text-[10px] font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{serialNo}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</span>
          <div className="flex items-center gap-1 flex-wrap">
            <PortalBadge type={entry.portal_type} size="sm" />
            <DeptBadge dept={entry.department} />
            <HolderBadge holderType={entry.holder_type} />
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {entry.client_name && <span className={`text-xs font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>{entry.client_name}</span>}
          {entry.holder_name && <span className={`text-xs ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>{entry.holder_name}</span>}
          {entry.trade_name && <span className={`text-[10px] ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>🏪 {entry.trade_name}</span>}
          {entry.holder_din && <span className="text-[10px] text-slate-400">DIN: {entry.holder_din}</span>}
          {entry.mobile && <span className={`text-[10px] flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><Smartphone className="h-2.5 w-2.5" />{entry.mobile}</span>}
        </div>
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {entry.username ? (
          <div className="flex items-center gap-1">
            <span className={`font-mono text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{entry.username}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Copied'))} className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors">
              <Copy className="h-2.5 w-2.5" />
            </button>
          </div>
        ) : <span className="text-xs text-slate-400">—</span>}
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {entry.has_password ? <RevealPassword entryId={entry.id} isDark={isDark} /> : <span className="text-xs text-slate-400 italic">None</span>}
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {entry.url ? (
          <button
            type="button"
            onClick={() => handleAutoFillAndOpen(entry)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            title="Copy password & open URL"
          >
            <Globe className="h-3 w-3 flex-shrink-0" />
            <span className="truncate max-w-[120px]">{entry.url.replace(/^https?:\/\//, '')}</span>
            <AutoFillIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
          </button>
        ) : <span className="text-xs text-slate-400">—</span>}
      </td>
      <td className="px-3 py-2">
        <span className="text-[10px] text-slate-400">{entry.updated_at ? format(new Date(entry.updated_at), 'MMM d, yy') : '—'}</span>
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onShare(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Share via WhatsApp">
            <WAIcon className="h-3 w-3" style={{ color: COLORS.whatsapp }} />
          </button>
          {canEdit && (
            <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Edit">
              <Edit2 className="h-3 w-3 text-slate-400" />
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`} title="Delete">
              <Trash2 className="h-3 w-3 text-red-400" />
            </button>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  portal_name: '', portal_type: 'OTHER', url: '', username: '', password_plain: '',
  department: 'OTHER', holder_type: 'COMPANY', holder_name: '', holder_pan: '',
  holder_din: '', mobile: '', trade_name: '', client_id: '', client_name: '', notes: '', tags: [],
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
        holder_type:    existing.holder_type    || 'COMPANY',
        holder_name:    existing.holder_name    || '',
        holder_pan:     existing.holder_pan     || '',
        holder_din:     existing.holder_din     || '',
        mobile:         existing.mobile         || '',
        trade_name:     existing.trade_name     || '',
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
    const suggestedDept = DEPARTMENT_MAP[form.portal_type] || 'OTHER';
    setForm(p => ({
      ...p,
      client_id:   id || '',
      client_name: name || '',
      ...(id && p.department === 'OTHER' && suggestedDept !== 'OTHER' ? { department: suggestedDept } : {}),
    }));
  };

  const showHolderFields = form.holder_type !== 'COMPANY';
  const inputClass = `rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={<KeyRound className="h-4 w-4 text-white" />}
          title={existing ? 'Edit Credential' : 'Add New Credential'}
          subtitle={existing ? `Editing: ${existing.portal_name}` : 'Store a new portal login securely'}
          gradient={`linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`}
          onClose={onClose}
        />

        <div className="p-5 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {/* Client */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Link to Client</Label>
            <ClientSearchDropdown value={form.client_id} onChange={handleClientChange} isDark={isDark} clients={clients} />
            {form.client_name && <p className="text-[10px] text-blue-500 font-medium flex items-center gap-1"><Check className="h-3 w-3" /> {form.client_name}</p>}
          </div>

          {/* Portal Name */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Portal Name *</Label>
            <Input className={inputClass} placeholder="e.g. Client XYZ GST Login" value={form.portal_name} onChange={e => handleChange('portal_name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Portal Type</Label>
              <Select value={form.portal_type} onValueChange={v => { handleChange('portal_type', v); const dept = DEPARTMENT_MAP[v]; if (dept && dept !== 'OTHER') handleChange('department', dept); }}>
                <SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>{PORTAL_TYPES.map(t => <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label || t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Department</Label>
              <Select value={form.department} onValueChange={v => handleChange('department', v)}>
                <SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Holder Type */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Credential Holder</Label>
            <Select value={form.holder_type} onValueChange={v => handleChange('holder_type', v)}>
              <SelectTrigger className={`${inputClass} w-full`}><SelectValue /></SelectTrigger>
              <SelectContent>{HOLDER_TYPES.map(h => <SelectItem key={h} value={h}>{HOLDER_META[h]?.icon} {HOLDER_META[h]?.label || h}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {showHolderFields && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={`rounded-xl border p-3 space-y-3 ${isDark ? 'bg-purple-900/15 border-purple-800/40' : 'bg-purple-50/80 border-purple-200'}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}><UserIcon className="h-3 w-3" /> {HOLDER_META[form.holder_type]?.label || 'Holder'} Details</p>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-slate-500 uppercase">Full Name</Label>
                  <Input className={inputClass} placeholder="e.g. Rajesh Kumar" value={form.holder_name} onChange={e => handleChange('holder_name', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1"><CreditCard className="h-2.5 w-2.5" /> PAN</Label>
                    <Input className={inputClass} placeholder="ABCPK1234D" value={form.holder_pan} onChange={e => handleChange('holder_pan', e.target.value.toUpperCase())} maxLength={10} />
                  </div>
                  {(form.holder_type === 'DIRECTOR' || form.portal_type === 'MCA' || form.portal_type === 'ROC') && (
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1"><Hash className="h-2.5 w-2.5" /> DIN</Label>
                      <Input className={inputClass} placeholder="08123456" value={form.holder_din} onChange={e => handleChange('holder_din', e.target.value)} maxLength={8} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trade Name & Mobile */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1"><Store className="h-2.5 w-2.5" /> Trade Name</Label>
              <Input className={inputClass} placeholder="Brand / trade name" value={form.trade_name} onChange={e => handleChange('trade_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1"><Smartphone className="h-2.5 w-2.5" /> Mobile</Label>
              <Input className={inputClass} placeholder="Registered mobile" value={form.mobile} onChange={e => handleChange('mobile', e.target.value)} />
            </div>
          </div>

          {/* URL */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase">Portal URL</Label>
            <Input className={inputClass} placeholder="https://www.gst.gov.in" value={form.url} onChange={e => handleChange('url', e.target.value)} />
          </div>

          {/* Username */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase">Username / Login ID</Label>
            <Input className={inputClass} placeholder="login@company.com or PAN/GSTIN" value={form.username} onChange={e => handleChange('username', e.target.value)} />
          </div>

          {/* Password */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase">Password {existing ? '(leave blank to keep current)' : ''}</Label>
            <div className="relative">
              <Input className={`${inputClass} pr-10`} type={showPass ? 'text' : 'password'} placeholder={existing ? '••••••••  (unchanged)' : 'Enter password'} value={form.password_plain} onChange={e => handleChange('password_plain', e.target.value)} />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-[11px] font-bold text-slate-500 uppercase">Notes</Label>
            <Textarea className={`rounded-xl resize-none text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : ''}`} rows={2} placeholder="Any additional information…" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
          </div>

          {/* Security notice */}
          <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? 'bg-emerald-900/20 border border-emerald-800/50' : 'bg-emerald-50 border border-emerald-200'}`}>
            <Shield className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className={isDark ? 'text-emerald-300' : 'text-emerald-700'}>Passwords are encrypted using AES-128 before being stored. Never revealed in logs or lists.</p>
          </div>
        </div>

        <div className={`px-5 py-3 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button disabled={loading || !form.portal_name.trim()} onClick={() => onSave(form)} className="rounded-xl font-bold px-8 text-white text-sm" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            {loading ? 'Saving…' : existing ? 'Update' : 'Save Credential'}
          </Button>
        </div>
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

  // Filters & sort
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');
  const [filterHolder, setFilterHolder] = useState('ALL');
  const [sortOption, setSortOption] = useState('lifo');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // View
  const [viewMode, setViewMode] = useState('list');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterDept, filterType, filterClient, filterHolder, sortOption, pageSize]);

  const currentSort = SORT_OPTIONS.find(s => s.value === sortOption) || SORT_OPTIONS[0];

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['passwords', filterDept, filterType, search, filterClient, filterHolder, currentSort.sortBy, currentSort.order],
    queryFn: async () => {
      const params = {
        sort_by: currentSort.sortBy,
        sort_order: currentSort.order,
      };
      if (filterDept !== 'ALL') params.department = filterDept;
      if (filterType !== 'ALL') params.portal_type = filterType;
      if (filterClient !== 'ALL') params.client_id = filterClient;
      if (filterHolder !== 'ALL') params.holder_type = filterHolder;
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

  const { data: clients = [] } = useQuery({
    queryKey: ['passwords-clients'],
    queryFn: () => api.get('/passwords/clients-list').then(r => r.data),
    enabled: canView,
    staleTime: 60_000,
  });

  // Paginated slice
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, page, pageSize]);

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

  const handleSave = useCallback(async (form) => {
    setSaving(true);
    try { await saveMutation.mutateAsync({ form, id: editEntry?.id }); }
    finally { setSaving(false); }
  }, [editEntry, saveMutation]);

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/passwords/template', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'password_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleEdit   = (entry) => { setEditEntry(entry); setModalOpen(true); };
  const handleDelete = (entry) => setDeleteTarget(entry);
  const handleShare  = (entry) => setShareTarget(entry);
  const handleDetail = (entry) => setDetailEntry(entry);
  const handleAddNew = () => { setEditEntry(null); setModalOpen(true); };

  const clientsInResults = useMemo(() => {
    const map = {};
    entries.forEach(e => { if (e.client_id && e.client_name) map[e.client_id] = e.client_name; });
    return Object.entries(map).map(([id, name]) => ({ id, name }));
  }, [entries]);

  const hasActiveFilter = filterDept !== 'ALL' || filterType !== 'ALL' || filterClient !== 'ALL' || filterHolder !== 'ALL' || search;

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

      {/* ── Compact Header ── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-xl px-4 py-3"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: '0 4px 20px rgba(13,59,102,0.25)' }}
        >
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between gap-3 flex-wrap">
            {/* Left: icon + title */}
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
            {/* Right: action buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button onClick={() => setSheetsOpen(true)} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white border-white/20 hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <Sheet className="h-3.5 w-3.5" /> Sheets
              </Button>
              {canEdit && (
                <>
                  <Button onClick={handleDownloadTemplate} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white border-white/20 hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                    <Download className="h-3.5 w-3.5" /> Template
                  </Button>
                  <Button onClick={() => setImportOpen(true)} size="sm" className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white border-white/20 hover:bg-white/20 transition-all" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
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

      {/* ── Stats row (compact) ── */}
      {isAdmin && stats.by_portal_type && (
        <motion.div variants={itemVariants} className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(stats.by_portal_type)
            .filter(([type]) => !['ROC'].includes(type)) // ROC merged with MCA display
            .slice(0, 6)
            .map(([type, count]) => {
              const meta = PORTAL_META[type] || PORTAL_META.OTHER;
              const isActive = filterType === type;
              return (
                <motion.div
                  key={type}
                  whileHover={{ y: -2, transition: springMed }}
                  onClick={() => setFilterType(isActive ? 'ALL' : type)}
                  className={`rounded-xl border p-2 cursor-pointer transition-all text-center ${isActive ? 'shadow-md' : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                  style={isActive ? { background: meta.bg, border: `1.5px solid ${meta.color}40` } : {}}
                >
                  <div className="text-base mb-0.5">{meta.icon}</div>
                  <p className="text-lg font-black leading-none" style={{ color: meta.color }}>{count}</p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${isDark && !isActive ? 'text-slate-400' : 'text-slate-500'}`}>{meta.label}</p>
                </motion.div>
              );
            })}
        </motion.div>
      )}

      {/* ── Search + Filters (compact) ── */}
      <motion.div variants={itemVariants}>
        <div className={`flex flex-col sm:flex-row gap-2 p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className={`pl-9 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
              placeholder="Search portal, username, client, PAN, mobile…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Sort */}
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className={`w-full sm:w-44 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.icon} {s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Client filter */}
          {clientsInResults.length > 0 && (
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
                <Building2 className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Clients</SelectItem>
                {clientsInResults.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {/* Holder filter */}
          <Select value={filterHolder} onValueChange={setFilterHolder}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Users className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Holder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Holders</SelectItem>
              {HOLDER_TYPES.map(h => <SelectItem key={h} value={h}>{HOLDER_META[h]?.icon} {HOLDER_META[h]?.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Dept filter */}
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Filter className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Dept" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Depts</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Type filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Tag className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {/* Merged MCA/ROC */}
              <SelectItem value="MCA">🏛️ MCA/ROC</SelectItem>
              {PORTAL_TYPES.filter(t => !['MCA', 'ROC'].includes(t)).map(t => (
                <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className={`flex items-center rounded-xl p-0.5 gap-0.5 border flex-shrink-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
            <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="List view">
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Clear */}
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
        </div>
      ) : entries.length === 0 ? (
        <motion.div variants={itemVariants} className={`text-center py-16 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <KeyRound className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className={`font-semibold text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>No credentials found</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">{hasActiveFilter ? 'Try adjusting your filters.' : 'Start by adding your first portal credential.'}</p>
          {canEdit && (
            <Button onClick={handleAddNew} className="rounded-xl font-bold text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add First Credential
            </Button>
          )}
        </motion.div>
      ) : viewMode === 'grid' ? (
        <>
          <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            <AnimatePresence>
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
                />
              ))}
            </AnimatePresence>
          </motion.div>
          <div className={`rounded-xl border px-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <Pagination total={entries.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} isDark={isDark} />
          </div>
        </>
      ) : (
        <motion.div variants={itemVariants} className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${isDark ? 'border-slate-700 text-slate-400 bg-slate-800/80' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
                  <th className="px-3 py-2.5 text-center w-8">#</th>
                  <th className="px-3 py-2.5 text-left">Portal</th>
                  <th className="px-3 py-2.5 text-left">Client / Holder / Mobile</th>
                  <th className="px-3 py-2.5 text-left">Username</th>
                  <th className="px-3 py-2.5 text-left">Password</th>
                  <th className="px-3 py-2.5 text-left">URL</th>
                  <th className="px-3 py-2.5 text-left">Updated</th>
                  <th className="px-3 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <motion.tbody variants={containerVariants}>
                <AnimatePresence>
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
                    />
                  ))}
                </AnimatePresence>
              </motion.tbody>
            </table>
          </div>
          <div className={`border-t px-3 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <Pagination total={entries.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} isDark={isDark} />
          </div>
        </motion.div>
      )}

      {/* ── Modals ── */}
      <EntryModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEntry(null); }}
        existing={editEntry}
        isDark={isDark}
        onSave={handleSave}
        loading={saving}
        clients={clients}
      />

      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        isDark={isDark}
        onSuccess={() => setImportOpen(false)}
      />

      <SheetLinksModal
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        isDark={isDark}
        isAdmin={isAdmin}
      />

      <WhatsAppShareModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        entry={shareTarget}
        isDark={isDark}
      />

      <DetailModal
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        entry={detailEntry}
        isDark={isDark}
        canEdit={canEdit}
        isAdmin={isAdmin}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <DialogContent className={`max-w-sm rounded-3xl [&>button]:hidden ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-5 w-5" /> Delete Credential</DialogTitle>
                <DialogDescription>Permanently delete <b>{deleteTarget?.portal_name}</b>? This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 pt-4">
                <Button variant="ghost" className="rounded-xl" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                <Button className="rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>
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
