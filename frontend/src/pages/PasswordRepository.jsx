import React, { useState, useMemo, useCallback } from 'react';
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
  MessageCircle, Phone, Send,
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

const springSnap = { type: 'spring', stiffness: 500, damping: 28 };
const springMed  = { type: 'spring', stiffness: 340, damping: 24 };

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

// ── Animations ────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ── WhatsApp SVG icon (inline, no external dep) ───────────────────────────────
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

// ── WhatsApp Share Modal ──────────────────────────────────────────────────────
function WhatsAppShareModal({ open, onClose, entry, isDark }) {
  const [recipientType, setRecipientType] = useState('');
  const [customPhone,   setCustomPhone]   = useState('');
  const [password,      setPassword]      = useState('');
  const [loadingPw,     setLoadingPw]     = useState(false);
  const [includePass,   setIncludePass]   = useState(false);
  const [customMsg,     setCustomMsg]     = useState('');

  // Fetch linked client contacts
  const { data: clientData } = useQuery({
    queryKey: ['client-contacts', entry?.client_id],
    queryFn:  () => api.get(`/clients/${entry.client_id}`).then(r => r.data),
    enabled:  open && !!entry?.client_id,
  });

  // Build recipient list from client data
  const recipients = useMemo(() => {
    const list = [];
    if (clientData?.phone)          list.push({ type: 'company',  label: 'Company',       name: clientData.name          || entry?.client_name || 'Company',  phone: clientData.phone });
    if (clientData?.director_phone) list.push({ type: 'director', label: 'Director',      name: clientData.director_name || 'Director',                        phone: clientData.director_phone });
    if (clientData?.contact_phone)  list.push({ type: 'contact',  label: 'Contact Person',name: clientData.contact_name  || 'Contact Person',                  phone: clientData.contact_phone });
    return list;
  }, [clientData, entry]);

  const selectedRecipient = recipients.find(r => r.type === recipientType);

  // Reveal password on demand for sharing
  const fetchPassword = useCallback(async () => {
    if (!entry?.id || password) return;
    setLoadingPw(true);
    try {
      const res = await api.get(`/passwords/${entry.id}/reveal`);
      setPassword(res.data.password || '');
    } catch {
      toast.error('Could not retrieve password for sharing');
    } finally {
      setLoadingPw(false);
    }
  }, [entry?.id, password]);

  const handleIncludeToggle = async (checked) => {
    setIncludePass(checked);
    if (checked) await fetchPassword();
  };

  // Compose the message
  const buildMessage = useCallback(() => {
    const meta   = PORTAL_META[entry?.portal_type] || PORTAL_META.OTHER;
    const toName = selectedRecipient?.name || 'Sir/Madam';
    const lines  = [];
    lines.push(`Dear ${toName},`);
    lines.push('');
    lines.push(`Please find the login credentials for *${entry?.portal_name || ''}* (${meta.fullName}):`);
    if (entry?.url)                      lines.push(`🌐 URL: ${entry.url}`);
    if (entry?.username)                 lines.push(`👤 Username: ${entry.username}`);
    if (includePass && password)         lines.push(`🔑 Password: ${password}`);
    if (entry?.notes)                    lines.push(`📝 Note: ${entry.notes}`);
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
    const e164   = digits.startsWith('91') ? digits : `91${digits}`;
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

        {/* Header */}
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #075E54 0%, #25D366 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <WAIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white font-bold text-base">Share via WhatsApp</DialogTitle>
                <DialogDescription className="text-white/60 text-xs">
                  {entry?.portal_name}{entry?.client_name ? ` · ${entry.client_name}` : ''}
                </DialogDescription>
              </div>
            </div>
            <button onClick={handleClose}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">

          {/* ── Recipient selector ── */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Send To</Label>

            {recipients.length > 0 && (
              <div className="space-y-2">
                {recipients.map(r => (
                  <motion.button
                    key={r.type}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setRecipientType(r.type); setCustomPhone(''); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      recipientType === r.type
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                        : isDark
                          ? 'border-slate-700 bg-slate-700/50 hover:border-slate-600'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      recipientType === r.type ? 'bg-green-400' : isDark ? 'bg-slate-600' : 'bg-slate-200'
                    }`}>
                      {r.type === 'company'  && <Building2 className={`h-4 w-4 ${recipientType === r.type ? 'text-white' : 'text-slate-500'}`} />}
                      {r.type === 'director' && <UserIcon   className={`h-4 w-4 ${recipientType === r.type ? 'text-white' : 'text-slate-500'}`} />}
                      {r.type === 'contact'  && <Phone      className={`h-4 w-4 ${recipientType === r.type ? 'text-white' : 'text-slate-500'}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.label}</p>
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{r.name}</p>
                      <p className="text-xs text-green-600 font-mono">{r.phone}</p>
                    </div>
                    {recipientType === r.type && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  </motion.button>
                ))}

                {/* Divider */}
                <div className="flex items-center gap-2 py-1">
                  <div className={`flex-1 h-px ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>or enter manually</span>
                  <div className={`flex-1 h-px ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                </div>
              </div>
            )}

            {recipients.length === 0 && (
              <div className={`p-3 rounded-xl text-xs mb-2 ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                {entry?.client_id
                  ? 'No phone contacts found for this client. Enter a number below.'
                  : 'No client linked. Enter a WhatsApp number below.'}
              </div>
            )}

            {/* Manual phone input */}
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold select-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>+91</span>
              <Input
                className={`pl-10 rounded-xl h-10 font-mono ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white'} ${
                  !recipientType && customPhone ? 'border-green-400 ring-1 ring-green-300' : ''
                }`}
                placeholder="10-digit mobile number"
                value={customPhone}
                onChange={e => { setCustomPhone(e.target.value); setRecipientType(''); }}
              />
            </div>
          </div>

          {/* ── Include password toggle ── */}
          <div className={`flex items-center justify-between p-3.5 rounded-xl border ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${includePass ? 'bg-amber-100' : isDark ? 'bg-slate-600' : 'bg-slate-200'}`}>
                <KeyRound className={`h-4 w-4 ${includePass ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Include Password</p>
                <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Reveals & embeds actual password in message</p>
              </div>
            </div>
            <button
              onClick={() => handleIncludeToggle(!includePass)}
              disabled={loadingPw}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${includePass ? 'bg-amber-400' : isDark ? 'bg-slate-600' : 'bg-slate-300'}`}
            >
              <motion.div
                animate={{ x: includePass ? 20 : 2 }}
                transition={springSnap}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
              />
              {loadingPw && <RefreshCw className="absolute inset-0 m-auto h-3 w-3 text-white animate-spin" />}
            </button>
          </div>

          {includePass && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? 'bg-amber-900/20 border border-amber-800/40 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              Sending passwords over WhatsApp is not fully secure. Only share with trusted recipients on encrypted chats.
            </motion.div>
          )}

          {/* ── Custom note ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Additional Note <span className="normal-case font-normal text-slate-400">(optional)</span>
            </Label>
            <Textarea
              className={`rounded-xl resize-none text-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-500' : ''}`}
              rows={2}
              placeholder="e.g. Please change the password after first login."
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
            />
          </div>

          {/* ── Message preview ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Message Preview</Label>
            <div
              className="rounded-2xl p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap border"
              style={{
                background:  isDark ? '#0d1f0d' : '#e9fbe9',
                borderColor: isDark ? '#25D36625' : '#25D36635',
                color:       isDark ? '#86efac'  : '#14532d',
              }}
            >
              {buildMessage()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 flex items-center gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <Button variant="ghost" className="rounded-xl" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!phoneReady}
            onClick={handleSend}
            className="rounded-xl font-bold flex-1 text-white gap-2"
            style={{ background: phoneReady ? 'linear-gradient(135deg, #075E54, #25D366)' : undefined }}
          >
            <WAIcon className="h-4 w-4 text-white" />
            Open WhatsApp Web
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Reveal Password component ─────────────────────────────────────────────────
function RevealPassword({ entryId, isDark }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);

  const handleReveal = async () => {
    if (revealed) { setRevealed(false); setPassword(''); return; }
    setLoading(true);
    try {
      const res = await api.get(`/passwords/${entryId}/reveal`);
      setPassword(res.data.password || '');
      setRevealed(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Cannot reveal password');
    } finally { setLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 font-mono text-sm px-2.5 py-1 rounded-lg ${
        isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50 text-slate-800'
      } border ${isDark ? 'border-slate-600' : 'border-slate-200'} min-w-0 overflow-hidden text-ellipsis whitespace-nowrap`}>
        {revealed ? password : <MaskedPassword />}
      </div>
      <motion.button whileTap={{ scale: 0.9 }} onClick={handleReveal} disabled={loading}
        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
        title={revealed ? 'Hide' : 'Reveal'}>
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </motion.button>
      {revealed && (
        <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springSnap}
          whileTap={{ scale: 0.9 }} onClick={handleCopy}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
            copied ? 'bg-emerald-100 text-emerald-600' : isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
          }`} title="Copy">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </motion.button>
      )}
    </div>
  );
}

// ── Password Entry Card ───────────────────────────────────────────────────────
function EntryCard({ entry, canEdit, isAdmin, onEdit, onDelete, onShare, isDark }) {
  const meta = PORTAL_META[entry.portal_type] || PORTAL_META.OTHER;
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      variants={itemVariants}
      layout
      whileHover={{ y: -4, transition: springMed }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`relative rounded-2xl border overflow-hidden transition-all duration-300 hover:shadow-xl ${
        isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Colour accent bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${meta.color}, ${meta.color}88)` }} />

      {/* Hover action buttons */}
      <AnimatePresence>
        {showActions && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute top-3 right-3 flex items-center gap-1 z-10">
            {/* WhatsApp share */}
            <button onClick={() => onShare(entry)}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'bg-green-900/60 text-green-400 hover:bg-green-800' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
              title="Share via WhatsApp">
              <WAIcon className="h-3.5 w-3.5" />
            </button>
            {canEdit && (
              <button onClick={() => onEdit(entry)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'bg-blue-900/60 text-blue-400 hover:bg-blue-800' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                title="Edit">
                <Edit2 className="h-3.5 w-3.5" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => onDelete(entry)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'bg-red-900/60 text-red-400 hover:bg-red-800' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: meta.bg }}>
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h3 className={`font-bold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{entry.portal_name}</h3>
            <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{meta.fullName}</p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <PortalBadge type={entry.portal_type} />
          <DeptBadge dept={entry.department} />
          {entry.client_name && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: `${COLORS.emeraldGreen}12`, color: COLORS.emeraldGreen, border: `1px solid ${COLORS.emeraldGreen}30` }}>
              <Building2 className="h-2.5 w-2.5" />{entry.client_name}
            </span>
          )}
        </div>

        {/* Username */}
        {entry.username && (
          <div className="mb-3">
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Username / Login ID</p>
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
          <div className={`mt-3 pt-3 border-t text-xs ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
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

        {/* WhatsApp quick-share button at bottom of card */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onShare(entry)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all"
          style={{
            background:  isDark ? 'rgba(37,211,102,0.08)' : 'rgba(37,211,102,0.07)',
            color:       COLORS.whatsapp,
            border:      `1px solid ${COLORS.whatsapp}28`,
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
  portal_name:    '',
  portal_type:    'OTHER',
  url:            '',
  username:       '',
  password_plain: '',
  department:     'OTHER',
  client_name:    '',
  client_id:      '',
  notes:          '',
  tags:           [],
};

function EntryModal({ open, onClose, existing, isDark, onSave, loading }) {
  const [form, setForm]         = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);

  React.useEffect(() => {
    if (existing) {
      setForm({
        portal_name:    existing.portal_name    || '',
        portal_type:    existing.portal_type    || 'OTHER',
        url:            existing.url            || '',
        username:       existing.username       || '',
        password_plain: '',
        department:     existing.department     || 'OTHER',
        client_name:    existing.client_name    || '',
        client_id:      existing.client_id      || '',
        notes:          existing.notes          || '',
        tags:           existing.tags           || [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowPass(false);
  }, [existing, open]);

  const handleChange = (field, value) => setForm(p => ({ ...p, [field]: value }));
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

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Name *</Label>
            <Input className={inputClass} placeholder="e.g. Client XYZ GST Login"
              value={form.portal_name} onChange={e => handleChange('portal_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portal Type</Label>
              <Select value={form.portal_type} onValueChange={v => handleChange('portal_type', v)}>
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
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Client Name (optional)</Label>
            <Input className={inputClass} placeholder="Associated client company"
              value={form.client_name} onChange={e => handleChange('client_name', e.target.value)} />
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
              Passwords are encrypted using AES-128 before being stored. They are never returned in list views — only when explicitly revealed.
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
  const { user }  = useAuth();
  const isDark    = useDark();
  const qc        = useQueryClient();

  const isAdmin = user?.role === 'admin';
  const perms   = (typeof user?.permissions === 'object' && user?.permissions) || {};
  const canView = isAdmin || !!perms.can_view_passwords;
  const canEdit = isAdmin || !!perms.can_edit_passwords;

  const [search,       setSearch]       = useState('');
  const [filterDept,   setFilterDept]   = useState('ALL');
  const [filterType,   setFilterType]   = useState('ALL');
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editEntry,    setEditEntry]    = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [shareTarget,  setShareTarget]  = useState(null);  // ← WhatsApp share target
  const [saving,       setSaving]       = useState(false);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['passwords', filterDept, filterType, search],
    queryFn: async () => {
      const params = {};
      if (filterDept !== 'ALL') params.department  = filterDept;
      if (filterType !== 'ALL') params.portal_type = filterType;
      if (search.trim())        params.search      = search.trim();
      const res = await api.get('/passwords', { params });
      return res.data || [];
    },
    enabled: canView,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['passwords-stats'],
    queryFn:  () => api.get('/passwords/admin/stats').then(r => r.data),
    enabled:  isAdmin,
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

  const handleEdit   = (entry) => { setEditEntry(entry); setModalOpen(true); };
  const handleDelete = (entry) => setDeleteTarget(entry);
  const handleShare  = (entry) => setShareTarget(entry);
  const handleAddNew = ()      => { setEditEntry(null); setModalOpen(true); };

  // ── Counts — MUST stay above the !canView early return ─────────────────────
  const deptCounts = useMemo(() => {
    const counts = { ALL: entries.length };
    entries.forEach(e => { counts[e.department] = (counts[e.department] || 0) + 1; });
    return counts;
  }, [entries]);

  const typeCounts = useMemo(() => {
    const counts = {};
    entries.forEach(e => { counts[e.portal_type] = (counts[e.portal_type] || 0) + 1; });
    return counts;
  }, [entries]);

  // ── Access guard ─────────────────────────────────────────────────────────────
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
                <Button onClick={handleAddNew} className="rounded-xl font-bold h-9 text-sm gap-2 text-white" style={{ background: COLORS.emeraldGreen }}>
                  <Plus className="h-4 w-4" /> Add Credential
                </Button>
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
        {(filterDept !== 'ALL' || filterType !== 'ALL' || search) && (
          <Button variant="ghost" className="rounded-xl h-10 px-3 text-xs"
            onClick={() => { setFilterDept('ALL'); setFilterType('ALL'); setSearch(''); }}>
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
          className={`text-center py-20 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700 border-dashed' : 'bg-white border-slate-200 border-dashed'}`}>
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="h-8 w-8 text-slate-300 dark:text-slate-500" />
          </div>
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
