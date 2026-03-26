import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '@/lib/api';
import {
  KeyRound, Plus, Search, Eye, EyeOff, Copy, Edit2, Trash2,
  Globe, Lock, X, RefreshCw, Clock, User as UserIcon, Tag,
  Building2, Filter, ExternalLink, Send, Download, Upload,
  FileUp, Users, LayoutGrid, List, AlertTriangle, Loader2,
  ArrowUpDown, ChevronLeft, ChevronRight, Smartphone, Store,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

// ── Brand palette ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  whatsapp:     '#25D366',
};

const springMed = { type: 'spring', stiffness: 340, damping: 24 };

// ── Portal type meta ──────────────────────────────────────────────────────────
const PORTAL_META = {
  MCA:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', borderColor: '#3B82F6', accentBg: '#DBEAFE', icon: '🏛️', fullName: 'Ministry of Corporate Affairs / ROC' },
  ROC:        { label: 'MCA/ROC',    color: '#1E3A8A', bg: '#EFF6FF', borderColor: '#3B82F6', accentBg: '#DBEAFE', icon: '🏛️', fullName: 'Registrar of Companies / MCA' },
  DGFT:       { label: 'DGFT',       color: '#065F46', bg: '#ECFDF5', borderColor: '#10B981', accentBg: '#D1FAE5', icon: '🌐', fullName: 'Directorate General of Foreign Trade' },
  TRADEMARK:  { label: 'Trademark',  color: '#0F766E', bg: '#F0FDFA', borderColor: '#14B8A6', accentBg: '#CCFBF1', icon: '™️',  fullName: 'Trademark / IP India' },
  GST:        { label: 'GST',        color: '#7C3AED', bg: '#F5F3FF', borderColor: '#A78BFA', accentBg: '#EDE9FE', icon: '📊', fullName: 'GST Portal' },
  INCOME_TAX: { label: 'Income Tax', color: '#DC2626', bg: '#FEF2F2', borderColor: '#EF4444', accentBg: '#FEE2E2', icon: '💰', fullName: 'Income Tax India' },
  TDS:        { label: 'TDS',        color: '#B45309', bg: '#FFFBEB', borderColor: '#F59E0B', accentBg: '#FEF3C7', icon: '🧾', fullName: 'TDS / TRACES' },
  TRACES:     { label: 'TRACES',     color: '#B45309', bg: '#FFFBEB', borderColor: '#F59E0B', accentBg: '#FEF3C7', icon: '🔍', fullName: 'TRACES Portal' },
  EPFO:       { label: 'EPFO',       color: '#1D4ED8', bg: '#EFF6FF', borderColor: '#3B82F6', accentBg: '#DBEAFE', icon: '👷', fullName: 'EPFO / PF Portal' },
  ESIC:       { label: 'ESIC',       color: '#0369A1', bg: '#F0F9FF', borderColor: '#0EA5E9', accentBg: '#CFFAFE', icon: '🏥', fullName: 'ESIC Portal' },
  MSME:       { label: 'MSME',       color: '#92400E', bg: '#FEF3C7', borderColor: '#F59E0B', accentBg: '#FCD34D', icon: '🏭', fullName: 'MSME Samadhaan' },
  RERA:       { label: 'RERA',       color: '#4B5563', bg: '#F9FAFB', borderColor: '#6B7280', accentBg: '#F3F4F6', icon: '🏗️', fullName: 'RERA Portal' },
  OTHER:      { label: 'Other',      color: '#6B7280', bg: '#F9FAFB', borderColor: '#9CA3AF', accentBg: '#F3F4F6', icon: '🔗', fullName: 'Custom / Other Portal' },
};

const PORTAL_TYPES = Object.keys(PORTAL_META);
const DEPARTMENTS  = ['GST', 'IT', 'ACC', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'OTHER'];
const HOLDER_TYPES = ['COMPANY', 'DIRECTOR', 'INDIVIDUAL', 'PARTNER', 'TRUSTEE', 'OTHER'];

const HOLDER_META = {
  COMPANY:    { label: 'Company',    icon: '🏢', color: '#1E3A8A' },
  DIRECTOR:   { label: 'Director',   icon: '👔', color: '#7C3AED' },
  INDIVIDUAL: { label: 'Individual', icon: '👤', color: '#065F46' },
  PARTNER:    { label: 'Partner',    icon: '🤝', color: '#B45309' },
  TRUSTEE:    { label: 'Trustee',    icon: '⚖️', color: '#0369A1' },
  OTHER:      { label: 'Other',      icon: '👥', color: '#6B7280' },
};

