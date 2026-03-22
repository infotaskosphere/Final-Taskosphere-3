import Papa from 'papaparse/papaparse.js';
import { useDark } from '@/hooks/useDark';
import { Loader2 } from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useLocation, useNavigate } from "react-router-dom";
import {
  Plus, Edit, Trash2, Mail, Cake, X, UserPlus,
  FileText, Calendar, Search, Users,
  Briefcase, BarChart3, Archive, MessageCircle, Trash,
  CheckCircle2, AlertCircle, Building2, ChevronDown, ChevronUp,
  LayoutGrid, List, Phone, MapPin, User, FileCheck, Share2,
  Send, Copy, ExternalLink, CheckSquare, Square, MinusSquare,
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import * as XLSX from 'xlsx';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, FixedSizeList } from 'react-window';

const handleCsvUpload = (e) => {
  const file = e.target.files[0];
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      console.log(results.data);
    }
  });
};

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
  pvt_ltd:     { label: 'Pvt Ltd',     bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#2563EB', accent: 'from-blue-600 to-blue-800',     strip: '#2563EB' },
  llp:         { label: 'LLP',         bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED', accent: 'from-violet-600 to-violet-800',  strip: '#7C3AED' },
  partnership: { label: 'Partnership', bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: '#D97706', accent: 'from-amber-500 to-amber-700',    strip: '#D97706' },
  huf:         { label: 'HUF',         bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4', dot: '#0D9488', accent: 'from-teal-600 to-teal-800',      strip: '#0D9488' },
  trust:       { label: 'Trust',       bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3', dot: '#E11D48', accent: 'from-rose-600 to-rose-800',      strip: '#E11D48' },
  proprietor:  { label: 'Proprietor',  bg: '#F8FAFC', text: '#475569', border: '#CBD5E1', dot: '#64748B', accent: 'from-slate-500 to-slate-700',    strip: '#64748B' },
  other:       { label: 'Other',       bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD', dot: '#0284C7', accent: 'from-sky-600 to-sky-800',        strip: '#0284C7' },
};

const TYPE_BADGE = {
  pvt_ltd:     'bg-blue-50 text-blue-700 border-blue-200',
  llp:         'bg-violet-50 text-violet-700 border-violet-200',
  partnership: 'bg-amber-50 text-amber-700 border-amber-200',
  huf:         'bg-teal-50 text-teal-700 border-teal-200',
  trust:       'bg-rose-50 text-rose-700 border-rose-200',
  proprietor:  'bg-slate-50 text-slate-600 border-slate-200',
  other:       'bg-sky-50 text-sky-700 border-sky-200',
};

const AVATAR_GRADIENTS = [
  ['#0D3B66', '#1F6FB2'], ['#065f46', '#059669'], ['#7c2d12', '#ea580c'],
  ['#4c1d95', '#7c3aed'], ['#1e3a5f', '#2563eb'], ['#831843', '#db2777'],
  ['#134e4a', '#0d9488'], ['#1e1b4b', '#4f46e5'],
];
const getAvatarGradient = (name = '') => {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADIENTS[idx][0]}, ${AVATAR_GRADIENTS[idx][1]})`;
};

const SectionHeading = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-6">
    <div
      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm"
      style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
    >
      {icon}
    </div>
    <div>
      <h3 className={`text-base font-semibold leading-tight ${isDark?"text-slate-100":"text-slate-800"}`}>{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const TypePill = ({ type, customLabel }) => {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.proprietor;
  const displayLabel = type === 'other' && customLabel ? customLabel : cfg.label;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide whitespace-nowrap flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {displayLabel}
    </span>
  );
};

const EMPTY_ASSIGNMENT = { user_id: '', services: [] };

// ── BULK MESSAGE MODAL ──────────────────────────────────────────────────────
const BulkMessageModal = ({ open, onClose, mode, filteredClients }) => {
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(filteredClients.map(c => c.id)));
      setMessage('');
      setClientSearch('');
      setCopied(false);
      setExportDone(false);
    }
  }, [open, filteredClients]);

  const displayedClients = useMemo(() => {
    if (!clientSearch.trim()) return filteredClients;
    const q = clientSearch.toLowerCase();
    return filteredClients.filter(c =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  }, [filteredClients, clientSearch]);

  const selectedClients = useMemo(() =>
    filteredClients.filter(c => selectedIds.has(c.id)),
    [filteredClients, selectedIds]
  );

  const toggleClient = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map(c => c.id)));
    }
  };

  const allSelected = selectedIds.size === filteredClients.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredClients.length;

  const phoneCount = selectedClients.filter(c => c.phone).length;
  const emailCount = selectedClients.filter(c => c.email).length;

  const handleExportBroadcast = () => {
    if (selectedClients.length === 0) { toast.error('Select at least one client first'); return; }
    const withPhone = selectedClients.filter(c => c.phone);
    if (withPhone.length === 0) { toast.error('No selected clients have a phone number'); return; }

    const rows = [
      ['Name', 'Phone', 'WhatsApp Number (91XXXXXXXXXX)', 'Message'],
      ...withPhone.map(c => {
        const phone = c.phone.replace(/\D/g, '');
        const wa = phone.length === 10 ? `91${phone}` : phone;
        const personalised = message.trim()
          ? message.trim().replace(/\{name\}/gi, c.company_name)
          : '';
        return [c.company_name, c.phone, wa, personalised];
      }),
    ];

    const csvContent = rows.map(r =>
      r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `whatsapp_broadcast_${format(new Date(), 'dd-MMM-yyyy')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const phoneList = withPhone.map(c => {
      const p = c.phone.replace(/\D/g, '');
      return p.length === 10 ? `91${p}` : p;
    }).join('\n');

    navigator.clipboard.writeText(phoneList).catch(() => {});

    setExportDone(true);
    toast.success(
      `📥 CSV downloaded + ${withPhone.length} numbers copied to clipboard!`,
      { description: 'Open WhatsApp Business → New Broadcast → paste numbers' }
    );
    setTimeout(() => setExportDone(false), 3000);
  };

  const handleWhatsApp = async () => {
    if (!message.trim()) { toast.error('Please write a message first'); return; }
    if (selectedClients.length === 0) { toast.error('Please select at least one client'); return; }
    try {
      await navigator.clipboard.writeText(message.trim());
      setCopied(true);
      toast.success('Message copied! Opening WhatsApp Web…');
      setTimeout(() => { window.open('https://web.whatsapp.com', '_blank'); setCopied(false); }, 800);
    } catch {
      toast.error('Could not copy to clipboard. Please copy manually.');
    }
  };

  const handleEmail = () => {
    if (!message.trim()) { toast.error('Please write a message first'); return; }
    if (selectedClients.length === 0) { toast.error('Please select at least one client'); return; }
    const bccEmails = selectedClients.map(c => c.email).filter(Boolean).join(',');
    if (!bccEmails) { toast.error('No email addresses found for selected clients'); return; }
    const lines = message.trim().split('\n');
    const mailto = `mailto:?bcc=${encodeURIComponent(bccEmails)}&subject=${encodeURIComponent(lines[0].substring(0, 80))}&body=${encodeURIComponent(message.trim())}`;
    window.location.href = mailto;
    toast.success(`Opening mail client with ${emailCount} recipients in BCC`);
  };

  const isWhatsApp = mode === 'whatsapp';
  const accentColor = isWhatsApp ? '#25D366' : '#1F6FB2';
  const accentGrad = isWhatsApp
    ? 'linear-gradient(135deg, #128C7E, #25D366)'
    : 'linear-gradient(135deg, #0D3B66, #1F6FB2)';
  const relevantCount = isWhatsApp ? phoneCount : emailCount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
        <DialogTitle className="sr-only">{isWhatsApp ? 'Bulk WhatsApp' : 'Bulk Email'}</DialogTitle>
        <DialogDescription className="sr-only">Draft and send bulk messages to selected clients</DialogDescription>

        <div className="flex-shrink-0 px-7 py-5 border-b border-slate-100"
          style={{ background: isWhatsApp ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0" style={{ background: accentGrad }}>
              {isWhatsApp ? <MessageCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDark?"text-slate-100":"text-slate-900"}`}>
                {isWhatsApp ? 'Bulk WhatsApp Message' : 'Bulk Email'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isWhatsApp
                  ? 'Draft → Export for Broadcast (free) or Copy & send one-by-one via WhatsApp Web'
                  : 'Draft your message → opens in your default mail client with all recipients in BCC'}
              </p>
            </div>
            <div className="ml-auto flex-shrink-0">
              <span className="text-xs font-bold px-3 py-1.5 rounded-full border"
                style={isWhatsApp
                  ? { background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }
                  : { background: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }}>
                {relevantCount} {isWhatsApp ? 'with phone' : 'with email'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className={`w-72 flex-shrink-0 border-r flex flex-col ${isDark?"border-slate-700 bg-slate-800/60":"border-slate-100 bg-slate-50/40"}`}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b flex-shrink-0 ${isDark?"border-slate-700 bg-slate-800":"border-slate-100 bg-white"}`}>
              <button onClick={toggleAll} className="flex items-center gap-2 flex-1 text-left">
                <span className="flex-shrink-0" style={{ color: accentColor }}>
                  {allSelected
                    ? <CheckSquare className="h-4 w-4" />
                    : someSelected
                    ? <MinusSquare className="h-4 w-4" />
                    : <Square className="h-4 w-4 text-slate-300" />}
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {allSelected ? 'Deselect all' : 'Select all'}
                </span>
              </button>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                {selectedIds.size}/{filteredClients.length}
              </span>
            </div>

            <div className="px-3 py-2 border-b border-slate-100 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  className={`w-full pl-8 pr-3 h-8 text-xs rounded-lg focus:outline-none focus:border-blue-300 transition-colors ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}
                  placeholder="Filter clients…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {displayedClients.map(client => {
                const isSelected = selectedIds.has(client.id);
                const hasContact = isWhatsApp ? !!client.phone : !!client.email;
                return (
                  <div
                    key={client.id}
                    onClick={() => toggleClient(client.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b transition-all ${isDark?'border-slate-700':' border-slate-50'} ${isSelected ? (isDark?'bg-slate-700':'bg-white') : (isDark?'hover:bg-slate-700/60':'hover:bg-white/60')} ${!hasContact ? 'opacity-40' : ''}`}
                  >
                    <span className="flex-shrink-0" style={{ color: isSelected ? accentColor : '#cbd5e1' }}>
                      {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </span>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ background: getAvatarGradient(client.company_name) }}>
                      {client.company_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isDark?"text-slate-100":"text-slate-800"}`}>{client.company_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {isWhatsApp ? (client.phone || '— no phone') : (client.email || '— no email')}
                      </p>
                    </div>
                    {!hasContact && (
                      <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                        {isWhatsApp ? 'No phone' : 'No email'}
                      </span>
                    )}
                  </div>
                );
              })}
              {displayedClients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Search className="h-6 w-6 mb-2 opacity-40" />
                  <p className="text-xs">No clients match</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                  {isWhatsApp ? 'WhatsApp Message' : 'Email Message'}
                </label>
                <textarea
                  className={`w-full min-h-[180px] border rounded-xl text-sm p-4 resize-none outline-none transition-all leading-relaxed ${isDark?"bg-slate-700 border-slate-600 text-slate-100 focus:border-blue-400 focus:bg-slate-700":"bg-slate-50 border-slate-200 focus:border-blue-300 focus:bg-white focus:ring-1 focus:ring-blue-100"}`}
                  placeholder={isWhatsApp
                    ? "Dear {name},\n\nThis is a reminder about your upcoming GST filing due date…\n\nRegards,\nManthan Desai & Associates"
                    : "Subject: Important Update\n\nDear Client,\n\nWe wanted to update you regarding…\n\nRegards,\nManthan Desai & Associates"}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[10px] text-slate-400">
                    {isWhatsApp ? 'Use {name} → auto-replaced with company name in the export' : 'First line becomes the email subject'}
                  </p>
                  <span className={`text-[10px] ${isDark?"text-slate-500":"text-slate-400"}`}>{message.length} chars</span>
                </div>
              </div>

              {isWhatsApp && (
                <div className="rounded-2xl border-2 border-dashed p-5 space-y-3"
                  style={{ borderColor: '#86efac', background: 'linear-gradient(135deg, #f0fdf4, #f7fffe)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold shadow-sm"
                      style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }}>
                      📤
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-900">Export for WhatsApp Broadcast</p>
                      <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                        Downloads a <strong>CSV</strong> with all phone numbers + your message (with {'{name}'} replaced).
                        Also <strong>copies numbers to clipboard</strong> in WhatsApp format (91XXXXXXXXXX).
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/70 rounded-xl p-4 border border-emerald-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2.5">
                      How to use on WhatsApp Business App (Free)
                    </p>
                    <div className="space-y-2">
                      {[
                        { step: '1', text: 'Click "Export & Copy Numbers" below — CSV downloads, numbers go to clipboard' },
                        { step: '2', text: 'Open WhatsApp Business app on your phone' },
                        { step: '3', text: 'Tap ⋮ Menu → New Broadcast → Add recipients by pasting or searching saved contacts' },
                        { step: '4', text: 'Type or paste your message and tap Send — each client gets it as a personal message' },
                      ].map(({ step, text }) => (
                        <div key={step} className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                            style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }}>
                            {step}
                          </span>
                          <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <span className="text-amber-500 text-xs flex-shrink-0 mt-0.5">⚠</span>
                      <p className="text-[10px] text-amber-700 leading-relaxed">
                        Contacts must have <strong>your number saved</strong> in their phone to receive broadcast messages.
                        Max <strong>256 per broadcast</strong> — create multiple lists if needed.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleExportBroadcast}
                    disabled={selectedClients.filter(c => c.phone).length === 0}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-white text-sm font-bold shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: exportDone ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #128C7E, #25D366)' }}
                  >
                    {exportDone
                      ? <><CheckCircle2 className="h-4 w-4" /> Exported! Numbers copied to clipboard</>
                      : <><FileText className="h-4 w-4" /> Export &amp; Copy Numbers ({selectedClients.filter(c => c.phone).length} clients)</>
                    }
                  </button>
                </div>
              )}

              {isWhatsApp && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">or send one-by-one</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              )}

              {selectedClients.length > 0 && (
                <div className="rounded-xl border p-4"
                  style={isWhatsApp ? { background: '#f0fdf4', borderColor: '#bbf7d0' } : { background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: isWhatsApp ? '#166534' : '#1e40af' }}>
                    {isWhatsApp ? '📱 Selected clients' : '📧 Ready to email'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClients.slice(0, 8).map(c => (
                      <span key={c.id} className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${isDark?"bg-slate-700":"bg-white"}`}
                        style={isWhatsApp ? { borderColor: '#86efac', color: '#166534' } : { borderColor: '#93c5fd', color: '#1e40af' }}>
                        {c.company_name}
                      </span>
                    ))}
                    {selectedClients.length > 8 && (
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${isDark?"bg-slate-700 border-slate-600 text-slate-400":"bg-white border-slate-200 text-slate-500"}`}>
                        +{selectedClients.length - 8} more
                      </span>
                    )}
                  </div>
                  {isWhatsApp && phoneCount < selectedClients.length && (
                    <p className="text-[10px] mt-2" style={{ color: '#b45309' }}>
                      ⚠ {selectedClients.length - phoneCount} client(s) have no phone and will be skipped
                    </p>
                  )}
                  {!isWhatsApp && emailCount < selectedClients.length && (
                    <p className="text-[10px] mt-2" style={{ color: '#b45309' }}>
                      ⚠ {selectedClients.length - emailCount} client(s) have no email and will be skipped
                    </p>
                  )}
                </div>
              )}

              {!isWhatsApp && (
                <div className={`border rounded-xl p-4 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50 border-slate-100"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">How it works</p>
                  <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside">
                    <li>Write your message above (first line = subject)</li>
                    <li>Click <strong className="text-slate-700">"Open in Mail Client"</strong></li>
                    <li>Your default mail app opens with all recipients in BCC</li>
                    <li>Review and send from your mail client</li>
                  </ol>
                </div>
              )}
            </div>

            <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t ${isDark?"border-slate-700 bg-slate-800":"border-slate-100 bg-white"}`}>
              <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-4 text-sm rounded-xl text-slate-500">
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {selectedClients.length === 0 && (
                  <span className="text-xs text-amber-600 font-medium">← Select at least one client</span>
                )}
                {isWhatsApp ? (
                  <Button
                    type="button"
                    disabled={!message.trim() || selectedClients.length === 0}
                    onClick={handleWhatsApp}
                    className="h-10 px-5 text-sm rounded-xl text-white font-semibold gap-2 shadow-sm disabled:opacity-50"
                    style={{ background: !message.trim() || selectedClients.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #128C7E, #25D366)' }}
                  >
                    {copied ? <><CheckCircle2 className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy &amp; Open WhatsApp Web</>}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={!message.trim() || selectedClients.length === 0}
                    onClick={handleEmail}
                    className="h-10 px-6 text-sm rounded-xl text-white font-semibold gap-2 shadow-sm disabled:opacity-50"
                    style={{ background: !message.trim() || selectedClients.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                  >
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
};

export default function Clients() {
  const { user, hasPermission } = useAuth();
  const isDark = useDark();
  const canViewAllClients = hasPermission("can_view_all_clients");
  const canDeleteData = hasPermission("can_delete_data");
  const canAssignClients = hasPermission("can_assign_clients");
  const [clients, setClients] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [otherService, setOtherService] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mdsPreviewOpen, setMdsPreviewOpen] = useState(false);
  const [mdsPreviewLoading, setMdsPreviewLoading] = useState(false);
  const [mdsData, setMdsData] = useState(null);
  const [mdsForm, setMdsForm] = useState(null);
  const [mdsRawInfoOpen, setMdsRawInfoOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [clientTypeFilter, setClientTypeFilter] = useState('all');
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  const [viewMode, setViewMode] = useState('board');
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [bulkMsgOpen, setBulkMsgOpen] = useState(false);
  const [bulkMsgMode, setBulkMsgMode] = useState('whatsapp');

  // ── REFERRER STATE ──────────────────────────────────────────────────────
  const [savedReferrers, setSavedReferrers] = useState([]);
  const [referrerInput, setReferrerInput] = useState('');
  const [referrerSelectValue, setReferrerSelectValue] = useState('');

  const openBulkMsg = (mode) => {
    setBulkMsgMode(mode);
    setBulkMsgOpen(true);
  };

  const [formData, setFormData] = useState({
    company_name: '',
    client_type: 'proprietor',
    client_type_other: '',
    contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
    email: '',
    phone: '',
    birthday: '',
    address: '',
    city: '',
    state: '',
    services: [],
    dsc_details: [],
    assignments: [{ ...EMPTY_ASSIGNMENT }],
    notes: '',
    status: 'active',
    referred_by: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [contactErrors, setContactErrors] = useState([]);

  const safeDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return null;
    const date = new Date(dateStr.trim());
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  };

  // ── FETCH REFERRERS ─────────────────────────────────────────────────────
  // FIX: The backend returns an array of objects ({ id, name, created_by, ... }).
  // We extract only the `name` string so that savedReferrers is always string[],
  // preventing React error #31 ("Objects are not valid as a React child") when
  // the names are rendered inside <option> elements.
  const fetchReferrers = async () => {
    try {
      const response = await api.get('/referrers');
      const raw = response.data || [];
      const names = raw.map(r => (typeof r === 'string' ? r : r.name)).filter(Boolean);
      setSavedReferrers(names);
    } catch {
      // Fallback: load from localStorage if backend endpoint not yet available
      try {
        const stored = JSON.parse(localStorage.getItem('taskosphere_referrers') || '[]');
        const names = stored.map(r => (typeof r === 'string' ? r : r.name)).filter(Boolean);
        setSavedReferrers(names);
      } catch {
        setSavedReferrers([]);
      }
    }
  };

  // ── SAVE REFERRER ───────────────────────────────────────────────────────
  const saveReferrer = async (name) => {
    const trimmed = name?.trim();
    if (!trimmed || savedReferrers.includes(trimmed)) return trimmed;
    const updated = [...savedReferrers, trimmed];
    setSavedReferrers(updated);
    try {
      await api.post('/referrers', { name: trimmed });
    } catch {
      // Fallback: persist in localStorage
      localStorage.setItem('taskosphere_referrers', JSON.stringify(updated));
    }
    return trimmed;
  };

  useEffect(() => {
    fetchClients();
    fetchUsers();
    fetchReferrers();
    const params = new URLSearchParams(location.search);
    if (params.get("openAddClient") === "true") {
      setDialogOpen(true);
    }
  }, [location]);

  // Sync referrerSelectValue when formData.referred_by changes (e.g. on edit)
  useEffect(() => {
    const val = formData.referred_by;
    if (!val || val === '') {
      setReferrerSelectValue('');
      setReferrerInput('');
    } else if (val === 'Our Client') {
      setReferrerSelectValue('Our Client');
      setReferrerInput('');
    } else if (savedReferrers.includes(val)) {
      setReferrerSelectValue(val);
      setReferrerInput('');
    } else {
      // It's a custom value not yet in the list — treat as "other"
      setReferrerSelectValue('__other__');
      setReferrerInput(val);
    }
  }, [formData.referred_by, savedReferrers]);

  const fetchClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data || []);
    } catch (error) {
      toast.error('Failed to fetch clients');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone?.replace(/\D/g, '') || '';
    const message = encodeURIComponent(`Hello ${name}, this is Manthan Desai's office regarding your services.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter(c => (c?.status || 'active') === 'active').length;
    const serviceCounts = {};
    clients.forEach(c => {
      if ((c?.status || 'active') === 'active' && c?.services) {
        c.services.forEach(s => {
          const name = s?.startsWith('Other:') ? 'Other' : s;
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
      }
    });
    return { totalClients, activeClients, serviceCounts };
  }, [clients]);

  const todayReminders = useMemo(() => {
    const today = startOfDay(new Date());
    return clients.filter(c => {
      if (c?.birthday) {
        const anniv = new Date(c.birthday);
        if (anniv.getMonth() === today.getMonth() && anniv.getDate() === today.getDate()) return true;
      }
      return c?.contact_persons?.some(cp => {
        if (!cp?.birthday) return false;
        const bday = new Date(cp.birthday);
        return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
      }) ?? false;
    });
  }, [clients]);

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch =
        (c?.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c?.phone || '').includes(searchTerm);
      const matchesService = serviceFilter === 'all' ||
        (c?.services ?? []).some(s => (s || '').toLowerCase().includes(serviceFilter.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || (c?.status || 'active') === statusFilter;
      const matchesClientType = clientTypeFilter === 'all' || (c?.client_type || 'proprietor') === clientTypeFilter;

      let matchesAssigned = true;
      if (assignedToFilter !== 'all') {
        const assignments = c?.assignments || [];
        const legacyAssignedTo = c?.assigned_to;
        if (assignments.length > 0) {
          matchesAssigned = assignments.some(a => a.user_id === assignedToFilter);
        } else {
          matchesAssigned = legacyAssignedTo === assignedToFilter;
        }
      }

      return matchesSearch && matchesService && matchesStatus && matchesAssigned && matchesClientType;
    });
  }, [clients, searchTerm, serviceFilter, statusFilter, assignedToFilter, clientTypeFilter]);

  const getClientNumber = (index) => String(index + 1).padStart(3, '0');

  const validateForm = () => {
    const errors = {};
    const cErrors = [];
    if (!formData.company_name?.trim() || formData.company_name.trim().length < 2) {
      errors.company_name = 'Company name must be at least 2 characters';
    }
    const trimmedEmail = formData.email?.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }
    const cleanPhone = formData.phone ? formData.phone.replace(/\D/g, '') : '';
    if (cleanPhone && cleanPhone.length !== 10) {
      errors.phone = 'Phone number must be exactly 10 digits (or leave blank)';
    }
    if (formData.services.length === 0) {
      errors.services = 'At least one service must be selected';
    }
    let hasValidContact = false;
    formData.contact_persons.forEach((cp, idx) => {
      const contactErr = {};
      const trimmedName = cp.name?.trim();
      if (!trimmedName) {
        if (cp.email?.trim() || cp.phone?.trim() || cp.designation?.trim() || cp.birthday || cp.din?.trim()) {
          contactErr.name = 'Contact name is required';
        }
      } else {
        hasValidContact = true;
      }
      if (cp.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cp.email.trim())) {
        contactErr.email = 'Invalid email format';
      }
      const cCleanPhone = cp.phone ? cp.phone.replace(/\D/g, '') : '';
      if (cCleanPhone && cCleanPhone.length !== 10) {
        contactErr.phone = 'Phone must be 10 digits';
      }
      if (Object.keys(contactErr).length > 0) {
        cErrors[idx] = contactErr;
      }
    });
    if (!hasValidContact) {
      errors.contacts = 'At least one contact person with a valid name is required';
    }
    const allEmails = new Set();
    if (trimmedEmail) allEmails.add(trimmedEmail.toLowerCase());
    formData.contact_persons.forEach(cp => {
      if (cp.email?.trim()) allEmails.add(cp.email.trim().toLowerCase());
    });
    if (allEmails.size !== (trimmedEmail ? 1 : 0) + formData.contact_persons.filter(cp => cp.email?.trim()).length) {
      errors.email = (errors.email || '') + ' (duplicate email detected)';
    }
    setFormErrors(errors);
    setContactErrors(cErrors);
    return Object.keys(errors).length === 0 && cErrors.length === 0;
  };

  const downloadTemplate = () => {
    const headers = [
      'company_name', 'client_type', 'client_type_label', 'email', 'phone',
      'birthday', 'address', 'city', 'state', 'referred_by', 'services', 'notes', 'status',
      'contact_name_1', 'contact_designation_1', 'contact_email_1', 'contact_phone_1', 'contact_birthday_1', 'contact_din_1',
      'contact_name_2', 'contact_designation_2', 'contact_email_2', 'contact_phone_2', 'contact_birthday_2', 'contact_din_2',
      'contact_name_3', 'contact_designation_3', 'contact_email_3', 'contact_phone_3', 'contact_birthday_3', 'contact_din_3',
    ];
    const sampleRow = [
      'ABC Pvt Ltd', 'pvt_ltd', '', 'abc@example.com', '9876543210', '2015-04-01',
      '123 MG Road', 'Surat', 'Gujarat', 'John Smith', 'GST,ROC', 'Sample client notes', 'active',
      'Rahul Mehta', 'Director', 'rahul@example.com', '9876500001', '1985-06-15', 'DIN00001234',
      'Priya Shah', 'CFO', 'priya@example.com', '9876500002', '1990-03-22', '',
      '', '', '', '', '', '',
    ];
    const csvContent = headers.join(',') + '\n' + sampleRow.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'client_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setImportLoading(true);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    try {
      const response = await api.post('/clients/import', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(response.data.message || `${response.data.clients_created || 0} clients imported!`);
      fetchClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Import failed');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (excelInputRef.current) excelInputRef.current.value = '';

    setMdsPreviewLoading(true);
    setMdsPreviewOpen(true);
    setMdsData(null);
    setMdsForm(null);

    const formPayload = new FormData();
    formPayload.append('file', file);

    try {
      const response = await api.post('/clients/parse-mds-excel', formPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;

      let address = (data.address || data.registered_address || '').trim();
      let city = (data.city || '').trim();
      let state = (data.state || '').trim();

      if (address && (!city || !state)) {
        const addressParts = address.split(',').map(p => p.trim()).filter(p => p);
        if (addressParts.length > 0) {
          if (!state && addressParts.length >= 2) state = addressParts[addressParts.length - 2] || '';
          if (!city && addressParts.length >= 3) city = addressParts[addressParts.length - 3] || '';
        }
      }

      setMdsData(data);

      const contacts = (data.contact_persons || []).map(cp => ({
        name: cp.name || '', designation: cp.designation || '', email: cp.email || '',
        phone: cp.phone || '', birthday: cp.birthday || '', din: cp.din || '',
      }));
      if (contacts.length === 0) {
        contacts.push({ name: '', designation: '', email: '', phone: '', birthday: '', din: '' });
      }

      setMdsForm({
        company_name: (data.company_name || '').trim(),
        client_type: data.client_type || 'proprietor',
        email: (data.email || '').trim(),
        phone: (data.phone || '').trim(),
        birthday: data.birthday || '',
        address, city, state,
        services: data.services || [],
        notes: '',
        status: data.status_value || 'active',
        contact_persons: contacts,
        referred_by: (data.referred_by || '').trim(),
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to parse Excel file');
      setMdsPreviewOpen(false);
    } finally {
      setMdsPreviewLoading(false);
    }
  };

  const handleMdsConfirm = async (saveDirectly = false) => {
    if (!mdsForm) return;

    if (saveDirectly) {
      setImportLoading(true);
      try {
        const contacts = mdsForm.contact_persons
          .filter(cp => cp.name?.trim())
          .map(cp => ({
            name: cp.name.trim(),
            designation: cp.designation?.trim() || null,
            email: cp.email?.trim() || null,
            phone: cp.phone?.replace(/\D/g, '') || null,
            birthday: cp.birthday ? cp.birthday : null,
            din: cp.din?.trim() || null,
          }));

        const payload = {
          company_name: mdsForm.company_name?.trim() || '',
          client_type: mdsForm.client_type || 'proprietor',
          email: mdsForm.email?.trim() || '',
          phone: mdsForm.phone?.replace(/\D/g, '') || '',
          birthday: mdsForm.birthday || null,
          address: mdsForm.address?.trim() || null,
          city: mdsForm.city?.trim() || null,
          state: mdsForm.state?.trim() || null,
          services: mdsForm.services || [],
          notes: mdsForm.notes?.trim() || null,
          status: mdsForm.status || 'active',
          contact_persons: contacts,
          dsc_details: [], assignments: [], assigned_to: null,
          referred_by: mdsForm.referred_by?.trim() || null,
        };

        await api.post('/clients', payload);
        toast.success(`Client "${mdsForm.company_name}" saved successfully!`);
        fetchClients();
        setMdsPreviewOpen(false);
        setMdsData(null);
        setMdsForm(null);
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to save client');
      } finally {
        setImportLoading(false);
      }
    } else {
      setFormData({
        company_name: mdsForm.company_name || '',
        client_type: mdsForm.client_type || 'proprietor',
        email: mdsForm.email || '',
        phone: mdsForm.phone || '',
        birthday: mdsForm.birthday || '',
        address: mdsForm.address || '',
        city: mdsForm.city || '',
        state: mdsForm.state || '',
        services: mdsForm.services || [],
        notes: mdsForm.notes || '',
        status: mdsForm.status || 'active',
        contact_persons: mdsForm.contact_persons.length > 0
          ? mdsForm.contact_persons
          : [{ name: '', designation: '', email: '', phone: '', birthday: '', din: '' }],
        dsc_details: [],
        assignments: [{ ...EMPTY_ASSIGNMENT }],
        referred_by: mdsForm.referred_by || '',
      });
      setEditingClient(null);
      setFormErrors({});
      setContactErrors([]);
      setMdsPreviewOpen(false);
      setDialogOpen(true);
      toast.info('Form pre-filled from Excel — review and save when ready.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = validateForm();
    if (!isValid) { toast.error('Please fix the highlighted errors before saving'); return; }
    setLoading(true);
    try {
      let finalServices = [...formData.services];
      finalServices = finalServices.filter(s => !s.startsWith("Other:"));
      if (otherService.trim() && formData.services.includes("Other")) {
        finalServices.push(`Other: ${otherService.trim()}`);
      }
      const cleanPhone = formData.phone ? formData.phone.replace(/\D/g, "") : "";
      const cleanedContacts = formData.contact_persons.map(cp => ({
        name: cp.name || "", designation: cp.designation?.trim() || null,
        email: cp.email?.trim() ? cp.email.trim() : null,
        phone: cp.phone ? cp.phone.replace(/\D/g, "") : null,
        birthday: safeDate(cp.birthday), din: cp.din?.trim() || null
      }));
      const cleanedDSC = formData.dsc_details.map(dsc => ({
        certificate_number: dsc.certificate_number?.trim() || "",
        holder_name: dsc.holder_name?.trim() || "",
        issue_date: safeDate(dsc.issue_date), expiry_date: safeDate(dsc.expiry_date),
        notes: dsc.notes?.trim() || null
      }));
      const cleanedAssignments = (formData.assignments || [])
        .filter(a => a.user_id && a.user_id !== 'unassigned')
        .map(a => ({ user_id: a.user_id, services: a.services || [] }));

      // If referred_by is a new "other" value, save it to the referrer list
      const finalReferredBy = formData.referred_by?.trim() || null;
      if (
        finalReferredBy &&
        finalReferredBy !== 'Our Client' &&
        !savedReferrers.includes(finalReferredBy)
      ) {
        await saveReferrer(finalReferredBy);
      }

      const payload = {
        company_name: formData.company_name.trim(),
        client_type: formData.client_type,
        client_type_label: formData.client_type === 'other' ? (formData.client_type_other?.trim() || 'Other') : null,
        email: formData.email?.trim(), phone: cleanPhone,
        birthday: safeDate(formData.birthday),
        address: formData.address?.trim() || null,
        city: formData.city?.trim() || null,
        state: formData.state?.trim() || null,
        services: finalServices,
        notes: formData.notes?.trim() || null,
        assigned_to: cleanedAssignments[0]?.user_id || null,
        assignments: cleanedAssignments,
        status: formData.status, contact_persons: cleanedContacts, dsc_details: cleanedDSC,
        referred_by: finalReferredBy,
      };
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
      } else {
        await api.post("/clients", payload);
      }
      setDialogOpen(false); resetForm(); fetchClients();
      toast.success("Saved successfully!");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Error saving client");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    let assignments = client?.assignments || [];
    if (assignments.length === 0 && client?.assigned_to) {
      assignments = [{ user_id: client.assigned_to, services: [] }];
    }
    if (assignments.length === 0) assignments = [{ ...EMPTY_ASSIGNMENT }];

    setFormData({
      ...client,
      client_type_other: client?.client_type === 'other' ? (client?.client_type_label || '') : '',
      contact_persons: client?.contact_persons?.map(cp => ({
        ...cp, birthday: cp?.birthday ? format(new Date(cp.birthday), 'yyyy-MM-dd') : '', din: cp?.din || ''
      })) || [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      birthday: client?.birthday ? format(new Date(client.birthday), 'yyyy-MM-dd') : '',
      dsc_details: client?.dsc_details?.map(d => ({
        ...d,
        issue_date: d?.issue_date ? format(new Date(d.issue_date), 'yyyy-MM-dd') : '',
        expiry_date: d?.expiry_date ? format(new Date(d.expiry_date), 'yyyy-MM-dd') : '',
      })) || [],
      status: client?.status || 'active',
      assignments,
      referred_by: client?.referred_by || '',
    });
    const other = client?.services?.find(s => s.startsWith('Other: '));
    setOtherService(other ? other.replace('Other: ', '') : '');
    setDialogOpen(true);
    setFormErrors({}); setContactErrors([]);
  };

  const resetForm = () => {
    setFormData({
      company_name: '', client_type: 'proprietor', client_type_other: '',
      contact_persons: [{ name: '', email: '', phone: '', designation: '', birthday: '', din: '' }],
      email: '', phone: '', birthday: '', address: '', city: '', state: '', services: [], dsc_details: [],
      assignments: [{ ...EMPTY_ASSIGNMENT }], notes: '', status: 'active', referred_by: '',
    });
    setOtherService('');
    setEditingClient(null);
    setFormErrors({});
    setContactErrors([]);
    setReferrerInput('');
    setReferrerSelectValue('');
  };

  useEffect(() => {
    if (!dialogOpen) { setFormErrors({}); setContactErrors([]); }
  }, [dialogOpen]);

  const updateContact = (idx, field, val) => {
    setFormData(p => ({
      ...p,
      contact_persons: p.contact_persons.map((c, i) => i === idx ? { ...c, [field]: val } : c)
    }));
    if (contactErrors[idx] && contactErrors[idx][field]) {
      const newCerr = [...contactErrors];
      if (newCerr[idx]) delete newCerr[idx][field];
      if (Object.keys(newCerr[idx] || {}).length === 0) newCerr[idx] = undefined;
      setContactErrors(newCerr);
    }
  };

  const addContact = () => setFormData(p => ({
    ...p, contact_persons: [...p.contact_persons, { name: '', email: '', phone: '', designation: '', birthday: '', din: '' }]
  }));
  const removeContact = (idx) => setFormData(p => ({
    ...p, contact_persons: p.contact_persons.filter((_, i) => i !== idx)
  }));
  const updateDSC = (idx, field, val) => setFormData(p => ({
    ...p, dsc_details: p.dsc_details.map((d, i) => i === idx ? { ...d, [field]: val } : d)
  }));
  const addDSC = () => setFormData(p => ({
    ...p, dsc_details: [...p.dsc_details, { certificate_number: '', holder_name: '', issue_date: '', expiry_date: '', notes: '' }]
  }));
  const removeDSC = (idx) => setFormData(p => ({
    ...p, dsc_details: p.dsc_details.filter((_, i) => i !== idx)
  }));

  const addAssignment = () => setFormData(p => ({
    ...p, assignments: [...(p.assignments || []), { ...EMPTY_ASSIGNMENT }]
  }));
  const removeAssignment = (idx) => setFormData(p => ({
    ...p, assignments: (p.assignments || []).filter((_, i) => i !== idx)
  }));
  const updateAssignmentUser = (idx, userId) => setFormData(p => ({
    ...p,
    assignments: (p.assignments || []).map((a, i) => i === idx ? { ...a, user_id: userId } : a)
  }));
  const toggleAssignmentService = (idx, svc) => setFormData(p => ({
    ...p,
    assignments: (p.assignments || []).map((a, i) => {
      if (i !== idx) return a;
      const services = a.services.includes(svc) ? a.services.filter(s => s !== svc) : [...a.services, svc];
      return { ...a, services };
    })
  }));

  const toggleService = (s) => {
    setFormData(p => {
      const services = p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s];
      return { ...p, services };
    });
    if (formErrors.services) setFormErrors(prev => ({ ...prev, services: undefined }));
  };

  const addOtherService = () => {
    if (otherService.trim()) {
      setFormData(prev => ({
        ...prev,
        services: [...prev.services.filter(s => !s.startsWith('Other:')), `Other: ${otherService.trim()}`]
      }));
      setOtherService('');
    }
  };

  const getClientAssignments = (client) => {
    if (client?.assignments && client.assignments.length > 0) return client.assignments;
    if (client?.assigned_to) return [{ user_id: client.assigned_to, services: [] }];
    return [];
  };

  // ── REFERRED BY HANDLER ─────────────────────────────────────────────────
  const handleReferrerSelectChange = (val) => {
    setReferrerSelectValue(val);
    if (val === '__other__') {
      setReferrerInput('');
      setFormData(prev => ({ ...prev, referred_by: '' }));
    } else {
      setReferrerInput('');
      setFormData(prev => ({ ...prev, referred_by: val === '' ? '' : val }));
    }
  };

  const handleReferrerInputChange = (val) => {
    setReferrerInput(val);
    setFormData(prev => ({ ...prev, referred_by: val }));
  };

  const handleSaveReferrer = async () => {
    const name = referrerInput.trim();
    if (!name) { toast.error('Please enter a referrer name'); return; }
    const saved = await saveReferrer(name);
    setReferrerSelectValue(saved);
    setReferrerInput('');
    setFormData(prev => ({ ...prev, referred_by: saved }));
    toast.success(`"${saved}" saved to referrer list`);
  };

  // ── REDESIGNED CLIENT CARD WITH ALL INFORMATION VISIBLE ──────────────────
  // Shows all critical info: Name, Email, Mobile, Director, Assigned To, Services, Referred By
  // No horizontal scrolling needed, all buttons fully visible
  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (index >= filteredClients.length || !client) return null;

    const cfg = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
    const avatarGrad = getAvatarGradient(client.company_name);
    const serviceCount = client.services?.length || 0;
    const isArchived = client.status === 'inactive';
    const primaryContact = client.contact_persons?.find(cp => cp.name?.trim());
    const clientAssignments = getClientAssignments(client);
    const locationStr = [client.city, client.state].filter(Boolean).join(', ');

    // DSC expiry check: flag if any DSC expires within 60 days
    const today = new Date();
    const expiringDSC = client.dsc_details?.find(d => {
      if (!d.expiry_date) return false;
      const exp = new Date(d.expiry_date);
      const diff = (exp - today) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 60;
    });

    return (
      <div style={style} className="p-2 box-border">
        <div
          className={`h-full w-full rounded-2xl overflow-hidden flex flex-col group cursor-pointer transition-all duration-200 hover:shadow-lg ${isArchived ? 'opacity-60' : ''} ${isDark?"bg-slate-800":"bg-white"}`}
          style={{
            border: `1.5px solid ${cfg.border}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
          onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}
        >
          {/* ── TOP ACCENT STRIP ── */}
          <div className="h-[4px] w-full flex-shrink-0" style={{ background: `linear-gradient(90deg, ${cfg.strip}, ${cfg.strip}aa)` }} />

          {/* ── CARD HEADER: Avatar + Name + Type pill ── */}
          <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
            <div className="flex items-start gap-2 mb-1">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-sm"
                style={{ background: avatarGrad }}
              >
                {client.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-xs leading-tight break-words ${isDark?"text-slate-100":"text-slate-900"}`}>
                  {client.company_name}
                </h3>
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  <span className={`text-[8px] font-mono ${isDark?"text-slate-500":"text-slate-300"}`}>#{getClientNumber(index)}</span>
                  <TypePill type={client.client_type} customLabel={client.client_type_label} />
                  {isArchived && (
                    <Badge variant="outline" className="text-[7px] bg-amber-50 text-amber-600 border-amber-200 px-1 py-0">
                      ARCHIVED
                    </Badge>
                  )}
                  {expiringDSC && (
                    <Badge variant="outline" className="text-[7px] bg-orange-50 text-orange-600 border-orange-200 px-1 py-0">
                      DSC EXPIRING
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div className="mx-3 h-px flex-shrink-0" style={{ backgroundColor: cfg.border }} />

          {/* ── MAIN INFO SECTION - FULLY VISIBLE ── */}
          <div className="px-3 py-1.5 space-y-0.5 flex-shrink-0 flex-1">
            
            {/* Contact Person / Director */}
            <div className="flex items-start gap-1.5">
              <User className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className={`text-[8px] uppercase tracking-wide font-semibold leading-tight ${isDark?"text-slate-500":"text-slate-400"}`}>Director</p>
                {primaryContact?.name ? (
                  <p className={`text-[10px] font-semibold break-words leading-tight ${isDark?"text-slate-200":"text-slate-700"}`}>
                    {primaryContact.name}
                    {primaryContact.designation && (
                      <span className="text-slate-500 font-normal block text-[8px]">{primaryContact.designation}</span>
                    )}
                  </p>
                ) : (
                  <p className={`text-[10px] italic ${isDark?"text-slate-600":"text-slate-400"}`}>Not specified</p>
                )}
              </div>
            </div>

            {/* Mobile Number */}
            <div className="flex items-start gap-1.5">
              <Phone className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className={`text-[8px] uppercase tracking-wide font-semibold leading-tight ${isDark?"text-slate-500":"text-slate-400"}`}>Mobile</p>
                {client.phone ? (
                  <p className={`text-[10px] font-medium break-words leading-tight ${isDark?"text-slate-200":"text-slate-700"}`}>{client.phone}</p>
                ) : (
                  <p className={`text-[10px] italic ${isDark?"text-slate-600":"text-slate-400"}`}>Not provided</p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-1.5">
              <Mail className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold leading-tight">Email</p>
                {client.email ? (
                  <p className="text-[10px] text-slate-700 break-words leading-tight">{client.email}</p>
                ) : (
                  <p className={`text-[10px] italic ${isDark?"text-slate-600":"text-slate-400"}`}>Not provided</p>
                )}
              </div>
            </div>

            {/* Assigned To */}
            <div className="flex items-start gap-1.5">
              <Briefcase className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold leading-tight">Assigned To</p>
                {clientAssignments.length > 0 ? (
                  <div className="space-y-0.5">
                    {clientAssignments.map((a, i) => {
                      const u = users.find(x => x.id === a.user_id);
                      return u ? (
                        <p key={i} className="text-[9px] text-slate-700 font-medium break-words leading-tight">
                          {u.full_name || u.name}
                          {a.services?.length > 0 && (
                            <span className="text-slate-500 text-[8px] block">{a.services.join(', ')}</span>
                          )}
                        </p>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-400 italic">Unassigned</p>
                )}
              </div>
            </div>

            {/* Services Provided */}
            {serviceCount > 0 && (
              <div className="flex items-start gap-1.5">
                <BarChart3 className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5 leading-tight">Services</p>
                  <div className="flex flex-wrap gap-0.5">
                    {client.services?.map((svc, i) => (
                      <span
                        key={i}
                        className="text-[7px] font-bold px-1 py-0.5 rounded-full border whitespace-normal break-words"
                        style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
                      >
                        {svc.replace('Other: ', '')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Referred By */}
            {client.referred_by && (
              <div className="flex items-start gap-1.5">
                <Share2 className="h-3 w-3 text-slate-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] text-slate-400 uppercase tracking-wide font-semibold leading-tight">Referred By</p>
                  <p className={`text-[10px] font-medium break-words leading-tight ${isDark?"text-slate-200":"text-slate-700"}`}>{client.referred_by}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── ACTION BUTTONS FOOTER ── */}
          <div
            className="flex items-stretch mt-auto border-t flex-shrink-0 gap-0"
            style={{ borderColor: cfg.border }}
          >
            {/* WhatsApp Button */}
            <button
              onClick={(e) => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors border-r"
              style={{ borderColor: cfg.border }}
              title="Send WhatsApp message"
            >
              <MessageCircle className="h-3 w-3" />
              <span className="text-[7px] font-bold tracking-wide">WhatsApp</span>
            </button>

            {/* Edit Button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-blue-600 hover:bg-blue-50 transition-colors"
              style={canDeleteData ? { borderRight: `1px solid ${cfg.border}` } : {}}
              title="Edit client details"
            >
              <Edit className="h-3 w-3" />
              <span className="text-[7px] font-bold tracking-wide">Edit</span>
            </button>

            {/* Delete Button */}
            {canDeleteData && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this client permanently?")) {
                    api.delete(`/clients/${client.id}`).then(() => fetchClients());
                  }
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-red-500 hover:bg-red-50 transition-colors"
                title="Delete client"
              >
                <Trash2 className="h-3 w-3" />
                <span className="text-[7px] font-bold tracking-wide">Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ListRow = ({ index, style }) => {
    const client = filteredClients[index];
    if (!client) return null;
    const cfg = TYPE_CONFIG[client.client_type] || TYPE_CONFIG.proprietor;
    const isArchived = client.status === 'inactive';
    const serviceCount = client.services?.length || 0;
    const clientAssignments = getClientAssignments(client);

    return (
      <div style={style} className="px-1">
        <div
          className={`flex items-center gap-4 px-5 py-3.5 border-b transition-colors group cursor-pointer ${isArchived ? 'opacity-60' : ''} ${isDark?"bg-slate-800 hover:bg-slate-700/60 border-slate-700":"bg-white hover:bg-slate-50/60"}`}
          style={{ borderColor: '#F1F5F9' }}
          onClick={() => { setSelectedClient(client); setDetailDialogOpen(true); }}
        >
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.strip }} />
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: getAvatarGradient(client.company_name) }}>
            {client.company_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="w-56 flex-shrink-0 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-300">#{getClientNumber(index)}</span>
              {isArchived && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Archived</span>}
            </div>
            <p className={`text-sm font-semibold truncate ${isDark?"text-slate-100":"text-slate-900"}`}>{client.company_name}</p>
          </div>
          <div className="w-28 flex-shrink-0"><TypePill type={client.client_type} customLabel={client.client_type_label} /></div>
          <div className="w-36 flex-shrink-0"><p className={`text-xs font-medium ${isDark?"text-slate-300":"text-slate-600"}`}>{client.phone || '—'}</p></div>
          <div className="flex-1 min-w-0"><p className={`text-xs truncate ${isDark?"text-slate-400":"text-slate-500"}`}>{client.email || '—'}</p></div>
          <div className="flex items-center gap-1 w-44 flex-shrink-0">
            {client.services?.slice(0, 2).map((svc, i) => (
              <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-md border"
                style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                {svc.replace('Other: ', '').substring(0, 10)}
              </span>
            ))}
            {serviceCount > 2 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">+{serviceCount - 2}</span>
            )}
          </div>
          <div className="w-32 flex-shrink-0 flex flex-col gap-0.5">
            {clientAssignments.slice(0, 2).map((a, i) => {
              const u = users.find(x => x.id === a.user_id);
              return u ? (
                <span key={i} className="text-[10px] text-slate-500 truncate">
                  {u.full_name || u.name}
                  {a.services?.length > 0 && <span className="text-slate-400"> · {a.services[0]}{a.services.length > 1 ? `+${a.services.length - 1}` : ''}</span>}
                </span>
              ) : null;
            })}
            {clientAssignments.length > 2 && <span className={`text-[10px] ${isDark?"text-slate-500":"text-slate-400"}`}>+{clientAssignments.length - 2} more</span>}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); openWhatsApp(client.phone, client.company_name); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors" title="WhatsApp">
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
              <Edit className="h-3.5 w-3.5" />
            </button>
            {canDeleteData && (
              <button onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this client permanently?")) {
                  api.delete(`/clients/${client.id}`).then(() => fetchClients());
                }
              }} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ClientDetailPopup = () => {
    if (!selectedClient) return null;
    const cfg = TYPE_CONFIG[selectedClient.client_type] || TYPE_CONFIG.proprietor;
    const avatarGrad = getAvatarGradient(selectedClient.company_name);
    const clientAssignments = getClientAssignments(selectedClient);

    return (
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className={`max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-200"}`}>
          <DialogTitle className="sr-only">Client Details</DialogTitle>
          <DialogDescription className="sr-only">View complete client information</DialogDescription>
          <div className="sticky top-0 z-10 bg-gradient-to-r pt-6 px-8 pb-6 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${cfg.bg}, white)` }}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-md" style={{ background: avatarGrad }}>
                {selectedClient.company_name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className={`text-2xl font-bold ${isDark?"text-slate-100":"text-slate-900"}`}>{selectedClient.company_name}</h2>
                  <TypePill type={selectedClient.client_type} customLabel={selectedClient.client_type_label} />
                  {selectedClient.status === 'inactive' && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">Archived</span>
                  )}
                </div>
                {selectedClient.birthday && (
                  <p className="text-sm text-slate-500">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Established: {format(new Date(selectedClient.birthday), 'MMM d, yyyy')}
                  </p>
                )}
                {selectedClient.referred_by && (
                  <p className="text-sm text-slate-500 mt-1">
                    <Share2 className="inline h-3.5 w-3.5 mr-1" />
                    Referred by: <span className="font-medium text-slate-700">{selectedClient.referred_by}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-8 space-y-6">
              <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark?"text-slate-400":"text-slate-600"} mb-4 flex items-center gap-2`}>
                  <Mail className="h-4 w-4" /> Contact Information
                </h3>
                <div className="space-y-3">
                  {selectedClient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <a href={`mailto:${selectedClient.email}`} className="text-blue-600 hover:underline text-sm">{selectedClient.email}</a>
                    </div>
                  )}
                  {selectedClient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <a href={`tel:${selectedClient.phone}`} className="text-slate-700 font-medium text-sm">{selectedClient.phone}</a>
                    </div>
                  )}
                  {selectedClient.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-slate-700 text-sm">
                        <p>{selectedClient.address}</p>
                        {(selectedClient.city || selectedClient.state) && (
                          <p className="text-slate-500 text-xs mt-1">{[selectedClient.city, selectedClient.state].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {selectedClient.services && selectedClient.services.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark?"text-slate-400":"text-slate-600"} mb-4 flex items-center gap-2`}>
                    <BarChart3 className="h-4 w-4" /> Services
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.services.map((svc, i) => (
                      <span key={i} className="text-xs font-semibold px-3 py-2 rounded-xl border"
                        style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                        {svc.replace('Other: ', '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedClient.contact_persons && selectedClient.contact_persons.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark?"text-slate-400":"text-slate-600"} mb-4 flex items-center gap-2`}>
                    <Users className="h-4 w-4" /> Contact Persons ({selectedClient.contact_persons.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.contact_persons.map((cp, i) => (
                      cp.name && (
                        <div key={i} className={`border rounded-xl p-4 ${isDark?"bg-slate-700 border-slate-600":"bg-white border-slate-200"}`}>
                          <p className={`font-semibold text-sm ${isDark?"text-slate-100":"text-slate-900"}`}>{cp.name}</p>
                          {cp.designation && <p className="text-xs text-slate-500 mt-1">{cp.designation}</p>}
                          <div className="flex flex-col gap-1.5 mt-2 text-xs">
                            {cp.email && <a href={`mailto:${cp.email}`} className="text-blue-600 hover:underline">{cp.email}</a>}
                            {cp.phone && <a href={`tel:${cp.phone}`} className="text-slate-700">{cp.phone}</a>}
                            {cp.birthday && <p className="text-slate-500">DOB: {format(new Date(cp.birthday), 'MMM d, yyyy')}</p>}
                            {cp.din && <p className="text-slate-500">DIN: {cp.din}</p>}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {selectedClient.dsc_details && selectedClient.dsc_details.length > 0 && (
                <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark?"text-slate-400":"text-slate-600"} mb-4 flex items-center gap-2`}>
                    <FileCheck className="h-4 w-4" /> DSC Details ({selectedClient.dsc_details.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedClient.dsc_details.map((dsc, i) => (
                      dsc.certificate_number && (
                        <div key={i} className={`border rounded-xl p-4 ${isDark?"bg-slate-700 border-slate-600":"bg-white border-slate-200"}`}>
                          <p className={`font-semibold text-sm ${isDark?"text-slate-100":"text-slate-900"}`}>{dsc.certificate_number}</p>
                          <p className="text-xs text-slate-500 mt-1">Holder: {dsc.holder_name}</p>
                          <div className="flex gap-4 mt-2 text-xs text-slate-600">
                            {dsc.issue_date && <p>Issued: {format(new Date(dsc.issue_date), 'MMM d, yyyy')}</p>}
                            {dsc.expiry_date && <p>Expires: {format(new Date(dsc.expiry_date), 'MMM d, yyyy')}</p>}
                          </div>
                          {dsc.notes && <p className="text-xs text-slate-500 mt-2 italic">{dsc.notes}</p>}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {(clientAssignments.length > 0 || selectedClient.notes) && (
                <div className="grid grid-cols-2 gap-4">
                  {clientAssignments.length > 0 && (
                    <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5 col-span-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3 flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5" /> Staff Assignments
                      </h3>
                      <div className="flex flex-col gap-2">
                        {clientAssignments.map((a, i) => {
                          const u = users.find(x => x.id === a.user_id);
                          if (!u) return null;
                          return (
                            <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-2.5 ${isDark?"bg-slate-700/60 border-slate-600":"bg-white border-slate-100"}`}>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: getAvatarGradient(u.full_name || u.name || '') }}>
                                {(u.full_name || u.name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${isDark?"text-slate-100":"text-slate-900"}`}>{u.full_name || u.name}</p>
                                {a.services && a.services.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {a.services.map((svc, si) => (
                                      <span key={si} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                        style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
                                        {svc}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-400 mt-0.5">All services</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedClient.notes && (
                    <div className="bg-slate-50/60 border border-slate-100 rounded-2xl p-5 col-span-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-3">Notes</h3>
                      <p className="text-sm text-slate-700 leading-relaxed">{selectedClient.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className={`sticky bottom-0 flex items-center justify-between gap-2 p-6 border-t ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-100"}`}>
            <Button type="button" variant="ghost" onClick={() => setDetailDialogOpen(false)} className="h-10 px-5 text-sm rounded-xl text-slate-500">Close</Button>
            <div className="flex gap-2">
              <Button onClick={() => { setDetailDialogOpen(false); openWhatsApp(selectedClient.phone, selectedClient.company_name); }}
                className="h-10 px-4 text-sm rounded-xl text-white gap-2" style={{ background: '#25D366' }}>
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button onClick={() => { setDetailDialogOpen(false); handleEdit(selectedClient); }}
                className="h-10 px-4 text-sm rounded-xl text-white gap-2"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const fieldCls = (hasError) =>
    `h-11 rounded-xl text-sm transition-colors ${hasError ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-50'}`;
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const mdsFieldCls = "h-10 rounded-xl text-sm border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors w-full px-3";

  return (
    <div className={`min-h-screen p-5 md:p-7 space-y-5`} style={{ background: isDark ? '#0f172a' : '#F4F6FA' }}>

      {/* ── PAGE HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 60%, #2a85cc 100%)' }}>
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-1/3 w-64 h-24 opacity-5"
          style={{ background: 'radial-gradient(ellipse, #fff 0%, transparent 70%)' }} />

        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 px-7 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Clients</h1>
              <p className="text-sm text-blue-200 mt-0.5">Central hub for all client relationships</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm">
              <FileText className="h-4 w-4" /> CSV Template
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}
              className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl backdrop-blur-sm">
              {importLoading ? 'Importing…' : 'Import CSV'}
            </Button>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0">
                  <Plus className="h-4 w-4" /> New Client
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-0">
                <div className={`sticky top-0 z-10 border-b px-8 py-5 flex items-center justify-between ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-100"}`}>
                  <div>
                    <DialogTitle className={`text-xl font-bold tracking-tight ${isDark?"text-slate-100":"text-slate-900"}`}>
                      {editingClient ? 'Edit Client Profile' : 'New Client Profile'}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-400 mt-0.5">
                      Complete client information and preferences
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
                    <Switch
                      checked={formData.status === 'active'}
                      onCheckedChange={c => setFormData({...formData, status: c ? 'active' : 'inactive'})}
                    />
                    <span className={`text-xs font-semibold ${formData.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {formData.status === 'active' ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-7">
                  {/* Basic Details */}
                  <div className={`border rounded-2xl p-6 ${isDark?"bg-slate-800/60 border-slate-700":"bg-slate-50/60 border-slate-100"}`}>
                    <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="Basic Details" subtitle="Company identity and primary contact" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Company Name <span className="text-red-400">*</span></label>
                        <Input className={fieldCls(formErrors.company_name)} value={formData.company_name}
                          onChange={e => { setFormData({...formData, company_name: e.target.value}); if (formErrors.company_name) setFormErrors(prev => ({...prev, company_name: undefined})); }} required />
                        {formErrors.company_name && <p className="text-red-500 text-xs mt-1">{formErrors.company_name}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Client Type <span className="text-red-400">*</span></label>
                        <Select value={formData.client_type} onValueChange={v => setFormData({...formData, client_type: v, client_type_other: ''})}>
                          <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {formData.client_type === 'other' && (
                          <div className="mt-2">
                            <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}
                              placeholder="Specify client type (e.g. Section 8 Company, AOP…)"
                              value={formData.client_type_other}
                              onChange={e => setFormData({...formData, client_type_other: e.target.value})} autoFocus />
                            <p className="text-[10px] text-slate-400 mt-1">Describe the entity type for your records</p>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>Email Address <span className="text-slate-400 font-normal">(optional)</span></label>
                        <Input className={fieldCls(formErrors.email)} type="email" value={formData.email}
                          onChange={e => { setFormData({...formData, email: e.target.value}); if (formErrors.email) setFormErrors(prev => ({...prev, email: undefined})); }} />
                        {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Phone Number <span className="text-slate-400 font-normal">(optional)</span></label>
                        <Input className={fieldCls(formErrors.phone)} value={formData.phone}
                          onChange={e => { setFormData({...formData, phone: e.target.value}); if (formErrors.phone) setFormErrors(prev => ({...prev, phone: undefined})); }} />
                        {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Incorporation / Birthday</label>
                        <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`} type="date"
                          value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
                      </div>

                      {/* ── REFERRED BY — with saved referrers + "Other" + save ── */}
                      <div>
                        <label className={labelCls}>Referred By</label>

                        {/* Dropdown */}
                        <div className="relative">
                          <Share2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                          <select
                            className="h-11 bg-white border border-slate-200 focus:border-blue-400 rounded-xl text-sm pl-10 pr-4 w-full appearance-none outline-none transition-colors cursor-pointer"
                            value={referrerSelectValue}
                            onChange={e => handleReferrerSelectChange(e.target.value)}
                          >
                            <option value="">— Select referral source —</option>
                            <option value="Our Client">Our Client</option>
                            {savedReferrers
                              .filter(r => r !== 'Our Client')
                              .map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))
                            }
                            <option value="__other__">+ Other</option>
                          </select>
                        </div>

                        {/* Free-text input shown only when "+ Other" is selected */}
                        {referrerSelectValue === '__other__' && (
                          <div className="flex gap-2 mt-2">
                            <Input
                              className={`flex-1 h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}
                              placeholder="Type referrer's name…"
                              value={referrerInput}
                              onChange={e => handleReferrerInputChange(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveReferrer(); } }}
                              autoFocus
                            />
                            <Button
                              type="button"
                              onClick={handleSaveReferrer}
                              className="h-11 px-4 rounded-xl text-white text-sm font-semibold flex-shrink-0 gap-1.5 shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                              title="Save to referrer list"
                            >
                              <Plus className="h-4 w-4" />
                              Save
                            </Button>
                          </div>
                        )}

                        {/* Helper text */}
                        {referrerSelectValue === '__other__' && (
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            Press <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-mono">Enter</kbd> or click Save — name will appear in dropdown next time
                          </p>
                        )}
                        {referrerSelectValue && referrerSelectValue !== '__other__' && referrerSelectValue !== '' && (
                          <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {referrerSelectValue}
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Address</label>
                        <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`} placeholder="Street address (optional)"
                          value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelCls}>City</label>
                        <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`} placeholder="City (optional)"
                          value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                      </div>
                      <div>
                        <label className={labelCls}>State</label>
                        <Input className={`h-11 focus:border-blue-400 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`} placeholder="State (optional)"
                          value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  {/* Contact Persons */}
                  <div className={`border rounded-2xl p-6 ${isDark?"bg-slate-800/60 border-slate-700":"bg-slate-50/60 border-slate-100"}`}>
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeading icon={<Users className="h-4 w-4" />} title="Contact Persons" subtitle="Key people you work with" />
                      <Button type="button" size="sm" onClick={addContact} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                        <Plus className="h-3 w-3 mr-1" /> Add Person
                      </Button>
                    </div>
                    {formErrors.contacts && (
                      <p className="text-red-500 text-xs mb-4 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.contacts}
                      </p>
                    )}
                    <div className="space-y-4">
                      {formData.contact_persons.map((cp, idx) => (
                        <div key={idx} className={`border rounded-xl p-5 relative ${isDark?"bg-slate-800 border-slate-600":"bg-white border-slate-200"}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                              <span className="text-sm font-semibold text-slate-700">Contact Person</span>
                            </div>
                            {formData.contact_persons.length > 1 && (
                              <button type="button" onClick={() => removeContact(idx)}
                                className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className={labelCls}>Full Name</label>
                              <Input value={cp.name} onChange={e => updateContact(idx, 'name', e.target.value)} className={fieldCls(contactErrors[idx]?.name)} />
                              {contactErrors[idx]?.name && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].name}</p>}
                            </div>
                            <div>
                              <label className={labelCls}>Designation</label>
                              <Input value={cp.designation} onChange={e => updateContact(idx, 'designation', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div>
                              <label className={labelCls}>Email</label>
                              <Input type="email" value={cp.email} onChange={e => updateContact(idx, 'email', e.target.value)} className={fieldCls(contactErrors[idx]?.email)} />
                              {contactErrors[idx]?.email && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].email}</p>}
                            </div>
                            <div>
                              <label className={labelCls}>Phone</label>
                              <Input value={cp.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className={fieldCls(contactErrors[idx]?.phone)} />
                              {contactErrors[idx]?.phone && <p className="text-red-500 text-xs mt-1">{contactErrors[idx].phone}</p>}
                            </div>
                            <div>
                              <label className={labelCls}>Birthday</label>
                              <Input type="date" value={cp.birthday || ''} onChange={e => updateContact(idx, 'birthday', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div>
                              <label className={labelCls}>DIN (Director ID)</label>
                              <Input value={cp.din || ''} onChange={e => updateContact(idx, 'din', e.target.value)} className={fieldCls(false)} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DSC Details */}
                  <div className={`border rounded-2xl p-6 ${isDark?"bg-slate-800/60 border-slate-700":"bg-slate-50/60 border-slate-100"}`}>
                    <div className="flex items-center justify-between mb-5">
                      <SectionHeading icon={<FileText className="h-4 w-4" />} title="DSC Details" subtitle="Digital Signature Certificates" />
                      <Button type="button" size="sm" onClick={addDSC} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                        <Plus className="h-3 w-3 mr-1" /> Add DSC
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {formData.dsc_details.map((dsc, idx) => (
                        <div key={idx} className={`border rounded-xl p-5 relative ${isDark?"bg-slate-800 border-slate-600":"bg-white border-slate-200"}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                              <span className="text-sm font-semibold text-slate-700">DSC Certificate</span>
                            </div>
                            {formData.dsc_details.length > 1 && (
                              <button type="button" onClick={() => removeDSC(idx)}
                                className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className={labelCls}>Certificate Number</label>
                              <Input value={dsc.certificate_number} onChange={e => updateDSC(idx, 'certificate_number', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div>
                              <label className={labelCls}>Holder Name</label>
                              <Input value={dsc.holder_name} onChange={e => updateDSC(idx, 'holder_name', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div>
                              <label className={labelCls}>Issue Date</label>
                              <Input type="date" value={dsc.issue_date || ''} onChange={e => updateDSC(idx, 'issue_date', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div>
                              <label className={labelCls}>Expiry Date</label>
                              <Input type="date" value={dsc.expiry_date || ''} onChange={e => updateDSC(idx, 'expiry_date', e.target.value)} className={fieldCls(false)} />
                            </div>
                            <div className="md:col-span-2">
                              <label className={labelCls}>Notes</label>
                              <Textarea value={dsc.notes || ''} onChange={e => updateDSC(idx, 'notes', e.target.value)}
                                className={`min-h-[80px] rounded-xl text-sm resize-y ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Services */}
                  <div className={`border rounded-2xl p-6 ${isDark?"bg-slate-800/60 border-slate-700":"bg-slate-50/60 border-slate-100"}`}>
                    <SectionHeading icon={<BarChart3 className="h-4 w-4" />} title="Services" subtitle="Select all applicable services" />
                    {formErrors.services && (
                      <p className="text-red-500 text-xs mb-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block" />{formErrors.services}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {SERVICES.map(s => {
                        const isSelected = formData.services.includes(s) || (s === 'Other' && formData.services.some(x => x.startsWith('Other:')));
                        return (
                          <button key={s} type="button" onClick={() => toggleService(s)}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-xl border transition-all ${isSelected ? 'text-white border-transparent shadow-sm' : isDark?'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500':'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                            style={isSelected ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)', borderColor: 'transparent' } : {}}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {formData.services.includes('Other') && (
                      <div className="flex gap-3 items-end max-w-sm mt-4">
                        <div className="flex-1">
                          <label className={labelCls}>Specify Other Service</label>
                          <Input placeholder="e.g. IEC Registration" value={otherService}
                            onChange={e => setOtherService(e.target.value)} className="h-10 rounded-xl text-sm border-slate-200" />
                        </div>
                        <Button type="button" size="sm" onClick={addOtherService}
                          className="h-10 px-5 rounded-xl text-sm" style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                          Add
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className={labelCls}>Internal Notes</label>
                    <Textarea className={`min-h-[110px] rounded-xl text-sm resize-y focus:border-blue-400 ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}
                      placeholder="Internal remarks, preferences, or special instructions…"
                      value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                  </div>

                  {/* Staff Assignments */}
                  {canAssignClients && (
                    <div className={`border rounded-2xl p-6 ${isDark?"bg-slate-800/60 border-slate-700":"bg-slate-50/60 border-slate-100"}`}>
                      <div className="flex items-center justify-between mb-5">
                        <SectionHeading icon={<Briefcase className="h-4 w-4" />} title="Staff Assignments" subtitle="Assign staff members with specific services" />
                        <Button type="button" size="sm" onClick={addAssignment} variant="outline" className="h-8 px-3 text-xs rounded-xl border-slate-200 -mt-2">
                          <Plus className="h-3 w-3 mr-1" /> Add Staff
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {(formData.assignments || []).map((assignment, idx) => (
                          <div key={idx} className={`border rounded-xl p-5 ${isDark?"bg-slate-700 border-slate-600":"bg-white border-slate-200"}`}>
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                                <span className="text-sm font-semibold text-slate-700">Assignment</span>
                              </div>
                              {(formData.assignments || []).length > 1 && (
                                <button type="button" onClick={() => removeAssignment(idx)}
                                  className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                  <Trash className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="mb-4">
                              <label className={labelCls}>Staff Member</label>
                              <Select
                                value={assignment.user_id || 'unassigned'}
                                onValueChange={v => updateAssignmentUser(idx, v === 'unassigned' ? '' : v)}
                              >
                                <SelectTrigger className={`h-11 rounded-xl text-sm ${isDark?"bg-slate-700 border-slate-600 text-slate-100":"bg-white border-slate-200"}`}>
                                  <SelectValue placeholder="Select team member" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">— Unassigned —</SelectItem>
                                  {users
                                    .filter(u => {
                                      const otherAssignedIds = (formData.assignments || [])
                                        .filter((_, i) => i !== idx)
                                        .map(a => a.user_id)
                                        .filter(Boolean);
                                      if (otherAssignedIds.includes(u.id)) return false;

                                      const SERVICE_TO_DEPT = {
                                        GST: 'GST',
                                        'Income Tax': 'IT',
                                        Accounting: 'ACC',
                                        TDS: 'TDS',
                                        ROC: 'ROC',
                                        Trademark: 'TM',
                                        Audit: 'ACC',
                                        Compliance: 'ROC',
                                        'Company Registration': 'ROC',
                                        'Tax Planning': 'IT',
                                        Payroll: 'ACC',
                                      };

                                      const clientDepts = [
                                        ...new Set(
                                          (formData.services || [])
                                            .map(s => SERVICE_TO_DEPT[s])
                                            .filter(Boolean)
                                        ),
                                      ];

                                      if (clientDepts.length === 0) return true;

                                      const userDepts = u.departments || [];
                                      return userDepts.some(d => clientDepts.includes(d));
                                    })
                                    .map(u => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {u.full_name || u.name || u.email}
                                        {u.departments?.length > 0 && (
                                          <span className="text-xs text-slate-400 ml-1">
                                            · {u.departments.join(', ')}
                                          </span>
                                        )}
                                      </SelectItem>
                                    ))
                                  }
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className={labelCls}>Services for this staff member <span className="text-slate-300 font-normal">(optional — leave blank for all)</span></label>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {formData.services.filter(s => !s.startsWith('Other:') || s).map(svc => {
                                  const displaySvc = svc.startsWith('Other:') ? svc.replace('Other: ', '') : svc;
                                  const isSelected = assignment.services.includes(svc);
                                  return (
                                    <button key={svc} type="button" onClick={() => toggleAssignmentService(idx, svc)}
                                      className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${isSelected ? 'text-white border-transparent shadow-sm' : isDark?'bg-slate-700 text-slate-300 border-slate-600 hover:border-slate-500':'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                                      style={isSelected ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)', borderColor: 'transparent' } : {}}>
                                      {displaySvc}
                                    </button>
                                  );
                                })}
                                {formData.services.length === 0 && (
                                  <p className="text-xs text-slate-400 italic">Select services above first to assign specific ones here</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t ${isDark?"border-slate-700":"border-slate-100"}`}>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="h-9 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
                      <Button type="button" variant="outline" onClick={downloadTemplate} className="h-9 px-4 text-sm rounded-xl border-slate-200 text-slate-600">CSV Template</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                        onClick={() => fileInputRef.current?.click()}>Import CSV</Button>
                      <Button type="button" variant="outline" className="h-9 px-4 text-sm rounded-xl border-slate-200"
                        disabled={importLoading} onClick={() => excelInputRef.current?.click()}>Import Master Data</Button>
                      <Button type="submit" disabled={loading}
                        className="h-9 px-6 text-sm rounded-xl text-white font-semibold shadow-sm"
                        style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                        {loading ? 'Saving…' : editingClient ? 'Update Client' : 'Create Client'}
                      </Button>
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Today's Celebrations ── */}
      {canViewAllClients && todayReminders.length > 0 && (
        <div className={`flex items-center gap-5 border border-pink-200 rounded-2xl p-5 shadow-sm ${isDark?"bg-slate-800":"bg-white"}`}
          style={{ background: 'linear-gradient(135deg, #fff0f6, #fff5f0)' }}>
          <div className={`w-11 h-11 rounded-xl shadow-sm text-pink-500 flex items-center justify-center flex-shrink-0 ${isDark ? "bg-slate-700" : "bg-white"}`}>
            <Cake className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-pink-900 mb-2">🎉 Today's Celebrations</p>
            <div className="flex flex-wrap gap-2">
              {todayReminders.map(c => (
                <span key={c.id} className={`text-xs font-medium px-3 py-1 border border-pink-200 rounded-full shadow-sm ${isDark?"bg-slate-700 text-pink-400":"bg-white text-pink-700"}`}>
                  {c.company_name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Cards ── */}
      {canViewAllClients && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Clients', value: stats.totalClients, icon: <Users className="h-5 w-5" />, iconBg: 'rgba(13,59,102,0.1)', iconColor: '#0D3B66', bar: '#1F6FB2' },
            { label: 'Active', value: stats.activeClients, icon: <Briefcase className="h-5 w-5" />, iconBg: 'rgba(31,175,90,0.1)', iconColor: '#1FAF5A', bar: '#059669' },
            { label: 'Archived', value: stats.totalClients - stats.activeClients, icon: <Archive className="h-5 w-5" />, iconBg: 'rgba(245,158,11,0.1)', iconColor: '#D97706', bar: '#D97706' },
            { label: 'Top Service', value: Object.entries(stats.serviceCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'N/A', icon: <BarChart3 className="h-5 w-5" />, iconBg: 'rgba(124,58,237,0.1)', iconColor: '#7c3aed', bar: '#7c3aed', isText: true },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl border p-5 hover:shadow-md transition-all hover:-translate-y-0.5 relative overflow-hidden ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-100"}`}
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: s.bar }} />
              <div className="flex items-start justify-between mb-3 pl-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: s.iconBg, color: s.iconColor }}>{s.icon}</div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 pl-2">{s.label}</p>
              <p className={`font-bold pl-2 ${s.isText ? 'text-base truncate' : 'text-3xl tracking-tight'} ${isDark?"text-slate-100":"text-slate-900"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters + View Toggle ── */}
      <div className={`flex flex-col sm:flex-row gap-3 p-3.5 rounded-2xl border shadow-sm ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-100"}`}>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search by company, email or phone…"
            className={`pl-11 h-10 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark?"bg-slate-700 text-slate-100 placeholder:text-slate-400":"bg-slate-50"}`}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap items-center">
          {filteredClients.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl p-1">
              <button
                onClick={() => openBulkMsg('whatsapp')}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-all text-xs font-semibold"
                title={`Send WhatsApp to ${filteredClients.length} client${filteredClients.length !== 1 ? 's' : ''}`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
                <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {filteredClients.length}
                </span>
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <button
                onClick={() => openBulkMsg('email')}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-blue-700 hover:bg-blue-50 transition-all text-xs font-semibold"
                title={`Email ${filteredClients.length} client${filteredClients.length !== 1 ? 's' : ''}`}
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Email</span>
                <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {filteredClients.length}
                </span>
              </button>
            </div>
          )}

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={`h-10 w-[120px] border-none rounded-xl text-sm ${isDark?"bg-slate-700 text-slate-100":"bg-slate-50"}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
              <SelectItem value="all">All Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={clientTypeFilter} onValueChange={setClientTypeFilter}>
            <SelectTrigger className={`h-10 w-[130px] border-none rounded-xl text-sm ${isDark?"bg-slate-700 text-slate-100":"bg-slate-50"}`}><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {CLIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className={`h-10 w-[150px] border-none rounded-xl text-sm ${isDark?"bg-slate-700 text-slate-100":"bg-slate-50"}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {canAssignClients && users.length > 0 && (
            <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
              <SelectTrigger className={`h-10 w-[160px] border-none rounded-xl text-sm ${isDark?"bg-slate-700 text-slate-100":"bg-slate-50"}`}><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className={`h-10 px-4 flex items-center rounded-xl text-xs font-semibold border whitespace-nowrap ${isDark?"bg-slate-700 text-slate-400 border-slate-600":"bg-slate-50 text-slate-500 border-slate-100"}`}>
            {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
          </div>
          <div className={`flex items-center border rounded-xl p-1 gap-0.5 ${isDark?"bg-slate-700 border-slate-600":"bg-slate-50 border-slate-100"}`}>
            <button onClick={() => setViewMode('board')}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'board' ? (isDark?'bg-slate-600 shadow-sm text-slate-100':'bg-white shadow-sm text-slate-700') : 'text-slate-400 hover:text-slate-600'}`}
              title="Board view"><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('list')}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? (isDark?'bg-slate-600 shadow-sm text-slate-100':'bg-white shadow-sm text-slate-700') : 'text-slate-400 hover:text-slate-600'}`}
              title="List view"><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Client Grid / List ── */}
      <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm" style={{ height: '70vh', minHeight: '480px', background: isDark ? '#1e293b' : 'white' }}>
        {filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 ${isDark?"bg-slate-700 border-slate-600":"bg-slate-50 border-slate-100"}`}>
              <Users className="h-7 w-7 opacity-30" />
            </div>
            <p className="text-base font-semibold text-slate-500">No clients match your filters</p>
            <p className="mt-1 text-sm text-slate-400">Try changing your search term or filters</p>
          </div>
        ) : viewMode === 'board' ? (
          <AutoSizer>
            {({ height, width }) => {
              const CARD_MIN = 310;
              const columnCount = Math.max(1, Math.floor(width / CARD_MIN));
              const columnWidth = Math.floor(width / columnCount);
              const rowCount = Math.ceil(filteredClients.length / columnCount);
              return (
                <Grid
                  columnCount={columnCount}
                  columnWidth={columnWidth}
                  height={height}
                  rowCount={rowCount}
                  rowHeight={420}
                  width={width}
                  overscanColumnCount={2}
                  overscanRowCount={4}
                >
                  {({ columnIndex, rowIndex, style }) => (
                    <ClientCard columnIndex={columnIndex} rowIndex={rowIndex} style={style} columnCount={columnCount} />
                  )}
                </Grid>
              );
            }}
          </AutoSizer>
        ) : (
          <div className="h-full flex flex-col">
            <div className={`flex items-center gap-4 px-5 py-3 border-b flex-shrink-0 ${isDark?"bg-slate-700/60 border-slate-600":"bg-slate-50 border-slate-100"}`}>
              <div className="w-1 flex-shrink-0" />
              <div className="w-8 flex-shrink-0" />
              <div className="w-56 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Company</div>
              <div className="w-28 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</div>
              <div className="w-36 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Phone</div>
              <div className="flex-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Email</div>
              <div className="w-44 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Services</div>
              <div className="w-32 flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Assigned</div>
              <div className="w-24 flex-shrink-0" />
            </div>
            <div className="flex-1">
              <AutoSizer>
                {({ height, width }) => (
                  <FixedSizeList height={height} width={width} itemCount={filteredClients.length} itemSize={56}>
                    {({ index, style }) => <ListRow index={index} style={style} />}
                  </FixedSizeList>
                )}
              </AutoSizer>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ClientDetailPopup />

      <BulkMessageModal
        open={bulkMsgOpen}
        onClose={() => setBulkMsgOpen(false)}
        mode={bulkMsgMode}
        filteredClients={filteredClients}
      />

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />
      <input type="file" ref={excelInputRef} accept=".xlsx,.xls" onChange={handleImportExcel} className="hidden" />

      {/* Generic Excel Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 shadow-2xl">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className={`text-lg font-bold ${isDark?"text-slate-100":"text-slate-900"}`}>Review Excel Import</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">Preview and confirm data before bulk import</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 rounded-xl border border-slate-100">
            <table className="min-w-full text-xs">
              <thead className={`sticky top-0 border-b ${isDark?"bg-slate-700 border-slate-600":"bg-slate-50 border-slate-100"}`}>
                <tr>
                  {previewHeaders.map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex} className={`transition-colors ${isDark?"hover:bg-slate-700/30":"hover:bg-slate-50"}`}>
                    {previewHeaders.map(header => (
                      <td key={header} className="p-2">
                        <Input value={row[header] || ''} onChange={e => {
                          const updated = [...previewData]; updated[rowIndex][header] = e.target.value; setPreviewData(updated);
                        }} className="h-8 text-xs rounded-lg border-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">{previewData.length} rows ready to import</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)} className="h-9 px-4 text-sm rounded-xl border-slate-200">Cancel</Button>
              <Button className="h-9 px-5 text-sm rounded-xl text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
                onClick={async () => {
                  setImportLoading(true);
                  let success = 0;
                  for (let row of previewData) {
                    const exists = clients.find(c => c.company_name?.toLowerCase().trim() === row.company_name?.toLowerCase().trim());
                    if (exists) { console.log("Skipping duplicate:", row.company_name); continue; }
                    try {
                      await api.post('/clients', {
                        company_name: row.company_name?.trim(),
                        client_type: ['proprietor','pvt_ltd','llp','partnership','huf','trust','other'].includes(row.client_type) ? row.client_type : 'proprietor',
                        client_type_label: row.client_type === 'other' ? (row.client_type_label?.trim() || null) : null,
                        email: row.email?.trim(),
                        phone: row.phone?.replace(/\D/g, ""),
                        birthday: row.birthday || null,
                        address: row.address?.trim() || null,
                        city: row.city?.trim() || null,
                        state: row.state?.trim() || null,
                        services: row.services ? row.services.split(',').map(s => s.trim()) : [],
                        notes: row.notes?.trim() || null,
                        status: row.status || 'active',
                        referred_by: row.referred_by?.trim() || null,
                        assigned_to: null, assignments: [],
                        contact_persons: [1, 2, 3].reduce((acc, n) => {
                          const name = row[`contact_name_${n}`]?.trim();
                          if (name) {
                            acc.push({
                              name,
                              designation: row[`contact_designation_${n}`]?.trim() || null,
                              email: row[`contact_email_${n}`]?.trim() || null,
                              phone: row[`contact_phone_${n}`]?.replace(/\D/g, '') || null,
                              birthday: row[`contact_birthday_${n}`] || null,
                              din: row[`contact_din_${n}`]?.trim() || null,
                            });
                          }
                          return acc;
                        }, []),
                        dsc_details: [],
                      });
                      success++;
                    } catch (err) { console.error(err); }
                  }
                  toast.success(`${success} clients imported successfully`);
                  fetchClients(); setPreviewOpen(false); setImportLoading(false);
                }}>
                Confirm & Import All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MDS Excel Smart Preview Dialog */}
      <Dialog open={mdsPreviewOpen} onOpenChange={(open) => { if (!open) { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 shadow-2xl p-0 bg-white">
          <div className={`sticky top-0 z-10 border-b px-7 py-5 ${isDark?"bg-slate-800 border-slate-700":"bg-white border-slate-100"}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className={`text-lg font-bold ${isDark?"text-slate-100":"text-slate-900"}`}>MCA / MDS Data Preview</DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Review and edit the parsed data before saving
                  {mdsData?.sheets_parsed && (
                    <span className="ml-2 text-blue-500 font-medium">
                      · {mdsData.sheets_parsed.length} sheet{mdsData.sheets_parsed.length !== 1 ? 's' : ''} parsed
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>

          {mdsPreviewLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Parsing Excel sheets…</p>
              <p className="text-xs text-slate-400">Reading company info, directors, and charges</p>
            </div>
          )}

          {!mdsPreviewLoading && mdsForm && (
            <div className="p-7 space-y-6">
              <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs"
                    style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    <Briefcase className="h-3.5 w-3.5" />
                  </div>
                  <h4 className={`text-sm font-semibold ${isDark?"text-slate-200":"text-slate-800"}`}>Company Details</h4>
                  <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    style={mdsForm.status === 'active'
                      ? { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }
                      : { background: '#fffbeb', color: '#92400e', borderColor: '#fde68a' }}>
                    {mdsForm.status === 'active' ? '● Active' : '● Archived'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Company Name</label>
                    <input className={mdsFieldCls} value={mdsForm.company_name}
                      onChange={e => setMdsForm(f => ({ ...f, company_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Client Type</label>
                    <select className={`${mdsFieldCls} appearance-none`} value={mdsForm.client_type}
                      onChange={e => setMdsForm(f => ({ ...f, client_type: e.target.value }))}>
                      {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Incorporation Date</label>
                    <input type="date" className={mdsFieldCls} value={mdsForm.birthday}
                      onChange={e => setMdsForm(f => ({ ...f, birthday: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={mdsFieldCls} value={mdsForm.email}
                      onChange={e => setMdsForm(f => ({ ...f, email: e.target.value }))} placeholder="Enter email address" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input className={mdsFieldCls} value={mdsForm.phone}
                      onChange={e => setMdsForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit phone number" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Address</label>
                    <input className={mdsFieldCls} value={mdsForm.address || ''}
                      onChange={e => setMdsForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>City</label>
                    <input className={mdsFieldCls} value={mdsForm.city || ''}
                      onChange={e => setMdsForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <input className={mdsFieldCls} value={mdsForm.state || ''}
                      onChange={e => setMdsForm(f => ({ ...f, state: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Referred By</label>
                    <input className={mdsFieldCls} value={mdsForm.referred_by || ''}
                      onChange={e => setMdsForm(f => ({ ...f, referred_by: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={labelCls}>Services</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SERVICES.map(s => {
                      const sel = mdsForm.services?.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => setMdsForm(f => ({
                            ...f, services: sel ? f.services.filter(x => x !== s) : [...(f.services || []), s]
                          }))}
                          className={`px-3 py-1 text-xs font-semibold rounded-xl border transition-all ${sel ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                          style={sel ? { background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' } : {}}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className={`border rounded-2xl p-5 ${isDark?"bg-slate-700/40 border-slate-600":"bg-slate-50/60 border-slate-100"}`}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs"
                      style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Directors / Contact Persons
                      <span className="ml-2 text-[10px] font-normal text-slate-400">
                        ({mdsForm.contact_persons.filter(c => c.name?.trim()).length} parsed)
                      </span>
                    </h4>
                  </div>
                  <button type="button"
                    onClick={() => setMdsForm(f => ({
                      ...f, contact_persons: [...f.contact_persons, { name: '', designation: '', email: '', phone: '', birthday: '', din: '' }]
                    }))}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="space-y-3">
                  {mdsForm.contact_persons.map((cp, idx) => (
                    <div key={idx} className={`border rounded-xl p-4 ${isDark?"bg-slate-700 border-slate-600":"bg-white border-slate-200"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center">{idx + 1}</div>
                          <span className="text-xs font-semibold text-slate-600">{cp.name || `Contact ${idx + 1}`}</span>
                        </div>
                        <button type="button"
                          onClick={() => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.filter((_, i) => i !== idx) }))}
                          className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Name</label>
                          <input className={mdsFieldCls} value={cp.name}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, name: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Designation</label>
                          <input className={mdsFieldCls} value={cp.designation}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, designation: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>DIN / PAN</label>
                          <input className={mdsFieldCls} value={cp.din || ''}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, din: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Email</label>
                          <input type="email" className={mdsFieldCls} value={cp.email || ''} placeholder="Optional"
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, email: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Phone</label>
                          <input className={mdsFieldCls} value={cp.phone || ''} placeholder="Optional"
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, phone: e.target.value } : c) }))} />
                        </div>
                        <div>
                          <label className={labelCls}>Birthday</label>
                          <input type="date" className={mdsFieldCls} value={cp.birthday || ''}
                            onChange={e => setMdsForm(f => ({ ...f, contact_persons: f.contact_persons.map((c, i) => i === idx ? { ...c, birthday: e.target.value } : c) }))} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  className={`w-full min-h-[90px] border focus:border-blue-400 focus:ring-1 focus:ring-blue-100 rounded-xl text-sm p-3 resize-y outline-none transition-colors ${isDark ? "bg-slate-700 border-slate-600 text-slate-100" : "bg-white border-slate-200"}`}
                  value={mdsForm.notes}
                  onChange={e => setMdsForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {mdsData?.raw_company_info && Object.keys(mdsData.raw_company_info).length > 0 && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button type="button" onClick={() => setMdsRawInfoOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left ${isDark?"bg-slate-700 hover:bg-slate-600":"bg-slate-50 hover:bg-slate-100"}`}>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">Raw Excel Data</span>
                      <span className={`text-[10px] ${isDark?"text-slate-500":"text-slate-400"}`}>({Object.keys(mdsData.raw_company_info).length} fields extracted)</span>
                    </div>
                    {mdsRawInfoOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </button>
                  {mdsRawInfoOpen && (
                    <div className={`p-4 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto ${isDark?"bg-slate-800":"bg-white"}`}>
                      {Object.entries(mdsData.raw_company_info).map(([key, val]) => (
                        <div key={key} className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded-lg ${isDark?"hover:bg-slate-700":"hover:bg-slate-50"}`}>
                          <span className="text-slate-400 font-medium min-w-[120px] flex-shrink-0">{key}</span>
                          <span className="text-slate-700 font-medium break-all">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <Button type="button" variant="ghost"
                  onClick={() => { setMdsPreviewOpen(false); setMdsData(null); setMdsForm(null); }}
                  className="h-10 px-4 text-sm rounded-xl text-slate-500">Cancel</Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => handleMdsConfirm(false)}
                    className="h-10 px-5 text-sm rounded-xl border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 gap-2">
                    <Edit className="h-4 w-4" /> Open in Full Form
                  </Button>
                  <Button type="button" disabled={importLoading} onClick={() => handleMdsConfirm(true)}
                    className="h-10 px-6 text-sm rounded-xl text-white font-semibold gap-2"
                    style={{ background: importLoading ? '#94a3b8' : 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                    <CheckCircle2 className="h-4 w-4" />
                    {importLoading ? 'Saving…' : 'Save Client'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