const SORT_OPTIONS = [
  { value: 'lifo', label: 'Newest First', sortBy: 'created_at',  order: 'desc' },
  { value: 'fifo', label: 'Oldest First', sortBy: 'created_at',  order: 'asc'  },
  { value: 'az',   label: 'A → Z',        sortBy: 'portal_name', order: 'asc'  },
  { value: 'za',   label: 'Z → A',        sortBy: 'portal_name', order: 'desc' },
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

// ── WhatsApp SVG icon ─────────────────────────────────────────────────────────
function WAIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function PortalBadge({ type }) {
  const meta = PORTAL_META[type] || PORTAL_META.OTHER;
  return (
    <span className="inline-flex items-center gap-1 font-bold rounded-full px-2 py-0.5 text-[10px]"
      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.borderColor}` }}>
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
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
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
            <p className="text-white font-bold text-sm leading-tight">{title}</p>
            {subtitle && <p className="text-white/60 text-[11px] mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ml-2">
          <X className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Reveal Password ───────────────────────────────────────────────────────────
function RevealPassword({ entryId, isDark }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReveal = async () => {
    if (revealed) { setRevealed(false); setPassword(''); return; }
    setLoading(true);
    try {
      const res = await api.get(`/passwords/${entryId}/reveal`);
      setPassword(res.data.password || '');
      setRevealed(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reveal password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {revealed
        ? <span className={`font-mono text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{password}</span>
        : <MaskedPassword />}
      <button type="button" onClick={handleReveal} disabled={loading}
        className={`flex-shrink-0 p-0.5 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
        {loading
          ? <Loader2 className="h-3 w-3 text-slate-400 animate-spin" />
          : revealed
            ? <EyeOff className="h-3 w-3 text-slate-400" />
            : <Eye className="h-3 w-3 text-slate-400" />}
      </button>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ open, onClose, entry, isDark }) {
  if (!entry) return null;
  const meta = PORTAL_META[entry.portal_type] || PORTAL_META.OTHER;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={<span className="text-2xl">{meta.icon}</span>}
          title={entry.portal_name}
          subtitle={meta.fullName}
          gradient={`linear-gradient(135deg, ${meta.color}, ${meta.borderColor})`}
          onClose={onClose}
        />
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Portal Type</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.portal_type}</p>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Department</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.department}</p>
            </div>
            {entry.url && (
              <div className="col-span-2">
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>URL</p>
                <a href={entry.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm mt-1 text-blue-500 hover:underline flex items-center gap-1">
                  {entry.url}<ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`font-bold text-xs uppercase tracking-wider mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Login Credentials</p>
            <div className="space-y-3">
              {entry.username && (
                <div>
                  <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Username / Email</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`font-mono text-sm ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.username}</span>
                    <button type="button"
                      onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Copied'))}
                      className={`p-1 rounded ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-200'}`}>
                      <Copy className="h-3 w-3 text-slate-400" />
                    </button>
                  </div>
                </div>
              )}
              {entry.has_password && (
                <div>
                  <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Password</p>
                  <div className="mt-1"><RevealPassword entryId={entry.id} isDark={isDark} /></div>
                </div>
              )}
            </div>
          </div>

          {(entry.holder_name || entry.holder_pan || entry.holder_din) && (
            <div className="grid grid-cols-2 gap-4">
              {entry.holder_type && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Holder Type</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.holder_type}</p>
              </div>}
              {entry.holder_name && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Holder Name</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.holder_name}</p>
              </div>}
              {entry.holder_pan && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>PAN</p>
                <p className={`text-sm mt-1 font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.holder_pan}</p>
              </div>}
              {entry.holder_din && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>DIN</p>
                <p className={`text-sm mt-1 font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.holder_din}</p>
              </div>}
            </div>
          )}

          {(entry.client_name || entry.client_id) && (
            <div className="grid grid-cols-2 gap-4">
              {entry.client_name && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Client Name</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.client_name}</p>
              </div>}
              {entry.client_id && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Client ID</p>
                <p className={`text-sm mt-1 font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.client_id}</p>
              </div>}
            </div>
          )}

          {(entry.mobile || entry.trade_name) && (
            <div className="grid grid-cols-2 gap-4">
              {entry.mobile && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile</p>
                <p className={`text-sm mt-1 font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.mobile}</p>
              </div>}
              {entry.trade_name && <div>
                <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Trade Name</p>
                <p className={`text-sm mt-1 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{entry.trade_name}</p>
              </div>}
            </div>
          )}

          {entry.notes && (
            <div>
              <p className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Notes</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{entry.notes}</p>
            </div>
          )}

          {entry.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag, i) => <Badge key={i} variant="secondary" className="rounded-full">{tag}</Badge>)}
            </div>
          )}

          <div className={`p-3 rounded-lg text-xs space-y-1 ${isDark ? 'bg-slate-700/30 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
            {entry.created_at && <p>Created: {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}</p>}
            {entry.updated_at && <p>Updated: {format(new Date(entry.updated_at), 'MMM d, yyyy HH:mm')}</p>}
            {entry.last_accessed_at && <p>Last accessed: {format(new Date(entry.last_accessed_at), 'MMM d, yyyy HH:mm')}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit / Create Modal ───────────────────────────────────────────────────────
function EditModal({ open, onClose, entry, isDark, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  useEffect(() => { setFormData(entry || {}); }, [entry, open]);

  const set = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!formData.portal_name?.trim() || !formData.username?.trim()) {
      toast.error('Portal name and username are required');
      return;
    }
    setLoading(true);
    try {
      if (entry?.id) {
        await api.put(`/passwords/${entry.id}`, formData);
        toast.success('Entry updated');
      } else {
        await api.post('/passwords', formData);
        toast.success('Entry created');
      }
      qc.invalidateQueries({ queryKey: ['passwords'] });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save entry');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `rounded-xl mt-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`;
  const selectTriggerCls = `rounded-xl mt-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader
          icon={entry?.id ? <Edit2 className="h-4 w-4 text-white" /> : <Plus className="h-4 w-4 text-white" />}
          title={entry?.id ? 'Edit Entry' : 'Add New Entry'}
          subtitle="Manage credential details"
          gradient={`linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`}
          onClose={onClose}
        />
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Portal Name *</Label>
              <Input className={inputCls} value={formData.portal_name || ''} onChange={e => set('portal_name', e.target.value)} placeholder="e.g. GST Portal" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Portal Type</Label>
              <Select value={formData.portal_type || 'OTHER'} onValueChange={v => set('portal_type', v)}>
                <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>{PORTAL_TYPES.map(t => <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase">Portal URL</Label>
            <Input className={inputCls} value={formData.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Username / Email *</Label>
              <Input className={inputCls} value={formData.username || ''} onChange={e => set('username', e.target.value)} placeholder="user@example.com" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Password</Label>
              <Input type="password" className={inputCls} value={formData.password_plain || ''} onChange={e => set('password_plain', e.target.value)} placeholder="••••••••" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Holder Type</Label>
              <Select value={formData.holder_type || 'COMPANY'} onValueChange={v => set('holder_type', v)}>
                <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>{HOLDER_TYPES.map(t => <SelectItem key={t} value={t}>{HOLDER_META[t]?.icon} {HOLDER_META[t]?.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Holder Name</Label>
              <Input className={inputCls} value={formData.holder_name || ''} onChange={e => set('holder_name', e.target.value)} placeholder="Director name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Holder PAN</Label>
              <Input className={inputCls} value={formData.holder_pan || ''} onChange={e => set('holder_pan', e.target.value)} placeholder="ABCDE1234F" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Holder DIN</Label>
              <Input className={inputCls} value={formData.holder_din || ''} onChange={e => set('holder_din', e.target.value)} placeholder="DIN number" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Mobile Number</Label>
              <Input className={inputCls} value={formData.mobile || ''} onChange={e => set('mobile', e.target.value)} placeholder="+91 9876543210" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Trade Name</Label>
              <Input className={inputCls} value={formData.trade_name || ''} onChange={e => set('trade_name', e.target.value)} placeholder="Business name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold uppercase">Client Name</Label>
              <Input className={inputCls} value={formData.client_name || ''} onChange={e => set('client_name', e.target.value)} placeholder="Company name" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Client ID</Label>
              <Input className={inputCls} value={formData.client_id || ''} onChange={e => set('client_id', e.target.value)} placeholder="Client code" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase">Notes</Label>
            <Textarea className={`${inputCls} resize-none`} rows={3} value={formData.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." />
          </div>

          <div>
            <Label className="text-xs font-bold uppercase">Tags (comma-separated)</Label>
            <Input className={inputCls}
              value={Array.isArray(formData.tags) ? formData.tags.join(', ') : (formData.tags || '')}
              onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="tag1, tag2" />
          </div>
        </div>
        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>
            {loading ? 'Saving…' : 'Save Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({ open, onClose, entry, isDark, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.delete(`/passwords/${entry.id}`);
      toast.success('Entry deleted');
      qc.invalidateQueries({ queryKey: ['passwords'] });
      onConfirm?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-md rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader icon={<Trash2 className="h-4 w-4 text-white" />} title="Delete Entry" subtitle="This action cannot be undone"
          gradient="linear-gradient(135deg, #DC2626, #EF4444)" onClose={onClose} />
        <div className="p-6 space-y-4">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Delete <span className="font-bold">{entry?.portal_name}</span>? This cannot be undone.
          </p>
          <div className={`p-3 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-900/20 border border-red-800/40 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            ⚠️ All associated data will be permanently removed.
          </div>
        </div>
        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDelete} disabled={loading} className="rounded-xl font-bold text-white bg-red-500 hover:bg-red-600">
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── WhatsApp Share Modal ──────────────────────────────────────────────────────
function WhatsAppShareModal({ open, onClose, entry, isDark }) {
  const [customPhone, setCustomPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);
  const [customMsg, setCustomMsg] = useState('');

  useEffect(() => {
    if (!open || !entry?.id) return;
    setLoadingPw(true);
    api.get(`/passwords/${entry.id}/reveal`)
      .then(res => setPassword(res.data.password || ''))
      .catch(() => setPassword(''))
      .finally(() => setLoadingPw(false));
  }, [open, entry?.id]);

  const buildMessage = useCallback(() => {
    const lines = ['🔐 Portal Credentials', '─'.repeat(28)];
    if (entry?.portal_name) lines.push(`Portal: ${entry.portal_name}`);
    if (entry?.portal_type) lines.push(`Type: ${entry.portal_type}`);
    if (entry?.url) lines.push(`URL: ${entry.url}`);
    lines.push('', '👤 Login Details', '─'.repeat(28));
    if (entry?.username) lines.push(`ID: ${entry.username}`);
    if (password) lines.push(`Password: ${password}`);
    if (entry?.holder_name) {
      lines.push('', '👥 Holder', '─'.repeat(28));
      lines.push(`Name: ${entry.holder_name}`);
      if (entry.holder_pan) lines.push(`PAN: ${entry.holder_pan}`);
    }
    if (customMsg.trim()) { lines.push('', '📝 Note', '─'.repeat(28), customMsg.trim()); }
    lines.push('', '─'.repeat(28), 'Sent via Taskosphere 📱');
    return lines.join('\n');
  }, [entry, password, customMsg]);

  const handleSend = () => {
    const phone = entry?.mobile || customPhone;
    if (!phone) { toast.error('Enter a phone number'); return; }
    const digits = phone.replace(/\D/g, '');
    const e164 = digits.startsWith('91') ? digits : `91${digits}`;
    window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(buildMessage())}`, '_blank');
    toast.success('Opening WhatsApp Web…');
    handleClose();
  };

  const handleClose = () => { setCustomPhone(''); setPassword(''); setCustomMsg(''); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-md rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader icon={<WAIcon className="h-4 w-4 text-white" />} title="Share via WhatsApp"
          subtitle="Credentials auto-included" gradient="linear-gradient(135deg, #075E54 0%, #25D366 100%)" onClose={handleClose} />
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs font-bold uppercase text-slate-500">
              {entry?.mobile ? `Recipient: ${entry.mobile}` : 'Phone Number'}
            </Label>
            {!entry?.mobile && (
              <Input className={`rounded-xl h-9 mt-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
                placeholder="Phone with country code" value={customPhone} onChange={e => setCustomPhone(e.target.value)} />
            )}
          </div>

          {loadingPw && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Fetching credentials…
            </p>
          )}

          {password && !loadingPw && (
            <div className={`p-3 rounded-lg text-xs space-y-1 ${isDark ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
              <p className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>✓ Credentials ready</p>
              <p className={`font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>ID: {entry?.username}</p>
              <p className={`font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Password: {password}</p>
            </div>
          )}

          <div>
            <Label className="text-xs font-bold uppercase text-slate-500">Additional Note (optional)</Label>
            <Textarea className={`rounded-xl resize-none text-sm mt-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
              rows={3} placeholder="Extra notes…" value={customMsg} onChange={e => setCustomMsg(e.target.value)} />
          </div>
        </div>
        <DialogFooter className={`px-5 py-3 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
          <Button disabled={!(entry?.mobile || customPhone) || loadingPw} onClick={handleSend}
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
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const qc = useQueryClient();

  const handleFileChange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) { toast.error('Upload Excel or CSV file'); return; }
    setFile(f); setPreview(null); setResult(null); setStep(1);
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post('/passwords/parse-preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data); setStep(2);
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
    } catch (err) { toast.error(err.response?.data?.detail || 'Import failed'); }
    finally { setImporting(false); }
  };

  const handleClose = () => { setStep(1); setFile(null); setPreview(null); setResult(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl rounded-3xl p-0 border-none overflow-hidden [&>button]:hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <ModalHeader icon={<Upload className="h-4 w-4 text-white" />} title="Bulk Import" subtitle="Upload Excel or CSV"
          gradient={`linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`} onClose={handleClose} />
        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div className={`border-2 border-dashed rounded-xl p-8 text-center ${isDark ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}>
                <input type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" className="hidden" id="bulk-file-input" />
                <label htmlFor="bulk-file-input" className="cursor-pointer block">
                  <FileUp className="h-10 w-10 mx-auto mb-2 text-slate-400" />
                  <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Click to upload</p>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Excel (.xlsx, .xls) or CSV (.csv)</p>
                </label>
              </div>
              {file && <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Selected: {file.name}</p>}
            </>
          )}
          {step === 2 && preview && (
            <div className="space-y-3">
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{preview.rows_count} rows, {preview.columns_count} columns</p>
              <div className={`rounded-lg p-3 max-h-48 overflow-auto ${isDark ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <pre className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {JSON.stringify(preview.sample_rows?.slice(0, 3), null, 2)}
                </pre>
              </div>
            </div>
          )}
          {step === 3 && result && (
            <div className={`rounded-lg p-4 ${isDark ? 'bg-green-900/20 border border-green-800/40' : 'bg-green-50 border border-green-200'}`}>
              <p className={`font-semibold ${isDark ? 'text-green-300' : 'text-green-700'}`}>✓ Import successful!</p>
              <p className={`text-sm mt-1 ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                {result.imported} imported · {result.skipped} skipped · {result.errors} errors
              </p>
            </div>
          )}
        </div>
        <DialogFooter className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Close</Button>
          {step === 1 && <Button onClick={handleParse} disabled={!file || parsing} className="rounded-xl font-bold text-white" style={{ background: COLORS.deepBlue }}>{parsing ? 'Parsing…' : 'Preview'}</Button>}
          {step === 2 && <Button onClick={handleImport} disabled={importing} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>{importing ? 'Importing…' : 'Import All'}</Button>}
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
  const btn = `h-7 min-w-[28px] px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center`;

  return (
    <div className={`flex items-center justify-between gap-3 py-2 px-1 flex-wrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs">Rows:</span>
        <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPage(1); }}>
          <SelectTrigger className={`h-7 w-20 rounded-lg text-xs ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white'}`}><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZE_OPTIONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs">{Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page === 1} onClick={() => onPage(1)} className={`${btn} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}>«</button>
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)} className={`${btn} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}><ChevronLeft className="h-3.5 w-3.5" /></button>
        {pages.map(p => (
          <button key={p} type="button" onClick={() => onPage(p)}
            className={`${btn} ${p === page ? 'text-white shadow-sm' : isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
            style={p === page ? { background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` } : {}}>
            {p}
          </button>
        ))}
        <button type="button" disabled={page === totalPages} onClick={() => onPage(page + 1)} className={`${btn} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}><ChevronRight className="h-3.5 w-3.5" /></button>
        <button type="button" disabled={page === totalPages} onClick={() => onPage(totalPages)} className={`${btn} ${isDark ? 'hover:bg-slate-700 disabled:opacity-30' : 'hover:bg-slate-100 disabled:opacity-30'}`}>»</button>
      </div>
    </div>
  );
}

// ── Entry Card (Grid) ─────────────────────────────────────────────────────────
function EntryCard({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark, selected, onSelect }) {
  const meta = PORTAL_META[entry.portal_type] || PORTAL_META.OTHER;

  return (
    <motion.div variants={itemVariants} whileHover={{ y: -3, transition: springMed }}>
      <div
        className={`rounded-2xl border-2 p-3.5 h-full flex flex-col cursor-pointer transition-all ${selected ? (isDark ? 'border-blue-500 bg-blue-900/10' : 'border-blue-400 bg-blue-50') : isDark ? 'bg-slate-800 hover:shadow-lg' : 'bg-white hover:shadow-lg'}`}
        onClick={() => onDetail(entry)}
        style={!selected ? { borderColor: meta.borderColor, boxShadow: `0 0 0 1px ${meta.borderColor}20` } : {}}
      >
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {isAdmin && (
              <div className="flex-shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onSelect(entry.id); }}>
                <input type="checkbox" checked={selected} onChange={() => {}} className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500" />
              </div>
            )}
            <span className="text-[10px] font-black mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-white"
              style={{ background: meta.color }}>{serialNo}</span>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</h3>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <PortalBadge type={entry.portal_type} />
                <DeptBadge dept={entry.department} />
                <HolderBadge holderType={entry.holder_type} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 ml-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {canEdit && <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Edit2 className="h-3 w-3 text-slate-400" /></button>}
            {isAdmin && <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Trash2 className="h-3 w-3 text-red-400" /></button>}
          </div>
        </div>

        <div className="h-1 rounded-full mb-2" style={{ background: meta.color }} />

        {entry.holder_name && (
          <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-xs font-medium ${isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
            <UserIcon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{entry.holder_name}</span>
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
              <button type="button" onClick={() => navigator.clipboard.writeText(entry.username).then(() => toast.success('Copied'))}
                className={`flex-shrink-0 p-0.5 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <Copy className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-2.5" onClick={e => e.stopPropagation()}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Password</p>
          {entry.has_password
            ? <RevealPassword entryId={entry.id} isDark={isDark} />
            : <span className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No password stored</span>}
        </div>

        {entry.mobile && (
          <div className={`flex items-center gap-1.5 mb-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <Smartphone className="h-3 w-3 flex-shrink-0" /><span className="font-mono">{entry.mobile}</span>
          </div>
        )}
        {entry.url && (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => window.open(entry.url, '_blank')}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:underline truncate w-full text-left">
              <Globe className="h-3 w-3 flex-shrink-0" /><span className="truncate">{entry.url}</span><ExternalLink className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
            </button>
          </div>
        )}
        {entry.notes && (
          <div className={`mt-auto pt-2 border-t text-[11px] ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
            {entry.notes.slice(0, 80)}{entry.notes.length > 80 ? '…' : ''}
          </div>
        )}

        <div className={`flex items-center justify-between mt-2.5 pt-2.5 border-t text-[10px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{entry.updated_at ? format(new Date(entry.updated_at), 'MMM d') : '—'}</span>
          {entry.last_accessed_at && <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" />{format(new Date(entry.last_accessed_at), 'MMM d')}</span>}
        </div>

        <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={e => { e.stopPropagation(); onShare(entry); }}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: isDark ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.07)', color: COLORS.whatsapp, border: `1px solid ${COLORS.whatsapp}28` }}>
          <WAIcon className="h-3 w-3" /> Share via WhatsApp
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Entry Row (List) ──────────────────────────────────────────────────────────
function EntryRow({ entry, serialNo, canEdit, isAdmin, onEdit, onDelete, onShare, onDetail, isDark, selected, onSelect }) {
  const meta = PORTAL_META[entry.portal_type] || PORTAL_META.OTHER;
  const clientHolderName = entry.client_name || entry.holder_name || '—';

  return (
    <motion.tr variants={itemVariants}
      className={`border-b transition-colors cursor-pointer ${selected ? (isDark ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-200') : isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'}`}
      onClick={() => onDetail(entry)}
      style={{ borderLeftColor: meta.color, borderLeftWidth: '3px' }}>
      {isAdmin && (
        <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onSelect(entry.id)} className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-500" />
        </td>
      )}
      <td className="px-3 py-2 text-center">
        <span className="text-[10px] font-black text-white rounded px-1.5 py-0.5" style={{ background: meta.color }}>{serialNo}</span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{clientHolderName}</span>
          {entry.client_name && entry.holder_name && (
            <span className={`text-xs ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{entry.holder_name}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <span className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{entry.portal_name}</span>
          <div className="flex items-center gap-1 flex-wrap"><PortalBadge type={entry.portal_type} /><DeptBadge dept={entry.department} /></div>
        </div>
      </td>
      <td className="px-3 py-2"><span className={`font-mono text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{entry.username}</span></td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}><RevealPassword entryId={entry.id} isDark={isDark} /></td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end">
          {canEdit && <button type="button" onClick={() => onEdit(entry)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Edit2 className="h-3 w-3 text-slate-400" /></button>}
          {isAdmin && <button type="button" onClick={() => onDelete(entry)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><Trash2 className="h-3 w-3 text-red-400" /></button>}
          <button type="button" onClick={() => onShare(entry)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}><WAIcon className="h-3 w-3" style={{ color: COLORS.whatsapp }} /></button>
        </div>
      </td>
    </motion.tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function UpdatePasswordRepository() {
  const isDark = useDark();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [viewMode, setViewMode]     = useState('grid');
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [search, setSearch]         = useState('');
  const [sortOption, setSortOption] = useState('lifo');
  const [filterDept, setFilterDept]     = useState('ALL');
  const [filterType, setFilterType]     = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');
  const [filterHolder, setFilterHolder] = useState('ALL');
  const [selectedIds, setSelectedIds]   = useState(new Set());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [editEntry, setEditEntry]   = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [shareOpen, setShareOpen]   = useState(false);
  const [shareEntry, setShareEntry] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canView = isAdmin || user?.permissions?.includes('view_passwords');
  const canEdit = isAdmin || user?.permissions?.includes('edit_passwords');

  const sortMeta = SORT_OPTIONS.find(s => s.value === sortOption) || SORT_OPTIONS[0];

  // ── FIX: only pass non-ALL filter values; never pass undefined as string ──
  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['passwords', search, filterDept, filterType, filterClient, filterHolder, sortOption],
    queryFn: async () => {
      const params = {
        sort_by: sortMeta.sortBy,
        sort_order: sortMeta.order,
        limit: 500,
      };
      if (search)                   params.search      = search;
      if (filterDept !== 'ALL')     params.department  = filterDept;
      if (filterType !== 'ALL')     params.portal_type = filterType;
      if (filterClient !== 'ALL')   params.client_id   = filterClient;
      if (filterHolder !== 'ALL')   params.holder_type = filterHolder;

      const res = await api.get('/passwords', { params });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: canView,
  });

  // ── FIX: stats query only fires for admins ────────────────────────────────
  const { data: stats = {} } = useQuery({
    queryKey: ['passwords-stats'],
    queryFn: async () => {
      const res = await api.get('/passwords/admin/stats');
      return res.data || {};
    },
    enabled: isAdmin,
    retry: false,
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

  const hasActiveFilter = filterDept !== 'ALL' || filterType !== 'ALL' || filterClient !== 'ALL' || filterHolder !== 'ALL' || !!search;

  const clearFilters = () => {
    setFilterDept('ALL'); setFilterType('ALL'); setFilterClient('ALL'); setFilterHolder('ALL'); setSearch('');
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/passwords/download-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'password-template.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download template'); }
  };

  const toggleSelect = id => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`text-center p-12 rounded-3xl border max-w-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-red-500" />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Access Restricted</h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>You need the <b>View Password Repository</b> permission.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
      {/* ── Header ── */}
      <motion.div variants={itemVariants}>
        <div className="relative overflow-hidden rounded-xl px-4 py-3"
          style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: '0 4px 20px rgba(13,59,102,0.25)' }}>
          <div className="absolute right-0 top-0 w-48 h-48 rounded-full -mr-16 -mt-16 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">Password Vault</h1>
                <p className="text-white/55 text-[11px]">MCA/ROC · GST · IT · TDS · DGFT · TM & more</p>
              </div>
              {isAdmin && stats.total != null && (
                <div className="px-2.5 py-1 bg-white/15 rounded-lg text-white text-xs font-bold hidden sm:block">{stats.total} total</div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {canEdit && (
                <>
                  <Button onClick={handleDownloadTemplate} size="sm"
                    className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white hover:bg-white/20"
                    style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Download className="h-3.5 w-3.5" /> Template
                  </Button>
                  <Button onClick={() => setImportOpen(true)} size="sm"
                    className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white hover:bg-white/20"
                    style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Upload className="h-3.5 w-3.5" /> Import
                  </Button>
                  <Button onClick={() => { setEditEntry(null); setEditOpen(true); }} size="sm"
                    className="rounded-lg font-bold h-8 text-xs gap-1.5 text-white shadow-lg hover:scale-105"
                    style={{ background: COLORS.emeraldGreen }}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Stats tiles (admin only) ── */}
      {isAdmin && stats.by_portal_type && Object.keys(stats.by_portal_type).length > 0 && (
        <motion.div variants={itemVariants} className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Object.entries(stats.by_portal_type).slice(0, 6).map(([type, count]) => {
            const meta = PORTAL_META[type] || PORTAL_META.OTHER;
            const isActive = filterType === type;
            return (
              <motion.div key={type} whileHover={{ y: -2, transition: springMed }}
                onClick={() => setFilterType(isActive ? 'ALL' : type)}
                className={`rounded-xl border p-2 cursor-pointer transition-all text-center ${isActive ? 'shadow-md' : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                style={isActive ? { background: meta.accentBg, borderColor: meta.borderColor, borderWidth: '2px' } : {}}>
                <div className="text-base mb-0.5">{meta.icon}</div>
                <p className="text-lg font-black leading-none" style={{ color: meta.color }}>{count}</p>
                <p className={`text-[10px] font-semibold mt-0.5 ${isDark && !isActive ? 'text-slate-400' : 'text-slate-500'}`}>{meta.label}</p>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ── Search + Filters ── */}
      <motion.div variants={itemVariants}>
        <div className={`flex flex-col sm:flex-row gap-2 p-3 rounded-xl border flex-wrap ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input className={`pl-9 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}
              placeholder="Search portal, username, client…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={sortOption} onValueChange={v => { setSortOption(v); setPage(1); }}>
            <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>{SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          {clientsInResults.length > 0 && (
            <Select value={filterClient} onValueChange={v => { setFilterClient(v); setPage(1); }}>
              <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
                <Building2 className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Clients</SelectItem>
                {clientsInResults.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterHolder} onValueChange={v => { setFilterHolder(v); setPage(1); }}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Users className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Holder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Holders</SelectItem>
              {HOLDER_TYPES.map(h => <SelectItem key={h} value={h}>{HOLDER_META[h]?.icon} {HOLDER_META[h]?.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDept} onValueChange={v => { setFilterDept(v); setPage(1); }}>
            <SelectTrigger className={`w-full sm:w-36 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Filter className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Dept" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Depts</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className={`w-full sm:w-40 rounded-xl h-9 text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : ''}`}>
              <Tag className="h-3.5 w-3.5 mr-1 text-slate-400" /><SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {PORTAL_TYPES.map(t => <SelectItem key={t} value={t}>{PORTAL_META[t]?.icon} {PORTAL_META[t]?.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className={`flex items-center rounded-xl p-0.5 gap-0.5 border flex-shrink-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
            <button type="button" onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? isDark ? 'bg-slate-500 text-white' : 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          {hasActiveFilter && (
            <Button variant="ghost" className="rounded-xl h-9 px-2.5 text-xs flex-shrink-0" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Results ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: COLORS.mediumBlue, borderTopColor: 'transparent' }} />
        </div>
      ) : isError ? (
        <div className={`text-center py-12 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Failed to load password vault</p>
          <Button variant="ghost" className="mt-3 rounded-xl" onClick={() => qc.invalidateQueries({ queryKey: ['passwords'] })}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Retry
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <motion.div variants={itemVariants} className={`text-center py-16 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <KeyRound className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className={`font-semibold text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>No credentials found</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">{hasActiveFilter ? 'Try adjusting your filters.' : 'Add your first portal credential.'}</p>
          {canEdit && (
            <Button onClick={() => { setEditEntry(null); setEditOpen(true); }} className="rounded-xl font-bold text-white" style={{ background: COLORS.emeraldGreen }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add First Entry
            </Button>
          )}
        </motion.div>
      ) : viewMode === 'grid' ? (
        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedEntries.map((entry, idx) => (
            <EntryCard
              key={entry.id} entry={entry} serialNo={(page - 1) * pageSize + idx + 1}
              canEdit={canEdit} isAdmin={isAdmin}
              onEdit={e => { setEditEntry(e); setEditOpen(true); }}
              onDelete={e => { setDeleteEntry(e); setDeleteOpen(true); }}
              onShare={e => { setShareEntry(e); setShareOpen(true); }}
              onDetail={e => { setDetailEntry(e); setDetailOpen(true); }}
              isDark={isDark} selected={selectedIds.has(entry.id)} onSelect={toggleSelect}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <table className="w-full text-sm">
            <thead className={`border-b ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <tr>
                {isAdmin && <th className="px-2 py-2 text-left w-8" />}
                <th className="px-3 py-2 text-center text-xs font-semibold w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Client / Holder</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Portal</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Username</th>
                <th className="px-3 py-2 text-left text-xs font-semibold">Password</th>
                <th className="px-3 py-2 text-right text-xs font-semibold">Actions</th>
              </tr>
            </thead>
            <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
              {paginatedEntries.map((entry, idx) => (
                <EntryRow
                  key={entry.id} entry={entry} serialNo={(page - 1) * pageSize + idx + 1}
                  canEdit={canEdit} isAdmin={isAdmin}
                  onEdit={e => { setEditEntry(e); setEditOpen(true); }}
                  onDelete={e => { setDeleteEntry(e); setDeleteOpen(true); }}
                  onShare={e => { setShareEntry(e); setShareOpen(true); }}
                  onDetail={e => { setDetailEntry(e); setDetailOpen(true); }}
                  isDark={isDark} selected={selectedIds.has(entry.id)} onSelect={toggleSelect}
                />
              ))}
            </motion.tbody>
          </table>
        </motion.div>
      )}

      {/* ── Pagination ── */}
      <Pagination total={entries.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} isDark={isDark} />

      {/* ── Modals ── */}
      <DetailModal open={detailOpen} onClose={() => setDetailOpen(false)} entry={detailEntry} isDark={isDark} />
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} entry={editEntry} isDark={isDark}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['passwords'] })} />
      <DeleteConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} entry={deleteEntry} isDark={isDark}
        onConfirm={() => setDeleteOpen(false)} />
      <WhatsAppShareModal open={shareOpen} onClose={() => setShareOpen(false)} entry={shareEntry} isDark={isDark} />
      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} isDark={isDark}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['passwords'] })} />
    </motion.div>
  );
}
